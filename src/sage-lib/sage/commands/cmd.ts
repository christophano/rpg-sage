import { Color } from "@rsc-utils/color-utils";
import { error } from "@rsc-utils/console-utils";
import { RenderableContent } from "@rsc-utils/render-utils";
import type { Awaitable, OrNull } from "@rsc-utils/type-utils";
import { MessageEmbed } from "discord.js";
import { ArgsManager } from "../../discord/ArgsManager";
import { registerMessageListener } from "../../discord/handlers";
import type { TCommandAndArgs, TMessageHandler } from "../../discord/types";
import { ActiveBot } from "../model/ActiveBot";
import type { IHasColorsCore } from "../model/HasColorsCore";
import { ColorType } from "../model/HasColorsCore";
import type { SageMessage } from "../model/SageMessage";

export enum BotServerGameType { Bot, Server, Game }

//#region helpers

export function renderCount(sageMessage: SageMessage, label: string, count: number, active?: number): Promise<void> {
	const renderableContent = createAdminRenderableContent(sageMessage.bot, `<b>count-${label.toLowerCase()}</b>`);
	renderableContent.append(`<b>${label}</b> ${count}`);
	if ((active ?? false) !== false) {
		renderableContent.append(`<b>${label} (active)</b> ${active}`);
		renderableContent.append(`<b>${label} (inactive)</b> ${count - active!}`);
	}
	return <any>sageMessage.send(renderableContent);
}

export function embedColor(color: Color, ...labels: string[]): MessageEmbed {
	const embed = new MessageEmbed();
	embed.setColor(<any>color.toDiscordColor());
	let desc = color.hex;
	if (color.name) {
		desc += ` "${color.name}"`;
	}
	if (labels.length) {
		desc += ` ${labels.join(" ")}`;
	}
	embed.setDescription(desc);
	return embed;
}

export function createRenderableContent(hasColors: IHasColorsCore, colorType: ColorType, title?: string): RenderableContent {
	const renderableContent = new RenderableContent(title);
	renderableContent.setColor(hasColors.toDiscordColor(colorType));
	return renderableContent;
}

export function createCommandRenderableContent(title?: string): RenderableContent {
	return createRenderableContent(ActiveBot.active, ColorType.Command, title);
}

//#endregion

// #region Register Commands

export function registerCommandRegex(matcher: RegExp, handler: TMessageHandler): void {
	const _tester = async function (sageMessage: SageMessage): Promise<TCommandAndArgs | null> {
		if (!sageMessage.hasPrefix || !sageMessage.slicedContent.match(/^!!?/)) {
			return null;
		}
		const match = sageMessage.slicedContent.replace(/^!!?/, "").trim().match(matcher);
		if (match) {
			//TODO: move to using groups: match.groups
			return {
				command: "command-regex",
				args: new ArgsManager(Array.from(match).slice(1).map(s => s ?? ""))
			};
		}
		return null;
	};
	const _handler = async function (sageMessage: SageMessage): Promise<void> {
		return sageMessage.allowCommand ? handler(sageMessage) : sageMessage.reactBlock();
	};
	registerMessageListener(_tester, _handler);
	// registerMessageListener("MessageListener", { command: handler.name || String(matcher), tester: _tester, handler: _handler, type: type, priorityIndex: undefined });
}

// #endregion

// #region Admin Command Registration

export function createAdminRenderableContent(hasColors: IHasColorsCore, title?: string): RenderableContent {
	const renderableContent = new RenderableContent(title);
	renderableContent.setColor(hasColors.toDiscordColor(ColorType.AdminCommand));
	return renderableContent;
}

type TSageMessageHandler = (sageMessage: SageMessage) => Awaitable<void>;
type TCommandHandler = { key: string; regex: RegExp; handler: TSageMessageHandler; };
const handlers: TCommandHandler[] = [];

export function registerAdminCommand(handler: TSageMessageHandler, ...commands: string[]): void {
	commands.forEach(key => {
		const cleanKey = key.trim().toLowerCase();
		const keyRegex = cleanKey.replace(/[\-\s]+/g, "[\\-\\s]*");
		handlers.push({
			key: cleanKey,
			regex: RegExp(`^${keyRegex}(?:$|(\\s+(?:.|\\n)*?)$)`, "i"),
			handler: handler
		});
	});
	handlers.sort((a, b) => a.key.length < b.key.length ? 1 : -1);
}

function findKeyMatchAndReturnCommandAndArgs(slicedContent: string): TCommandAndArgs | null {
	for (const command of handlers) {
		const match = slicedContent.match(command.regex);
		if (match) {
			return {
				command: command.key,
				args: new ArgsManager(match[1])
			};
		}
	}
	return null;
}
function adminCommandTest(sageMessage: SageMessage): OrNull<TCommandAndArgs> {
	if (!sageMessage.hasPrefix || !sageMessage.slicedContent.match(/^\!\!?/) || sageMessage.slicedContent.match(/^\!\!?\s*help/i)) {
		return null;
	}

	const slicedContent = sageMessage.slicedContent.replace(/^\!\!?/, "").trim(),
		adminCommandAndArgs = findKeyMatchAndReturnCommandAndArgs(slicedContent);
	if (adminCommandAndArgs) {
		return adminCommandAndArgs;
	}

	error(`I got ${handlers.length} admin handlers, but "${slicedContent}" ain't one!`);

	return null;
}
async function adminCommandHandler(sageMessage: SageMessage): Promise<void> {
	const adminCommand = handlers.find(handler => handler.key === sageMessage.command);
	if (adminCommand) {
		await adminCommand.handler(sageMessage);
	}
}

// #endregion

export function registerCmd(): void {
	registerMessageListener(adminCommandTest, adminCommandHandler);
}
