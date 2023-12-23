import type { Optional } from "../../../../../sage-utils";
import type Game from "../../../model/Game";

type Base = { id:string; name:string; };
type BaseClass = { id:string; name:string; updatePins(): Promise<void>; };

export abstract class Manager<Core extends Base, Class extends BaseClass> {
	public constructor(protected cores: Core[], protected game: Game) { }

	protected abstract changed(): void;
	protected abstract createCore(name: string): Core;
	protected abstract wrap(core: Core): Class;

	public get all(): Class[] { return this.cores.map(core => this.wrap(core)); }
	public get count(): number { return this.cores.length; }
	public get first(): Class | undefined { return this.cores.length ? this.wrap(this.cores[0]) : undefined; }

	public add(name: string): Class | null {
		if (this.has(name)) {
			return null;
		}
		const core = this.createCore(name);
		this.cores.push(core);
		this.changed();
		return this.wrap(core);
	}

	public get(value: Optional<string>): Class | null {
		if (!value) {
			return null;
		}
		const regex = new RegExp(`^${value}$`, "i");
		const core = this.cores.find(core => regex.test(core.id) || regex.test(core.name));
		return core ? this.wrap(core) : null;
	}

	public getOrFirst(value: Optional<string>): Class | null {
		return this.get(value) ?? this.first ?? null;
	}

	public has(classOrValue: string | Class): boolean {
		const value = typeof(classOrValue) === "string" ? classOrValue : classOrValue.id;
		const regex = new RegExp(`^${value}$`, "i");
		return !!this.cores.find(core => regex.test(core.id) || regex.test(core.name));
	}

	public remove(value: string): boolean {
		if (!this.has(value)) {
			return false;
		}
		const regex = new RegExp(`^${value}$`, "i");
		this.cores = this.cores.filter(p => !regex.test(p.id) && !regex.test(p.name));
		this.changed();
		return true;
	}

	public toJSON(): Core[] { return this.cores; }

	public async updatePins(): Promise<void> {
		for (const core of this.cores) {
			const wrapped = this.wrap(core);
			await wrapped.updatePins();
		}
	}
}