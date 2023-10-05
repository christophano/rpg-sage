import type { Domain, Spell, TMagicTradition } from "../../../sage-pf2e";
import { FocusSpell, Repository, SourceNotationMap } from "../../../sage-pf2e";
import utils, { Optional } from "../../../sage-utils";
import { warn } from "../../../sage-utils/utils/ConsoleUtils";
import type SageMessage from "../model/SageMessage";
import { createCommandRenderableContent, registerCommandRegex } from "./cmd";
import { renderAll } from "./default";
import { registerCommandHelp } from "./help";

// #region Spell
function reduceByLevel<T extends Spell<string, any>>(spells: T[]): T[][] {
	return spells.reduce((byLevel, spell) => {
		(byLevel[spell.level - 1] ?? (byLevel[spell.level - 1] = [])).push(spell);
		return byLevel;
	}, <T[][]>[]);
}

async function spellListA(sageMessage: SageMessage): Promise<void> {
	const levelString = sageMessage.args.shift()!;
	const traditionString = sageMessage.args.shift()!;
	const by = <"school">sageMessage.args.shift();
	_spellList(sageMessage, traditionString, levelString, by);
}
async function spellListB(sageMessage: SageMessage): Promise<void> {
	const traditionString = sageMessage.args.shift()!;
	const levelString = sageMessage.args.shift()!;
	const by = <"school">sageMessage.args.shift();
	_spellList(sageMessage, traditionString, levelString, by);
}
async function _spellList(sageMessage: SageMessage, traditionString: string, levelString: string, by: "school"): Promise<void> {
	/*// debug("spellList", traditionString, levelString);*/
	const content = createCommandRenderableContent(),
		tradition = <TMagicTradition>utils.StringUtils.capitalize(traditionString),
		byTradition = Repository.filter("Spell", spell => spell.traditions.includes(tradition));
	const sourceMap = new SourceNotationMap();
	if (!levelString) {
		if (by === "school") {
			content.setTitle(`<b>${tradition} Spells</b> (${byTradition.length}) <i>by School</i>`);
			const schools = Repository.all("ArcaneSchool");
			schools.forEach(school => {
				const bySchool = byTradition.filter(spell => spell.traits.includes(school.name));
				// let byLevel = bySchool.reduce((levels, spell) => {
				// 	let spellLevel = spell.isCantrip ? 0 : spell.level;
				// 	levels[spellLevel] = (levels[spellLevel] || 0) + 1;
				// 	return levels;
				// }, <number[]>[]);
				// content.appendTitledSection(`<b>${school.name} (${byLevel.length})</b>`, byLevel.map((spellCount, index) => `${index ? utils.NumberUtils.nth(index) : "Cantrips"} (${spellCount})`).join(", "));
				const filteredBySchool = bySchool.filter(spell => spell.traits.includes(school.name));
				sourceMap.addByHasSource(filteredBySchool);
				content.appendTitledSection(`<b>${school.name} (${filteredBySchool.length})</b>`, `${sourceMap.formatNames(filteredBySchool, ", ")}`);
			});
			if (!sourceMap.isEmpty) {
				content.appendTitledSection(`Sources`, sourceMap.formatSourceNames("\n"));
			}
		} else {
			const byLevel = byTradition.reduce((levels, spell) => {
				const spellLevel = spell.isCantrip ? 0 : spell.level;
				levels[spellLevel] = (levels[spellLevel] || 0) + 1;
				return levels;
			}, <number[]>[]);
			content.setTitle(`<b>${tradition} Spells</b> (${byTradition.length}) <i>by Level</i>`);
			/*// byLevel.forEach((spellCount, index) => content.append(`<b>${index ? utils.NumberUtils.nth(index) : "Cantrips"}</b> (${spellCount})`));*/
			content.append(byLevel.map((spellCount, index) => `${index ? utils.NumberUtils.nth(index) : "Cantrips"} (${spellCount})`).join(", "));
		}

	} else {
		const bySchool = by === "school" ? " <i>by School</i>" : "";
		let filtered: Spell[];
		if (levelString.toLowerCase().startsWith("cantrip")) {
			filtered = byTradition.filter(spell => spell.isCantrip);
			content.setTitle(`<b>${tradition} Cantrips</b> (${filtered.length})${bySchool}`);
		} else {
			const level = +levelString.match(/\d+/)![0];
			filtered = byTradition.filter(spell => spell.level === level && !spell.isCantrip);
			content.setTitle(`<b>${utils.NumberUtils.nth(level)} Level ${tradition} Spells</b> (${filtered.length})${bySchool}`);
		}
		sourceMap.addByHasSource(filtered);
		if (bySchool) {
			const schools = Repository.all("ArcaneSchool");
			schools.forEach(school => {
				const filteredBySchool = filtered.filter(spell => spell.traits.includes(school.name));
				content.appendTitledSection(`<b>${school.name} (${filteredBySchool.length})</b>`, `${sourceMap.formatNames(filteredBySchool, ", ")}`);
			});
		} else {
			content.append(sourceMap.formatNames(filtered, ", "));
		}
		if (!sourceMap.isEmpty) {
			content.appendTitledSection(`Sources`, sourceMap.formatSourceNames("\n"));
		}
	}
	sageMessage.send(content);
}
function filterFocusSpells(archetypeName: Optional<string>, className: Optional<string>, domain: Optional<Domain>): FocusSpell[] {
	if (archetypeName) {
		return Repository.filter("FocusSpell", spell => spell.archetypeName === archetypeName);
	}else if (className) {
		return Repository.filter("FocusSpell", spell => spell.traits.includes(className));
	}else if (domain) {
		return Repository.filter("FocusSpell", spell => spell?.domain === domain);
	}else {
		return [];
	}
}
async function spellListFocus(sageMessage: SageMessage): Promise<void> {
	const archetypeOrClassOrDomain = (sageMessage.args.find(s => s?.trim()) || "").trim();
	if (archetypeOrClassOrDomain.toLowerCase() === "help") {
		//TODO: short circuit help command?
		return;
	}

	/*// debug("spellListFocus", archetypeOrClassOrDomain);*/
	const className = Repository.findByValue("Class", archetypeOrClassOrDomain)?.name,
		archetypeName = className ? undefined : Repository.findByValue("Archetype", archetypeOrClassOrDomain)?.name,
		domain = Repository.findByValue("Domain", archetypeOrClassOrDomain),
		content = createCommandRenderableContent();
	content.setTitle(`<b>Focus Spells</b>`);
	if (!archetypeOrClassOrDomain) {
		const focusSpells = Repository.all<Spell>("FocusSpell");

		const allClassNames = Repository.all("Class").map(clss => clss.name);
		const classNames = focusSpells.map(spell => spell.traits.find(trait => allClassNames.includes(trait))).filter(utils.ArrayUtils.Filters.existsAndUnique);
		content.append(`<b>Classes (${classNames.length})</b> ${classNames.map(className => `${className} (${focusSpells.filter(spell => spell.traits.includes(className)).length})`).join(", ")}`);

		const archetypeNames = focusSpells.map(spell => spell.archetypeName).filter(utils.ArrayUtils.Filters.existsAndUnique);
		content.append(`\n<b>Archetypes (${archetypeNames.length})</b> ${archetypeNames.map(archetypeName => `${archetypeName} (${focusSpells.filter(spell => spell.archetypeName === archetypeName).length})`).join(", ")}`);

	} else if (!archetypeName && !className && !domain) {
		if (archetypeOrClassOrDomain.replace(/\W/g, "") === "bysource") {
			for (let renderableContent of renderAll("FocusSpell", "FocusSpells", true)) {
				await sageMessage.send(renderableContent);
			}
			return;
		} else {
			content.append(`<blockquote><i><b>${archetypeOrClassOrDomain}</b> Not Found.</i></blockquote>`);
		}

	} else {
		const filtered = filterFocusSpells(archetypeName, className, domain);
		content.setTitle(`<b>${archetypeName ?? className ?? (domain?.name + " Domain")} Focus Spells</b> (${filtered.length})`);
		const sourceMap = new SourceNotationMap(filtered);

		if (className === "Cleric") {
			const domains = Repository.all("Domain").sort(),
				byDomain = domains.map(d => filtered.filter(spell => spell.domain === d));
			byDomain.forEach((domainSpells, index) => {
				sourceMap.addByHasSource(domainSpells);
				const byLevel = reduceByLevel(domainSpells).filter(spells => spells.length);
				content.append(`<b>${domains[index].name}</b> ${byLevel.map(spells => sourceMap.formatNames(spells)).join(", ")}`);
			});

		} else {
			const byLevel = reduceByLevel(filtered);
			byLevel.forEach((spells, index) => content.append(`<b>Level ${index + 1}</b>`, sourceMap.formatNames(spells, ", ")));
		}

		if (!sourceMap.isEmpty) {
			content.appendTitledSection(`Sources`, sourceMap.formatSourceNames("\n"));
		}
	}
	if (content) {
		await sageMessage.send(content);
	}
}

type TSpecialistListModifier = "+" | "-" | "|" | "&";
const SpecialistCommands = "+-|&";
async function specialistLists(sageMessage: SageMessage): Promise<void> {
	const levelString = sageMessage.args.shift()!;
	const traditionStrings = sageMessage.args;

	const traditionsAndModifiers = traditionStrings.filter(s => s).map(traditionString => {
		let tradition: TMagicTradition;
		let modifier: TSpecialistListModifier = "+";
		const trimmed = traditionString.trim();
		if (SpecialistCommands.includes(trimmed[0])) {
			modifier = <TSpecialistListModifier>trimmed[0];
			tradition = <TMagicTradition>utils.StringUtils.capitalize(trimmed.slice(1).trim());
		} else {
			tradition = <TMagicTradition>utils.StringUtils.capitalize(trimmed);
		}
		return { tradition: tradition, modifier: modifier };
	});

	let spells: Spell[] = [];
	const isCantrip = levelString.startsWith("cantrip");
	const spellLevel = isCantrip ? undefined : +levelString.match(/\d+/)![0];
	const byLevel = Repository.filter("Spell", spell => isCantrip ? spell.isCantrip : !spell.isCantrip && spell.level === spellLevel);
	traditionsAndModifiers.forEach(traditionAndModifier => {
		const byTradition = byLevel.filter(spell => spell.traditions.includes(traditionAndModifier.tradition));
		if (traditionAndModifier.modifier === "+" || traditionAndModifier.modifier === "|") {
			spells.push(...byTradition.filter(spell => !spells.includes(spell)));
		} else if (traditionAndModifier.modifier === "-") {
			spells = spells.filter(spell => !byTradition.includes(spell));
		} else if (traditionAndModifier.modifier === "&") {
			spells = spells.slice().filter(spell => spells.includes(spell) && byTradition.includes(spell));
		} else {
			warn(traditionAndModifier);
		}
	});

	const content = createCommandRenderableContent();
	const spellsLevel = isCantrip ? "Cantrips" : `${utils.NumberUtils.nth(spellLevel!)} Level`;
	const traditionsJoin = traditionsAndModifiers.map(tam => `${tam.modifier} ${tam.tradition}`).join(" ").slice(1);
	content.setTitle(`<b>${spellsLevel} Spells: ${traditionsJoin}</b> (${spells.length})`);
	SourceNotationMap.appendNotatedItems(content, spells);
	sageMessage.send(content);

}

// #endregion

export default function register(): void {
	registerCommandRegex(/^\s*spells\s*(arcane|divine|occult|primal)\s*(\d+(?:\s*st|nd|rd|th)?|cantrips?)?(?:\s*by\s*(school))?\s*$/i, spellListB);
	registerCommandHelp("Spells", `spells {tradition} {level|Cantrips}`);
	registerCommandHelp("Spells", `spells {tradition} {level|Cantrips} by school`);

	registerCommandRegex(/^\s*(\d+(?:\s*st|nd|rd|th)?)\s*(?:level)?\s*(arcane|divine|occult|primal)\s*spells(?:\s*by\s*(school))?\s*$/i, spellListA);
	registerCommandHelp("Spells", `{level} {tradition} spells`);
	registerCommandHelp("Spells", `{level} {tradition} spells by school`);

	registerCommandRegex(/^\s*(arcane|divine|occult|primal)\s*(cantrips?)(?:\s*by\s*(school))?\s*$/i, spellListB);
	registerCommandHelp("Spells", `{tradition} cantrips`);
	registerCommandHelp("Spells", `{tradition} cantrips by school`);

	registerCommandRegex(/^\s*(arcane|divine|occult|primal)\s*spells\s*(\d+(?:\s*st|nd|rd|th)?|cantrips?)?(?:\s*by\s*(school))?\s*$/i, spellListB);
	registerCommandHelp("Spells", `{tradition} spells {level|Cantrips}`);
	registerCommandHelp("Spells", `{tradition} spells {level|Cantrips} by school`);

	registerCommandRegex(/^(?:\s*focus\s*spells\s*(.*?)|\s*(.*?)\s*focus\s*spells)$/i, spellListFocus);
	registerCommandHelp("Spells", "Focus Spells", `focus spells {Archetype|Class|Domain}`);
	registerCommandHelp("Spells", "Focus Spells", `{Archetype|Class|Domain} focus spells`);

	registerCommandRegex(/^\s*spells\s*(\d+(?:\s*st|nd|rd|th)?|cantrips?)\s*(arcane|divine|occult|primal)(\s*(?:\-|\+|\||\&)\s*(?:arcane|divine|occult|primal))?(\s*(?:\-|\+|\||\&)\s*(?:arcane|divine|occult|primal))?(\s*(?:\-|\+|\||\&)\s*(?:arcane|divine|occult|primal))?\s*$/i, specialistLists);
	registerCommandHelp("Spells", "Custom List", `spells {level|Cantrips} {+tradition} {-tradition} {|tradition} {&tradition}`);
}
