"use client";
// What the browser knows about time: whether Temporal is available, and the viewer's zone.
// Both are unknown during server rendering, so components first render without them.

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

let temporalReady = typeof globalThis.Temporal !== "undefined";
let loading: Promise<void> | undefined;

function subscribeToTemporal(listener: () => void): () => void {
	listeners.add(listener);

	// ADR 0002 item 7: only a browser without Temporal loads the polyfill.
	loading ??= temporalReady
		? Promise.resolve()
		: import("temporal-polyfill/global").then(() => {
				temporalReady = true;

				for (const waiting of listeners) {
					waiting();
				}
			});

	return () => listeners.delete(listener);
}

/** Whether `Temporal` can be used in this render. */
export function useTemporalReady(): boolean {
	return useSyncExternalStore(
		subscribeToTemporal,
		() => temporalReady,
		() => false,
	);
}

/** The viewer's IANA zone, or `null` during server rendering. */
export function useViewerZone(): string | null {
	return useSyncExternalStore(
		// The zone of a running page does not change.
		() => () => undefined,
		() => Intl.DateTimeFormat().resolvedOptions().timeZone,
		() => null,
	);
}
