import type * as Discord from "discord.js";
import { DiceOutputType, DiceSecretMethodType, DiscordDice, TDiceOutput, type GameType } from "../../../sage-dice";
import { NEWLINE } from "../../../sage-pf2e";
import type { Optional } from "../../../sage-utils";
import { randomItem } from "../../../sage-utils/utils/RandomUtils";
import { dequote, isNotBlank, redactCodeBlocks, Tokenizer } from "../../../sage-utils/utils/StringUtils";
import type { DUser, TChannel, TCommandAndArgsAndData } from "../../discord";
import { DiscordId, MessageType } from "../../discord";
import { createMessageEmbed } from "../../discord/embeds";
import { registerMessageListener } from "../../discord/handlers";
import { authorToMention, sendTo } from "../../discord/messages";
import { ColorType } from "../model/HasColorsCore";
import type NamedCollection from "../model/NamedCollection";
import SageInteraction from "../model/SageInteraction";
import SageMessage from "../model/SageMessage";
import type { TMacro } from "../model/User";
import { registerInlineHelp } from "./help";

type TInteraction = SageMessage | SageInteraction;

type TGmChannel = Optional<TChannel | DUser>;

// type TDiceOutput = {
// 	hasSecret: boolean;
// 	inlineOutput: string;
// 	input: string,
// 	output: string;
// };

export enum DicePostType { SinglePost = 0, SingleEmbed = 1, MultiplePosts = 2, MultipleEmbeds = 3 }
// export enum DiceSecretMethodType { Ignore = 0, Hide = 1, GameMasterChannel = 2, GameMasterDirect = 3 }
type TFormattedDiceOutput = {
	hasSecret: boolean;
	postContent?: string;
	embedContent?: string;
	notificationContent: string;
};

type TDiscordDiceParseOptions = {
	gameType?: GameType;
	diceOutputType?: DiceOutputType;
	critMethodType?: number;
	diceSecretMethodType?: DiceSecretMethodType;
};

type TDiceMatch = {
	match: string;
	index: number;
	inline: boolean;
	output: TDiceOutput[];
};

//#region unified bracket command tests

//#region parse and map

const BASE_REGEX = /\[+[^\]]+\]+/ig;
const MATH_REGEX = /\[[ \d\+\-\*\/\(\)\^]+[\+\-\*\/\^]+[ \d\+\-\*\/\(\)\^]+\]/i;
const RANDOM_REGEX = /\[(\d+[usgm]*#)?([^,\]]+)(,([^,\]]+))+\]/i;

function parseDiscordDice(sageMessage: TInteraction, diceString: string, overrides?: TDiscordDiceParseOptions): DiscordDice | null {
	if (!diceString) {
		return null;
	}

	const pc = sageMessage.playerCharacter;
	if (pc) {
		diceString = diceString.replace(/\{stat\:([^\}]+)\}/i, match => {
			const stat = match.slice(6, -1);
			const note = pc.notes.getStat(stat);
			return String(+(note?.note ?? "0"));
		});
	}

	return DiscordDice.parse({
		diceString: diceString,
		defaultGameType: overrides?.gameType ?? sageMessage.gameType,
		defaultDiceOutputType: overrides?.diceOutputType ?? sageMessage.diceOutputType,
		defaultCritMethodType: overrides?.critMethodType ?? sageMessage.critMethodType,
		defaultDiceSecretMethodType: overrides?.diceSecretMethodType ?? sageMessage.diceSecretMethodType
	});
}

function parseDiscordMacro(sageMessage: SageMessage, macroString: string): DiscordDice | null {
	let diceString = macroString;
	const macroNames = <string[]>[];
	let macroAndOutput: TMacroAndOutput | null;
	while (macroAndOutput = macroToDice(sageMessage.sageUser.macros, debrace(diceString))) {
		if (macroNames.includes(macroAndOutput.macro.name)) {
			console.error(`MACRO RECURSION: User(${sageMessage.sageUser.id}) ${macroNames.join(" > ")} > ${macroAndOutput.macro.name}`)
			return parseDiscordDice(sageMessage, `[1d1 MACRO RECURSION: ${macroNames.join(" > ")} > ${macroAndOutput.macro.name}]`);
		}
		macroNames.push(macroAndOutput.macro.name);
		diceString = macroAndOutput.output;
	}
	return parseDiscordDice(sageMessage, diceString, { diceOutputType: DiceOutputType.XXL });
}

/** Removes all braces: [] or [[]]  */
function debrace(input: string): string {
	while (input.startsWith("[") && input.endsWith("]")) {
		input = input.slice(1, -1);
	}
	return input;
}

function parseMatch(sageMessage: TInteraction, match: string): TDiceOutput[] {
	const noBraces = debrace(match);
	if (sageMessage instanceof SageMessage) {
		const macro = parseDiscordMacro(sageMessage, noBraces);
		if (macro) {
			// console.log("macro", match);
			return macro.roll().toStrings(sageMessage.diceOutputType);
		}
	}
	const dice = parseDiscordDice(sageMessage, `[${noBraces}]`);
	if (dice) {
		// console.log("dice", match);
		return dice.roll().toStrings(sageMessage.diceOutputType);
	}
	if (match.match(RANDOM_REGEX)) {
		// console.log("simple", match);
		return doSimple(sageMessage, noBraces);
	}
	if (match.match(MATH_REGEX)) {
		// console.log("math", match);
		return doMath(sageMessage, noBraces);
	}
	return [];
}

export function parseDiceMatches(sageMessage: TInteraction, content: string): TDiceMatch[] {
	const diceMatches: TDiceMatch[] = [];
	const withoutCodeBlocks = redactCodeBlocks(content);
	let execArray: RegExpExecArray | null;
	while (execArray = BASE_REGEX.exec(withoutCodeBlocks)) {
		const match = execArray[0];
		const index = execArray.index;
		const inline = match.match(/^\[{2}/) && match.match(/\]{2}$/) ? true : false;
		const output = parseMatch(sageMessage, content.slice(index, index + match.length));
		if (output.length) {
			diceMatches.push({ match, index, inline, output });
		}
	}
	return diceMatches;
}

//#endregion

//#region listener / handler

async function hasUnifiedDiceCommand(sageMessage: SageMessage): Promise<TCommandAndArgsAndData<TDiceOutput[]> | null> {
	if (!sageMessage.allowDice || sageMessage.slicedContent.match(/^\!*\s*((add|set)[ \-]?macro|macro[ \-]?(add|set))/i)) {
		return null;
	}
	const matches = parseDiceMatches(sageMessage, sageMessage.slicedContent);
	if (matches.length > 0) {
		const output = matches.map(m => m.output).flat();
		return { command: "unified-dice", data: output };
	}
	return null;
}

async function sendDiceToMultiple(sageMessage: TInteraction, formattedOutputs: TFormattedDiceOutput[], targetChannel: TChannel, gmTargetChannel: TGmChannel): Promise<void> {
	const hasSecret = formattedOutputs.filter(output => output.hasSecret).length > 0,
		allSecret = formattedOutputs.filter(output => output.hasSecret).length === formattedOutputs.length,
		publicMentionLine = await createMentionLine(sageMessage),
		secretMentionLine = await createMentionLine(sageMessage, true),
		sageCache = sageMessage.caches;

	let doGmMention = hasSecret && !!gmTargetChannel;
	let doMention = !allSecret;

	for (const formattedOutput of formattedOutputs) {
		const embed = createEmbedOrNull(sageMessage, formattedOutput.embedContent);
		const embeds = embed ? [embed] : [];
		// figure out where to send results and info about secret rolls
		if (formattedOutput.hasSecret && gmTargetChannel) {
			// prepend the mention if we haven't done so yet; stop us from doing it again; send the message
			const gmPostContent = doGmMention ? `${secretMentionLine}\n${formattedOutput.postContent}` : formattedOutput.postContent!;
			doGmMention = false;
			await sendTo({ target: gmTargetChannel, content: gmPostContent.trim(), embeds, sageCache });

			if (!allSecret) {
				// prepend the mention if we haven't done so yet; stop use from doing it again; send the message
				const notificationContent = doMention ? `${publicMentionLine}\n${formattedOutput.notificationContent}` : formattedOutput.notificationContent;
				doMention = false;
				await sendTo({ target: targetChannel, content: notificationContent.trim(), sageCache });
			}
		} else {
			// prepend the mention if we haven't done so yet; stop use from doing it again; send the message
			const postContent = doMention ? `${publicMentionLine}\n${formattedOutput.postContent}` : formattedOutput.postContent!;
			doMention = false;
			await sendTo({ target: targetChannel, content: postContent.trim(), embeds, sageCache });
		}
	}
	if (allSecret && sageMessage instanceof SageMessage) {
		await sageMessage.reactDie();
	}
}

async function sendDiceToSingle(sageMessage: TInteraction, formattedOutputs: TFormattedDiceOutput[], targetChannel: TChannel, gmTargetChannel: TGmChannel): Promise<void> {
	const hasSecret = formattedOutputs.filter(output => output.hasSecret).length > 0,
		allSecret = formattedOutputs.filter(output => output.hasSecret).length === formattedOutputs.length,
		publicMentionLine = await createMentionLine(sageMessage),
		secretMentionLine = await createMentionLine(sageMessage, true),
		sageCache = sageMessage.caches;

	const gmPostContents: Optional<string>[] = [];
	const gmEmbedContents: Optional<string>[] = [];
	const mainPostContents: Optional<string>[] = [];
	const mainEmbedContents: Optional<string>[] = [];

	if (hasSecret && gmTargetChannel) {
		gmPostContents.push(secretMentionLine);
	}
	if (!allSecret) {
		mainPostContents.push(publicMentionLine);
	}

	for (const formattedOutput of formattedOutputs) {
		// figure out where to send results and info about secret rolls
		if (formattedOutput.hasSecret && gmTargetChannel) {
			gmPostContents.push(formattedOutput.postContent);
			gmEmbedContents.push(formattedOutput.embedContent);
			if (!allSecret) {
				mainPostContents.push(formattedOutput.notificationContent);
			}
		} else {
			mainPostContents.push(formattedOutput.postContent);
			mainEmbedContents.push(formattedOutput.embedContent);
		}
	}

	const gmPostContent = gmPostContents.filter(isNotBlank).join(NEWLINE);
	const gmEmbedContent = gmEmbedContents.filter(isNotBlank).join(NEWLINE);
	if (gmPostContent || gmEmbedContent) {
		if (gmTargetChannel) {
			const embed = createEmbedOrNull(sageMessage, gmEmbedContent);
			const embeds = embed ? [embed] : [];
			await sendTo({ target: gmTargetChannel, content: gmPostContent, embeds, sageCache });
		}else {
			console.log("no gmTargetChannel!");
		}
	}

	const mainPostContent = mainPostContents.filter(isNotBlank).join(NEWLINE);
	const mainEmbedContent = mainEmbedContents.filter(isNotBlank).join(NEWLINE);
	if (mainPostContent || mainEmbedContent) {
		if (!targetChannel) console.log("no targetChannel!");
		const embed = createEmbedOrNull(sageMessage, mainEmbedContent);
		const embeds = embed ? [embed] : [];
		await sendTo({ target: targetChannel, content: mainPostContent, embeds, sageCache });
	}

	if (allSecret && sageMessage instanceof SageMessage) {
		await sageMessage.reactDie();
	}
}

type TSendDiceResults = {
	allSecret: boolean;
	count: number;
	countPublic: number;
	countSecret: number;
	hasGmChannel: boolean;
	hasSecret: boolean;
};
export async function sendDice(sageMessage: TInteraction, outputs: TDiceOutput[]): Promise<TSendDiceResults> {
	const count = outputs.length,
		countSecret = outputs.filter(diceRollString => diceRollString.hasSecret).length,
		countPublic = count - countSecret,
		hasSecret = countSecret > 0,
		allSecret = countSecret === count,
		targetChannel = await ensureTargetChannel(sageMessage),
		gmTargetChannel = await ensureGmTargetChannel(sageMessage, hasSecret),
		hasGmChannel = !!gmTargetChannel,
		formattedOutputs = outputs.map(diceRoll => formatDiceOutput(sageMessage, diceRoll, !gmTargetChannel));
	if (sageMessage.dicePostType === DicePostType.MultipleEmbeds || sageMessage.dicePostType === DicePostType.MultiplePosts) {
		await sendDiceToMultiple(sageMessage, formattedOutputs, targetChannel, gmTargetChannel);
	}else {
		await sendDiceToSingle(sageMessage, formattedOutputs, targetChannel, gmTargetChannel);
	}
	return { allSecret, count, countPublic, countSecret, hasGmChannel, hasSecret };
}

function doMath(_: TInteraction, input: string): TDiceOutput[] {
	let result = "INVALID!";
	try {
		if (input.match(/^[\s\(\)\d\*\/\+\-\^]+$/i)) {
			const equation = input
				.replace(/ /g, "")
				.replace(/(\d+)\(([^)]+)\)/g, "($1*($2))")
				.replace(/(\d)\(/g, "$1*(")
				.replace(/\^/g, "**")
				;
			result = eval(equation);
		}
	} catch (ex) {
		/* ignore */
	}
	return [{
		hasSecret: false,
		inlineOutput: result,
		input: input,
		output: `${result} ${"\u27f5"} ${input.replace(/\*/g, "\\*")}`
	}];
}

function doSimple(_: TInteraction, input: string): TDiceOutput[] {
	const match = input.match(/^(?:(\d*)([ usgm]*)#)?(.*?)$/i) ?? [];
	const count = +match[1] || 1;
	const unique = !!(match[2] ?? "").match(/u/i);
	const sort = !!(match[2] ?? "").match(/s/i);
	const hasSecret = !!(match[2] ?? "").match(/gm/i);
	const options = match[3].split(",").map(s => s.trim());
	const selections: string[] = [];
	const total = (unique ? Math.min(options.length, count) : count);
	do {
		const random = randomItem(options)!;
		if (!unique || !selections.includes(random)) {
			selections.push(random);
		}
	} while (selections.length < total);
	if (sort) {
		selections.sort();
	}
	return [{
		hasSecret: hasSecret,
		inlineOutput: selections.join(", "),
		input: input,
		output: `${selections.join(", ")} ${"\u27f5"} ${input}`
	}];
}

//#endregion

//#endregion

//#region dice

//#region Message

function formatDiceOutput(sageMessage: TInteraction, diceRoll: TDiceOutput, noGmTargetChannel: boolean): TFormattedDiceOutput {
	const formatted = sageMessage.caches.format(diceRoll.output),
		output = diceRoll.hasSecret && (sageMessage.diceSecretMethodType === DiceSecretMethodType.Hide || noGmTargetChannel) ? `||${formatted}||` : formatted,
		isEmbed = sageMessage.dicePostType === DicePostType.SingleEmbed || sageMessage.dicePostType === DicePostType.MultipleEmbeds
		;
	return {
		hasSecret: diceRoll.hasSecret,
		postContent: isEmbed ? undefined : output,
		embedContent: isEmbed ? output : undefined,
		notificationContent: sageMessage.caches.format(`${diceRoll.input} [die]`)
	};
}

function createEmbedOrNull(sageMessage: TInteraction, embedContent?: string): Discord.MessageEmbed | null {
	return embedContent ? createMessageEmbed("", embedContent, sageMessage.toDiscordColor(ColorType.Dice)) : null;
}

//#endregion

//#region Mentions

function createGmMention(sageMessage: TInteraction): string {
	return DiscordId.toRoleMention(sageMessage.game?.gmRoleDid)
		?? DiscordId.toUserMention(sageMessage.game?.gameMasters[0])
		?? ``;
}

async function createAuthorMention(sageMessage: TInteraction, isSecretMention = false): Promise<string | null> {
	const userDid = sageMessage instanceof SageMessage ? sageMessage.authorDid : sageMessage.user.id;
	let authorReference = DiscordId.toUserMention(userDid);
	if (isSecretMention) {
		const user = await sageMessage.discord.fetchUser(userDid);
		authorReference = authorToMention(user);
	}
	if (sageMessage.playerCharacter) {
		return `${authorReference} (${sageMessage.playerCharacter.name})`;
	}
	return authorReference;
}

async function createMentionLine(sageMessage: TInteraction, isSecretMention = false/*, hasSecret:boolean, isTargetChannel: boolean, isGmChannel: boolean, isGmUser: boolean*/): Promise<string | null> {
	const gmMention = createGmMention(sageMessage);
	if (gmMention && sageMessage.isGameMaster) {
		return gmMention;
	}
	const authorMention = await createAuthorMention(sageMessage, isSecretMention);
	if (gmMention) {
		return `${gmMention}, ${authorMention}`;
	}
	return authorMention;
}

//#endregion

//#region Channels

async function ensureTargetChannel(sageMessage: TInteraction): Promise<TChannel> {
	const channel = await sageMessage.discord.fetchChannel(sageMessage.channel?.sendDiceTo);
	if (channel) {
		return channel;
	}
	if (sageMessage instanceof SageInteraction) {
		return (sageMessage.interaction as Discord.ButtonInteraction).channel as TChannel;
	}
	return sageMessage.message.channel as TChannel;
}

async function ensureGmTargetChannel(sageMessage: TInteraction, hasSecret: boolean): Promise<TGmChannel> {
	if (!hasSecret || (sageMessage.diceSecretMethodType !== DiceSecretMethodType.GameMasterChannel && sageMessage.diceSecretMethodType !== DiceSecretMethodType.GameMasterDirect)) {
		return null;
	}
	if (sageMessage.diceSecretMethodType === DiceSecretMethodType.GameMasterChannel) {
		const channel = await sageMessage.game?.gmGuildChannel();
		if (channel) {
			return channel as TChannel;
		}
	}
	const member = await sageMessage.game?.gmGuildMember();
	return member?.user ?? null;
}

//#endregion


//#endregion

//#region macro

function reduceToLongestMacroName(longestMacro: TMacro | null, currentMacro: TMacro): TMacro | null {
	if (!longestMacro || longestMacro.name.length < currentMacro.name.length) {
		return currentMacro;
	}
	return longestMacro;
}

function findMacro(userMacros: NamedCollection<TMacro>, input: string): TMacro | null {
	const match = input.match(/^(?:\d+#)?(.*?)$/)!;
	const cleanMacro = match[1].trim().toLowerCase();
	const matchingMacros = userMacros.filter(macro => cleanMacro.startsWith(macro.name.toLowerCase()));
	return matchingMacros.reduce(reduceToLongestMacroName, null);
}

function parseMacroArgs(argString: string): string[] {
	return Tokenizer
		.tokenize(argString.trim(), { spaces: /\s+/, quotes: /"[^"]*"/ })
		.filter(token => token.type !== "spaces")
		.map(token => dequote(token.token).trim());
}

type TMacroAndArgs = { macro?: TMacro, args: string[] };
function parseMacroAndArgs(userMacros: NamedCollection<TMacro>, input: string): TMacroAndArgs {
	const userMacro = findMacro(userMacros, input);
	return {
		macro: userMacro ?? undefined,
		args: userMacro ? parseMacroArgs(input.slice(userMacro.name.length)) : []
	};
}

function nonEmptyStringOrDefaultValue(arg: string, def: string): string {
	const argOrEmptyString = arg ?? "";
	const defOrEmptyString = def ?? "";
	return argOrEmptyString !== "" ? argOrEmptyString : defOrEmptyString;
}

type TMacroAndOutput = { macro: TMacro; output: string; }
function macroToDice(userMacros: NamedCollection<TMacro>, input: string): TMacroAndOutput | null {
	const { macro, args } = parseMacroAndArgs(userMacros, input);
	if (!macro) {
		return null;
	}

	let maxIndex = -1;
	const dice = macro.dice
		.replace(/\{(\d+)(\:([-+]?\d+))?\}/g, match => {
			const [argIndex, defaultValue] = match.slice(1, -1).split(":");
			maxIndex = Math.max(maxIndex, +argIndex);
			return nonEmptyStringOrDefaultValue(args[+argIndex], defaultValue);
		})
		.replace(/\{...\}/g, args.slice(maxIndex + 1).join(" "));

	const output = [dice];
	const count = +(input.match(/^(\d+)#/) ?? [])[1] || 1;
	while (output.length < count) {
		output.push(dice);
	}
	return { macro: macro, output: output.join("") };
}

//#endregion

export default function register(): void {
	registerMessageListener(hasUnifiedDiceCommand, sendDice as any, MessageType.Post, undefined, undefined, 1);

	registerInlineHelp("Dice", "Basic",
		`[1d20]`
		+ `\n[1d20 + 5] *(modifiers)*`
		+ `\n[1d20 prof + 5 str] *(descriptions)*`
		+ `\n`
		+ `\n__Tests__`
		+ `\n[1d20 >= 10] *(<, <=, >, >=, =)*`
		+ `\n[1d20 gteq 10] *(lt, lteq, gt, gteq, eq)*`
		+ `\n - *to avoid keyboard switching on mobile*`
		+ `\n`
		+ `\n__Types vs Sets__`
		+ `\n[1d8 + 1d4] *(added together)*`
		+ `\n[1d20 attack; 1d8 damage] *(rolled separately)*`
		+ `\n`
		+ `\n__Sets w/ Tests__`
		+ `\n[1d20 > 10 attack; 1d8 damage]`
		+ `\n - *only rolls second set if the first is successful*`
		+ `\n`
		+ `\n__Drop / Keep / NoSort__`
		+ `\n[3d6ns] *(no sort)*`
		+ `\n[4d6dl] *(drop lowest 1)*`
		+ `\n[5d6dl2] *(drop lowest X)*`
		+ `\n[6d6kh] *(keep highest 1)*`
		+ `\n[7d6kh3] *(keep highest X)*`
		+ `\n`
		+ `\n__Output Size Override__`
		+ `\n[xxs 1d20 + 5 attack; 1d8 + 1d6 + 1 damage]`
		+ `\n - *(xxs, xs, s, m, l, xl, xxl; default: m)*`
		+ `\n`
		+ `\n__Game Override__`
		+ `\n[pf2e 1d20 + 5 attack ac 10; 1d8 + 1d6 + 1 damage]`
		+ `\n - *(pf2e, quest; more to be added)*`
	);

	registerInlineHelp("Dice", "PF2e",
		`[1d20 ac 10] *(ac acts as >=)*`
		+ `\n[1d20 dc 10] *(dc acts as >=)*`
		+ `\n[1d20 vs 10] *(vs acts as >=)*`
	);

	registerInlineHelp("Dice", "Macro", "*see Macro help* `!help macro`");
}
