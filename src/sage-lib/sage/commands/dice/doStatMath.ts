import { doMathFunctions } from "@rsc-utils/math-utils";
import { tokenize } from "@rsc-utils/string-utils";
import { doMath } from "./doMath.js";
import { isMath } from "./isMath.js";

/**
 * Checks the stat value for math.
 * If no math is found, then the value is returned.
 * If math is found, then it is calculated.
 * If pipes (spoilers) are found then they are removed for calculation and the return value is wrapped in pipes.
 * (Primarily for hiding values, such as AC.)
 */
export function doStatMath(value: string): string {
	// check for piped "hidden" values
	const hasPipes = (/\|{2}[^|]+\|{2}/).test(value);

	// remove pipes
	const unpiped = value.replace(/\|{2}/g, "");

	/** @todo identify a way we can integrate this test for fixed dice without duplicating the regex ... if it is possible */
	const tokens = tokenize(unpiped, { fixed:/\(\s*\d*(?:\s*,\s*\d+)*\s*\)(?:\s*\d+\s*|\b)d\s*\d+/i });
	// process other math functions before passing to simple math
	const processedTokens = tokens.map(({ token, key }) => key === "fixed" ? token : doMathFunctions(token));
	const processed = processedTokens.join("");

	// handle simple math if applicable
	if (isMath(`[${processed}]`)) {
		const value = doMath(processed);
		if (value !== null) {
			return hasPipes ? `||${value}||` : value;
		}
	}

	// if we actually did some math, return the change
	if (processed !== unpiped) {
		return hasPipes ? `||${processed}||` : processed;
	}

	return value;
}