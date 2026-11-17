"use client";

import { useSyncExternalStore } from "react";

function ignoreChanges(): () => void {
	return () => {};
}

/** The address the visitor reached the service under, or `null` during server rendering. */
export function useOrigin(): string | null {
	return useSyncExternalStore(
		ignoreChanges,
		() => window.location.origin,
		() => null,
	);
}
