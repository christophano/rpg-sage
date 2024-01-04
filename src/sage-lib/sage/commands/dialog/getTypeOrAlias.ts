import { matchDialogType } from "./matchDialogType";
import { getDialogTypeOrAliasRegex } from "./regex";

export function getTypeOrAlias(content: string) {
	// make sure we have a valid start
	const typeOrAliasMatch = getDialogTypeOrAliasRegex().exec(content);
	if (!typeOrAliasMatch) {
		return null;
	}

	// get type or alias
	const typeOrAlias = typeOrAliasMatch[1];
	const type = matchDialogType(typeOrAlias);
	const alias = !type ? typeOrAlias : undefined;

	// get length of type or alias plus two semicolons
	const length = typeOrAlias.length;

	return { type, alias, length };
}