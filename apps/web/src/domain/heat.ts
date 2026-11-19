import { scoreOf, type Tally } from "./levels";

/** Heat steps: 0 none, 1 up to 25 %, 2 up to 50 %, 3 up to 75 %, 4 above 75 %. */
export type HeatStep = 0 | 1 | 2 | 3 | 4;

/** The heat step of a slot answered as `tally` by `participants`: its score as a share of them. */
export function heatStep(tally: Tally, participants: number): HeatStep {
	// The score in halves keeps the comparisons in integers, so the 25 %, 50 % and 75 %
	// boundaries do not round.
	const halves = 2 * scoreOf(tally);

	if (halves <= 0 || participants <= 0) {
		return 0;
	}

	if (2 * halves <= participants) {
		return 1;
	}

	if (halves <= participants) {
		return 2;
	}

	if (2 * halves <= 3 * participants) {
		return 3;
	}

	return 4;
}
