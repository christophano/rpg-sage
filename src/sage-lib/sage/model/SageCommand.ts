import { DialogPostType, DiceCritMethodType, DiceOutputType, DicePostType, DiceSecretMethodType, GameSystemType, SageChannelType } from "@rsc-sage/types";
import { Cache, HasCache } from "@rsc-utils/cache-utils";
import { debug } from "@rsc-utils/console-utils";
import type { DInteraction, DTextChannel, DiscordKey } from "@rsc-utils/discord-utils";
import type { RenderableContentResolvable } from "@rsc-utils/render-utils";
import { orNilSnowflake, type Snowflake } from "@rsc-utils/snowflake-utils";
import type { Optional } from "@rsc-utils/type-utils";
import { CommandInteraction, type If, type MessageActionRow, type MessageAttachment, type MessageButton, type MessageEmbed, type MessageSelectMenu } from "discord.js";
import type { DiscordCache } from "../../discord/DiscordCache.js";
import { resolveToContent } from "../../discord/resolvers/resolveToContent.js";
import { resolveToEmbeds } from "../../discord/resolvers/resolveToEmbeds.js";
import type { IChannel } from "../repo/base/IdRepository.js";
import type { Bot } from "./Bot.js";
import type { Game } from "./Game.js";
import type { GameCharacter } from "./GameCharacter.js";
import type { ColorType, IHasColorsCore } from "./HasColorsCore.js";
import type { SageCache } from "./SageCache.js";
import type { SageCommandArgs } from "./SageCommandArgs.js";
import type { SageInteraction } from "./SageInteraction.js";
import type { SageMessage } from "./SageMessage.js";
import type { SageReaction } from "./SageReaction.js";
import type { Server } from "./Server.js";
import type { User } from "./User.js";

export interface SageCommandCore {
	sageCache: SageCache;

	isGameMaster?: boolean;
	isPlayer?: boolean;
}

export type TSendArgs<HasEphemeral extends boolean = boolean> = {
	content?: RenderableContentResolvable;
	embeds?: RenderableContentResolvable | MessageEmbed[];
	components?: MessageActionRow<MessageSelectMenu | MessageButton>[];
	ephemeral?: If<HasEphemeral, boolean | null, never>;
	files?: MessageAttachment[];
};

export type TSendOptions<HasEphemeral extends boolean = boolean> = {
	content?: string;
	embeds?: MessageEmbed[];
	components?: MessageActionRow<MessageSelectMenu | MessageButton>[];
	ephemeral?: If<HasEphemeral, boolean | null, never>;
	files?: MessageAttachment[];
};

export abstract class SageCommand<
			T extends SageCommandCore = any,
			U extends SageCommandArgs<any> = SageCommandArgs<any>
			> extends HasCache {

	protected constructor(protected core: T, cache?: Cache | null) {
		super(cache as Cache);
	}

	public abstract commandValues: string[];
	public abstract isCommand(...args: string[]): boolean;

	public isSageInteraction<T extends DInteraction = any>(): this is SageInteraction<T> { return "interaction" in this; }
	public isSageMessage(): this is SageMessage { return "isEdit" in this; }
	public isSageReaction(): this is SageReaction { return "messageReaction" in this; }

	//#region abstract

	public abstract args: U;

	/** @todo: THIS IS NOT A PERMANENT SOLUTION; REPLACE THIS WHEN WE START PROPERLY TRACKING MESSAGES/DICE! */
	public clone(): this { return this; }

	/** @todo what is the reason for both reply /AND/ whisper? */
	public abstract reply(renderableOrArgs: RenderableContentResolvable | TSendArgs, ephemeral?: boolean): Promise<void>;

	/** @todo what is the reason for both reply /AND/ whisper? */
	public abstract whisper(renderableOrArgs: RenderableContentResolvable | TSendArgs): Promise<void>;

	//#endregion

	//#region caches

	/** @deprecated use .sageCache */
	public get caches(): SageCache { return this.core.sageCache; }
	public get bot(): Bot { return this.sageCache.bot; }
	public get discord(): DiscordCache { return this.sageCache.discord; }
	public get discordKey(): DiscordKey { return this.sageCache.discordKey; }
	public get game(): Game | undefined { return this.sageCache.game; }
	public get sageCache(): SageCache { return this.core.sageCache; }
	public get sageUser(): User { return this.sageCache.user; }
	public get server(): Server { return this.sageCache.server; }

	//#endregion


	// #region User flags

	/** Author of the message */
	public get authorDid(): Snowflake {
		return this.cache.get("authorDid", () => orNilSnowflake(this.sageCache.user.did));
	}

	/** Is the author the owner of the message's server */
	public get isOwner(): boolean {
		return this.cache.get("isOwner", () => {
			if (this.isSageInteraction()) {
				return this.interaction.guild?.ownerId === this.authorDid;
			}else if (this.isSageMessage() || this.isSageReaction()) {
				return this.message.guild?.ownerId === this.authorDid;
			}
			return false;
		});
	}

	/** Can admin Sage settings, Server channels, Games, and Game channels */
	public get isSageAdmin(): boolean {
		return this.cache.get("isSageAdmin", () => (this.authorDid && this.server?.hasSageAdmin(this.authorDid)) === true);
	}

	/** Can admin Server channels and Game channels */
	public get isServerAdmin(): boolean {
		return this.cache.get("isServerAdmin", () => (this.authorDid && this.server?.hasServerAdmin(this.authorDid)) === true);
	}

	/** Can admin Games and Game channels */
	public get isGameAdmin(): boolean {
		return this.cache.get("isGameAdmin", () => (this.authorDid && this.server?.hasGameAdmin(this.authorDid)) === true);
	}

	// #endregion

	// #region Permission Flags

	/** Quick flag for Sage admins (isSuperUser || isOwner || isSageAdmin) */
	public get canAdminSage(): boolean {
		return this.cache.get("canAdminSage", () => this.isSuperUser || this.isOwner || this.isSageAdmin);
	}

	/** Quick flag for Server admins (canAdminSage || isServerAdmin) */
	public get canAdminServer(): boolean {
		return this.cache.get("canAdminServer", () => this.canAdminSage || this.isServerAdmin);
	}

	/** Quick flag for Game admins (canAdminServer || isGameAdmin) */
	public get canAdminGames(): boolean {
		return this.cache.get("canAdminGames", () => this.canAdminServer || this.isGameAdmin);
	}

	/** Quick flag for "this" Game (game && (canAdminGames || isGameMaster)) */
	public get canAdminGame(): boolean {
		return this.cache.get("canAdminGame", () => !!this.game && (this.canAdminGames || this.isGameMaster));
	}

	// #endregion

	// #region Function flags

	/** @deprecated Use .allowCommand */
	public get allowAdmin(): boolean {
		return this.allowCommand;
	}

	public get allowCommand(): boolean {
		return this.cache.get("allowCommand", () => {
			const channel = this.channel;
			// allow all in unconfigured channels
			if (!channel) {
				return true;
			}

			const blockedTypes = [SageChannelType.None, SageChannelType.InCharacter];

			// we only stop commands in None or InCharacter
			if (!blockedTypes.includes(channel.type!)) {
				return true;
			}

			if (this.game) {
				//  we need to make sure the game isn't all blocked channels
				const gameChannels = this.game?.channels;
				const othersNotBlocked = gameChannels?.some(channel => !blockedTypes.includes(channel.type!));
				return !othersNotBlocked;
			}

			// blocked
			return false;
		});
	}

	public get allowDialog(): boolean {
		return this.cache.get("allowDialog", () => !this.channel || ![SageChannelType.None,SageChannelType.Dice].includes(this.channel.type!));
	}

	public get allowDice(): boolean {
		return this.cache.get("allowDice", () => !this.channel || this.channel.type !== SageChannelType.None);
	}

	/** @deprecated Use .allowCommand */
	public get allowSearch(): boolean {
		return this.allowCommand;
	}

	public get dialogPostType(): DialogPostType {
		return this.cache.get("dialogPostType", () => this.sageUser.dialogPostType ?? this.gameChannel?.dialogPostType ?? this.game?.dialogPostType ?? this.serverChannel?.dialogPostType ?? this.server?.dialogPostType ?? 0);
	}

	// #endregion

	//#region channels

	public get dChannel(): DTextChannel | undefined {
		return this.isSageInteraction<CommandInteraction>()
			? this.interaction.channel as DTextChannel
			: (this as unknown as SageMessage).message.channel as DTextChannel;
	}

	/** Returns the gameChannel meta, or the serverChannel meta if no gameChannel exists. */
	public get channel(): IChannel | undefined {
		return this.cache.get("channel", () => {
			debug(`caching sageCommand.channel ${this.discordKey.channelId}`);
			return this.gameChannel ?? this.serverChannel;
		});
	}

	/** Returns the gameChannel meta for the message, checking the thread before checking its channel. */
	public get gameChannel(): IChannel | undefined {
		return this.cache.get("gameChannel", () => this.game?.getChannel(this.discordKey));
	}

	/** Returns the serverChannel meta for the message, checking the thread before checking its channel. */
	public get serverChannel(): IChannel | undefined {
		return this.cache.get("serverChannel", () => this.server?.getChannel(this.discordKey));
	}

	/** Returns the channelDid this message (or its thread) is in. */
	public abstract channelDid: Snowflake | undefined;

	//#endregion

	//#region characters

	/**
	 * Gets the active player character by checking the following list:
	 * 1. Game PC for user with auto dialog in this channel
	 * 2. Game PC for user
	 * 3. Non-Game PC for user with auto dialog in this channel
	 */
	public get playerCharacter(): GameCharacter | undefined {
		return this.cache.get("playerCharacter", () => {
			const channelDid = this.channel?.id!;
			const userDid = this.sageUser.did;
			const autoChannelData = { channelDid, userDid };
			return this.game?.playerCharacters.getAutoCharacter(autoChannelData)
				?? this.game?.playerCharacters.findByUser(userDid)
				?? this.sageUser.playerCharacters.getAutoCharacter(autoChannelData)
				?? undefined;
		});
	}

	//#endregion

	//#region colors

	/** Returns the object with the correct color scheme for the current command. */
	public getHasColors(): IHasColorsCore {
		return this.game ?? this.server ?? this.bot;
	}

	// public colors = this.game?.colors ?? this.server?.colors ?? this.bot.colors;

	/** Gets the correct color by working up the "ladder" of color heirarchy. */
	public toDiscordColor(colorType: Optional<ColorType>): string | null {
		if (!colorType) {
			return null;
		}
		if (this.game) {
			return this.game.toDiscordColor(colorType);
		}
		if (this.server) {
			return this.server.toDiscordColor(colorType);
		}
		return this.bot.toDiscordColor(colorType);
	}

	// #endregion

	//#region dice settings

	public get gameSystemType(): GameSystemType {
		return this.cache.get("gameType", () => this.game?.gameSystemType ?? this.serverChannel?.gameSystemType ?? this.server?.gameSystemType ?? 0);
	}

	public get diceCritMethodType(): DiceCritMethodType {
		return this.cache.get("diceCritMethodType", () => this.gameChannel?.diceCritMethodType ?? this.game?.diceCritMethodType ?? this.serverChannel?.diceCritMethodType ?? this.server?.diceCritMethodType ?? 0);
	}

	public get dicePostType(): DicePostType {
		return this.cache.get("dicePostType", () => this.gameChannel?.dicePostType ?? this.game?.dicePostType ?? this.serverChannel?.dicePostType ?? this.server?.dicePostType ?? 0);
	}

	public get diceOutputType(): DiceOutputType {
		return this.cache.get("diceOutputType", () => this.gameChannel?.diceOutputType ?? this.game?.diceOutputType ?? this.serverChannel?.diceOutputType ?? this.server?.diceOutputType ?? 0);
	}

	public get diceSecretMethodType(): DiceSecretMethodType {
		return this.cache.get("diceSecretMethodType", () => this.gameChannel?.diceSecretMethodType ?? this.game?.diceSecretMethodType ?? this.serverChannel?.diceSecretMethodType ?? this.server?.diceSecretMethodType ?? 0);
	}

	//#endregion

	//#region flags

	/** Is the server HomeServer */
	public get isHomeServer(): boolean {
		return this.server?.isHome === true;
	}

	/** Is the author SuperUser */
	public get isSuperUser(): boolean {
		return this.sageUser.isSuperUser === true;
	}

	//#endregion

	//#region games

	public get isGameMaster() { return this.core.isGameMaster === true; }
	public set isGameMaster(bool: boolean) { this.core.isGameMaster = bool === true; }

	public get isPlayer() { return this.core.isPlayer === true; }
	public set isPlayer(bool: boolean) { this.core.isPlayer = bool === true; }

	//#endregion

	/** @todo figure out where splitMessageOptions comes into this workflow */
	protected resolveToOptions<T extends TSendOptions>(renderableOrArgs: RenderableContentResolvable | TSendArgs, ephemeral?: boolean): T {
		if ((typeof(renderableOrArgs) === "string") || ("toRenderableContent" in renderableOrArgs)) {
			return {
				embeds: resolveToEmbeds(this.sageCache, renderableOrArgs),
				ephemeral: ephemeral
			} as T;
		}

		const options: TSendOptions = { };
		if (renderableOrArgs.content) {
			options.content = typeof(renderableOrArgs.content) === "string"
				? renderableOrArgs.content
				: resolveToContent(this.sageCache, renderableOrArgs.content).join("\n");
		}
		if (renderableOrArgs.embeds) {
			options.embeds = Array.isArray(renderableOrArgs.embeds)
				? renderableOrArgs.embeds
				: resolveToEmbeds(this.sageCache, renderableOrArgs.embeds);
		}
		if (renderableOrArgs.components) {
			options.components = renderableOrArgs.components;
		}
		if (renderableOrArgs.files) {
			options.files = renderableOrArgs.files;
		}
		options.ephemeral = (ephemeral ?? renderableOrArgs.ephemeral) === true;
		return options as T;
	}
}
