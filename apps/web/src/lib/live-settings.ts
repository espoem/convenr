/** How a page follows its event, as the instance is set up (ADR 0006). */
export type LiveSettings = {
	/** `push` holds a stream from the server; `poll` asks for the version at an interval. */
	transport: "push" | "poll";
	/** Seconds between checks, with `poll` or after a stream failed. */
	pollSeconds: number;
	/** Minutes without input after which a visible page stops following. */
	idleMinutes: number;
};
