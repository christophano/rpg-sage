import { round } from "@rsc-utils/number-utils";
import type { Optional } from "@rsc-utils/type-utils";
import { matchRgb } from "./internal/matchRgb.js";

/** Simple type to store r/g/b values */
type RGB = { red:number; green:number; blue:number; };

/** Simple type to store r/g/b/a values */
type RGBA = { red:number; green:number; blue:number; alpha?:number; };

/** Parses the value to get all the r/g/b/a component values, alpha only if present. */
export function parseRgb(value: Optional<string>): RGBA | null;

/** Parses the value to get all the r/g/b/a component values. */
export function parseRgb(value: Optional<string>, includeAlpha: true): RGBA | null;

/** Parses the value to get all the r/g/b component values. */
export function parseRgb(value: Optional<string>, includeAlpha: false): RGB | null;

export function parseRgb(value: Optional<string>, includeAlpha?: boolean): RGBA | null {
	const match = matchRgb(value);
	if (!match) {
		return null;
	}
	if (includeAlpha === false) {
		return {
			red: +match[1],
			green: +match[2],
			blue: +match[3]
		};
	}
	let alpha = match[4] !== undefined ? round(+match[4], 3) : undefined;
	if (alpha === undefined && includeAlpha) {
		alpha = 1;
	}
	return {
		red: +match[1],
		green: +match[2],
		blue: +match[3],
		alpha: alpha
	};
}
