import type { Snowflake } from "@rsc-utils/snowflake-utils";
import type { Optional } from "@rsc-utils/type-utils";
import { Formatters } from "discord.js";

export function toRoleMention(id: Optional<Snowflake>): string | null {
	return id ? Formatters.roleMention(id) : null;
}