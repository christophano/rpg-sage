import { Optional } from "@rsc-utils/type-utils";
import type { ColorData } from "./ColorData.js";
import { toColorData } from "./internal/toColorData.js";
import { isHex } from "./isHex.js";
import { isRgb } from "./isRgb.js";
import { hasNamedColor } from "./namedColors.js";

export class Color {
	// #region public properties
	public get name(): string | undefined { return this.data.name; }
	public get hex(): string { return this.data.hex; }
	public get hexa(): string { return this.data.hexa; }
	public get rgb(): string { return this.data.rgb; }
	public get rgba(): string { return this.data.rgba; }
	public get red(): number { return this.data.red; }
	public get green(): number { return this.data.green; }
	public get blue(): number { return this.data.blue; }
	public get alpha(): number { return this.data.alpha; }
	// #endregion

	public constructor(public data: ColorData) { }

	/** Returns a color value compatible with Discord. */
	public toDiscordColor(): string { return "0x" + this.hex.slice(1); }

	// #region color manipulation

	/** Creates a new Color object that is darker. */
	public darken(): Color;
	/** Creates a new Color object that is darker by subtracting the given increment from each color. */
	public darken(increment: number): Color;
	public darken(increment = 16): Color {
		const red = Math.max(0, this.red - increment),
			green = Math.max(0, this.green - increment),
			blue = Math.max(0, this.blue - increment);
		return Color.from(red, green, blue, this.alpha);
	}

	/** Creates a new Color object that is lighter. */
	public lighten(): Color;
	/** Creates a new Color object that is lighter by adding the given increment to each color. */
	public lighten(increment: number): Color;
	public lighten(increment = 16): Color {
		const red = Math.min(255, this.red + increment),
			green = Math.min(255, this.green + increment),
			blue = Math.min(255, this.blue + increment);
		return Color.from(red, green, blue, this.alpha);
	}

	/** Creates a new Color object with the alpha value multiplied by the given multiplier. */
	public tweakAlpha(multiplier: number): Color {
		return Color.from(this.data, this.alpha * multiplier);
	}

	// #endregion

	public static from(color: string): Color;
	public static from(color: string, alpha: number): Color;
	public static from(color: ColorData, alpha: number): Color;
	public static from(red: number, green: number, blue: number): Color;
	public static from(red: number, green: number, blue: number, alpha: number): Color;
	public static from(colorOrRed: string | number | ColorData, alphaOrGreen?: number, blue?: number, alpha?: number): Color | null {
		const color = toColorData(colorOrRed as number, alphaOrGreen as number, blue as number, alpha as number);
		return color ? new Color(color) : null;
	}

	// #region "is" tests

	/** Tests all color types in this module */
	public static isValid(color: Optional<string>): boolean {
		return isHex(color) || isRgb(color);
	}

	/** Tests to see if the named color exists */
	public static isName(color: Optional<string>): boolean {
		return hasNamedColor(color?.toLowerCase());
	}

	// #endregion

}
