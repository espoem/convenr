/** Heat steps of spec rule V2: 0 none, 1 up to 25 %, 2 up to 50 %, 3 up to 75 %, 4 above 75 %. */
export type HeatStep = 0 | 1 | 2 | 3 | 4;

/** The heat step of a slot where `available` of `participants` are available (V2). */
export function heatStep(available: number, participants: number): HeatStep {
	if (available <= 0 || participants <= 0) {
		return 0;
	}

	// Integer comparisons avoid rounding at the 25 %, 50 % and 75 % boundaries.
	if (4 * available <= participants) {
		return 1;
	}

	if (2 * available <= participants) {
		return 2;
	}

	if (4 * available <= 3 * participants) {
		return 3;
	}

	return 4;
}
