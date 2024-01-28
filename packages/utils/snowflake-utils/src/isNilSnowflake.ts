import type { Optional } from "@rsc-utils/type-utils";
import type { NIL_SNOWFLAKE, Snowflake } from "./types.js";

/**
 * Returns true if the value is a series of at least 16 0s.
 * This accounts for possibly old data that incorrectly assumed a static length of a Snowflake and had a different length for NIL_SNOWFLAKE.
 */
export function isNilSnowflake(value: Optional<Snowflake>): value is NIL_SNOWFLAKE {
	if (value) {
		const regex = /^0{16,}$/;
		return regex.test(value);
	}
	return false;
}
