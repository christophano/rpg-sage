import { isNullOrUndefined, type Optional } from "@rsc-utils/type-utils";
import { getEnumValues } from "./getEnumValues.js";

/** Returns the (number) value of the enum for the given string value (ignoring case), or undefined. */
export function parseEnum<T>(_enum: any, value: Optional<string>): T | undefined;

/** Returns the (number) value of the enum for the given value, or undefined. */
export function parseEnum<T>(_enum: any, value: Optional<number>): T | undefined;

/** Returns the (number) value of the enum for the given string value (ignoring case), or the given defaultValue. */
export function parseEnum<T>(_enum: any, value: Optional<string>, defaultValue: T): T;

/** Returns the (number) value of the enum for the given value, or the given defaultValue. */
export function parseEnum<T>(_enum: any, value: Optional<number>, defaultValue: T): T;

export function parseEnum<T>(_enum: any, value: Optional<string | number>, defaultValue?: T): T | undefined {
	if (isNullOrUndefined(value)) {
		return defaultValue;
	}

	if (typeof(value) === "number") {
		return getEnumValues(_enum).find(val => val === value) as T ?? defaultValue;
	}

	const lower = String(value).toLowerCase();
	const enumKey = Object.keys(_enum).find(key => key.toLowerCase() === lower);
	if (enumKey !== undefined) {
		return _enum[enumKey] ?? defaultValue;
	}
	return defaultValue;
}
