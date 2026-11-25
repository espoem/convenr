// How a participant answers a slot: available or if need be. A slot with neither is not available.

export const LEVELS = ["available", "if_need_be"] as const;

export type Level = (typeof LEVELS)[number];

/** A response: the level of each slot the participant marked, by slot key. */
export type Levels = Readonly<Record<string, Level>>;

/** How many people answered a slot or a window at each level. */
export type Tally = { available: number; ifNeedBe: number };

/** Each available person counts 1 and each at if need be ½, so the score is in halves. */
export function scoreOf(tally: Tally): number {
	return tally.available + tally.ifNeedBe / 2;
}

/** Everyone who answered with a level. */
export function headsOf(tally: Tally): number {
	return tally.available + tally.ifNeedBe;
}

/**
 * The level of a cell that holds `keys`, of which there can be two: none unless every slot has a
 * level, and if need be when any of them is.
 */
export function cellLevel(levels: Levels, keys: readonly string[]): Level | null {
	const found = keys.map((key) => levels[key]);

	if (found.length === 0 || found.includes(undefined)) {
		return null;
	}

	return found.includes("if_need_be") ? "if_need_be" : "available";
}

/** Counts available and if-need-be responses for `keys`. */
export function tallyIn(responses: readonly Levels[], keys: readonly string[]): Tally {
	let available = 0;
	let ifNeedBe = 0;

	for (const levels of responses) {
		const level = cellLevel(levels, keys);

		if (level === "available") {
			available += 1;
		} else if (level === "if_need_be") {
			ifNeedBe += 1;
		}
	}

	return { available, ifNeedBe };
}

export type LevelsInput = {
	/** Every slot with a level. */
	available: readonly string[];
	/** The slots among `available` at if need be, or left out to keep the stored levels. */
	ifNeedBe?: readonly string[] | undefined;
};

type LevelsResult =
	| { ok: true; levels: Levels }
	/** `notAvailable` holds the index in `ifNeedBe` of each slot missing from `available`. */
	| { ok: false; notAvailable: number[] };

/**
 * The response a save asks for. Without `ifNeedBe` a slot keeps its stored level and a new slot
 * is available, so a client that knows no levels does not lose them by saving.
 */
export function savedLevels(input: LevelsInput, stored: Levels): LevelsResult {
	const marked = new Set(input.available);

	const notAvailable = (input.ifNeedBe ?? []).flatMap((key, index) =>
		marked.has(key) ? [] : [index],
	);

	if (notAvailable.length > 0) {
		return { ok: false, notAvailable };
	}

	const ifNeedBe = new Set(input.ifNeedBe);

	const levelOf = (key: string): Level => {
		if (input.ifNeedBe === undefined) {
			return stored[key] ?? "available";
		}

		return ifNeedBe.has(key) ? "if_need_be" : "available";
	};

	return { ok: true, levels: Object.fromEntries([...marked].map((key) => [key, levelOf(key)])) };
}

/** What painting writes: a level, or clearing it. */
export type Brush = Level | "clear";

/**
 * The state a press gives a cell at `current`: the brush's level, or none when the cell already
 * has it. Dragging and a keyboard rectangle apply this state of the start cell to every cell.
 */
export function pressedLevel(current: Level | null, brush: Brush): Level | null {
	return brush === "clear" || current === brush ? null : brush;
}

/** `levels` with every slot of `keys` at `level`, or without a level when it is `null`. */
export function withLevel(levels: Levels, keys: readonly string[], level: Level | null): Levels {
	const changed = new Set(keys);
	const kept = Object.entries(levels).filter(([key]) => !changed.has(key));
	const added = level === null ? [] : [...changed].map((key): [string, Level] => [key, level]);

	return Object.fromEntries([...kept, ...added]);
}

/** The slots of `levels` at `level`. */
export function slotsAt(levels: Levels, level: Level): string[] {
	return Object.keys(levels).filter((key) => levels[key] === level);
}

export function sameLevels(left: Levels, right: Levels): boolean {
	const keys = Object.keys(left);

	return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}
