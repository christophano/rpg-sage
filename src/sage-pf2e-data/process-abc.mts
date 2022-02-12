import utils, { isDefined } from "../sage-utils";
import { allCores, debug, info, warn } from "./common.mjs";
import type { TCore } from "./types.mjs";

export function processAbcData() {
	info(`\nCreating abc-data.json ...`);
	const abcData: TCore[] = [];
	const sources = allCores.filter(core => {
		delete core.features;
		return core.objectType === "Source";
	});
	sources.forEach(src => {
		const bySource = allCores.filter(core => core.source === src.code);
		const ancestries = bySource.filter(core => core.objectType === "Ancestry");
		const heritages = bySource.filter(core => core.objectType === "Heritage");
		const versatileHeritages = bySource.filter(core => core.objectType === "VersatileHeritage");
		const backgrounds = bySource.filter(core => core.objectType === "Background");
		const classes = bySource.filter(core => core.objectType === "Class");
		const classPaths = bySource.filter(core => core.objectType === "ClassPath");
		const archetypes = bySource.filter(core => core.objectType === "Archetype");
		const dedications = archetypes.map(archetype => bySource.find(core => core.objectType === "DedicationFeat" && [archetype.name, `${archetype.name} Dedication`].includes(core.name)));
		dedications.forEach((d, i) => { if (!d) warn(`Archetype "${archetypes[i].name}" missing Dedication!`); });
		if (ancestries.length || heritages.length || versatileHeritages.length || backgrounds.length || classes.length || classPaths.length || archetypes.length) {
			debug(`\tAdding ${src.name} to abc-data.json`);
			abcData.push(src);
			ancestries.forEach(a => {
				abcData.push(a);
				abcData.push(...heritages.filter(h => h.ancestry === a.name));
			});
			abcData.push(...versatileHeritages);
			abcData.push(...backgrounds);
			classes.forEach(c => {
				abcData.push(c);
				abcData.push(...classPaths.filter(cp => cp.class === c.name));
			});
			abcData.push(...archetypes);
			abcData.push(...dedications.filter(isDefined) as TCore[]);
		}
	});
	utils.FsUtils.writeFileSync("./data/abc-data.json", abcData, false, true);
	info(`Creating abc-data.json ... done!`);
}
