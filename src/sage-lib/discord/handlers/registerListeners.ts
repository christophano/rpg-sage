import type { Awaitable } from "@rsc-utils/type-utils";
import type { SageCommand } from "../../sage/model/SageCommand.js";
import type { SageInteraction } from "../../sage/model/SageInteraction.js";
import type { SageMessage } from "../../sage/model/SageMessage.js";
import type { SageReaction } from "../../sage/model/SageReaction.js";
import { registerInteractionListener } from "../handlers.js";
import { registerCommand } from "./registerCommand.js";
import { debug } from "@rsc-utils/console-utils";

type SageCommandHandler = (sageCommand: SageCommand) => Awaitable<void>;
type SageInteractionHandler = (sageInteraction: SageInteraction) => Awaitable<void>;
type SageMessageHandler = (sageMessage: SageMessage) => Awaitable<void>;
type SageReactionHandler = (sageReaction: SageReaction) => Awaitable<void>;

type Args = {
	/** Commands */
	commands: string[];

	/** List to slash commands? */
	interaction?: SageCommandHandler | SageInteractionHandler;

	/** Listen to posted messages? */
	message?: SageCommandHandler | SageMessageHandler;

	/** Listen to reactions? */
	reaction?: SageCommandHandler | SageReactionHandler;
};

export function registerListeners({ commands, interaction, message, reaction }: Args): void {
	for (const command of commands) {
		const commandParts = command.split("-");
		const tester = (cmd: SageCommand) => cmd.isCommand(...commandParts);

		if (interaction) {
			registerInteractionListener(tester, interaction);
		}

		if (message) {
			registerCommand(message, command);
		}

		if (reaction) {
			debug(`Unregistered Reaction Handler`);
		// 	registerReactionListener(tester, interaction);
		}

	}
}
