"use client";
// The browser's own record of its events: spec rules B1 to B4 and ADR 0003 item 10.
// Storage can be missing, full or blocked; the record then lives in memory until the page
// unloads, so the current visit still works.

import { useSyncExternalStore } from "react";
import { z } from "zod";

const localEventSchema = z.object({
	id: z.string(),
	name: z.string(),
	segment: z.string(),
	adminSecret: z.string().optional(),
	participant: z.object({ name: z.string(), token: z.string() }).optional(),
});

export type LocalEvent = z.infer<typeof localEventSchema>;

/** Events by id, in the order they were last changed, the most recent last (rule B3). */
export type LocalEvents = ReadonlyMap<string, LocalEvent>;

const STORAGE_KEY = "convenr.events";
const storedEvents = z.record(z.string(), localEventSchema).catch({});
const listeners = new Set<() => void>();
const noEvents: LocalEvents = new Map();

let cachedText: string | null | undefined;
let cachedEvents = noEvents;
let inMemory: LocalEvents | undefined;

function readText(): string | null {
	try {
		return localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}

function parse(text: string | null): LocalEvents {
	if (text === null) {
		return noEvents;
	}

	try {
		return new Map(Object.entries(storedEvents.parse(JSON.parse(text))));
	} catch {
		return noEvents;
	}
}

function snapshot(): LocalEvents {
	if (inMemory !== undefined) {
		return inMemory;
	}

	const text = readText();

	if (text !== cachedText) {
		cachedText = text;
		cachedEvents = parse(text);
	}

	return cachedEvents;
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	window.addEventListener("storage", listener);

	return () => {
		listeners.delete(listener);
		window.removeEventListener("storage", listener);
	};
}

/** Every event this browser holds. Empty during server rendering. */
export function useLocalEvents(): LocalEvents {
	return useSyncExternalStore(subscribe, snapshot, () => noEvents);
}

/**
 * Replaces the record of event `id` with what `change` returns, or deletes it when `change`
 * returns `undefined`.
 */
export function updateLocalEvent(
	id: string,
	change: (current: LocalEvent | undefined) => LocalEvent | undefined,
): void {
	const events = new Map(snapshot());
	const next = change(events.get(id));

	// Deleting first moves a changed event to the end, which keeps rule B3's order.
	events.delete(id);

	if (next !== undefined) {
		events.set(id, next);
	}

	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(events)));
		inMemory = undefined;
	} catch {
		inMemory = events;
	}

	for (const listener of listeners) {
		listener();
	}
}
