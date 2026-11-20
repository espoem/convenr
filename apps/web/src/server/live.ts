// Live updates with `push` (ADR 0006): one `LISTEN` connection per server process hands each
// event's version changes to the streams of the pages open on that event.
import { Client } from "pg";
import { z } from "zod";

import { env } from "@/env";
import { type EventVersion, parseVersion } from "@/lib/event-version";
import type { LiveSettings } from "@/lib/live-settings";

/** What a stream tells its page: the event's version, or that the event is gone. */
export type LiveChange = { kind: "version"; version: EventVersion } | { kind: "gone" };

export type Watcher = {
	onChange: (change: LiveChange) => void;
	/** The listening connection failed; no further change will arrive. */
	onFailure: () => void;
};

const CHANNEL = "event_version";

const payloadSchema = z.object({ id: z.string(), version: z.string().optional() });

type Listening = { client: Client; watchers: Map<string, Set<Watcher>> };

// One connection per process. Development reloads modules, so it is kept on globalThis there.
declare global {
	var convenrListening: Promise<Listening> | undefined;
}

/** The settings a page needs to follow its event, read from the instance's environment. */
export function liveSettings(): LiveSettings {
	const settings = env();

	return {
		transport: settings.LIVE_UPDATES,
		pollSeconds: settings.LIVE_POLL_SECONDS,
		idleMinutes: settings.LIVE_IDLE_MINUTES,
	};
}

function changeOf(payload: string): { id: string; change: LiveChange } | undefined {
	let parsed: z.infer<typeof payloadSchema>;

	try {
		parsed = payloadSchema.parse(JSON.parse(payload));
	} catch {
		return undefined;
	}

	if (parsed.version === undefined) {
		return { id: parsed.id, change: { kind: "gone" } };
	}

	const version = parseVersion(parsed.version);

	return version === undefined
		? undefined
		: { id: parsed.id, change: { kind: "version", version } };
}

/**
 * Ends the connection after a failure and tells every watcher, so that their pages fall back to
 * checks. The next watch connects again.
 */
function fail(failed: Listening) {
	globalThis.convenrListening = undefined;

	for (const watchers of failed.watchers.values()) {
		for (const watcher of watchers) {
			watcher.onFailure();
		}
	}

	failed.watchers.clear();
	failed.client.removeAllListeners();
	failed.client.on("error", () => {});
	void failed.client.end().catch(() => {});
}

async function listen(): Promise<Listening> {
	const settings = env();

	const client = new Client({
		connectionString: settings.DATABASE_LISTEN_URL ?? settings.DATABASE_URL,
		connectionTimeoutMillis: 10_000,
		keepAlive: true,
	});

	const state: Listening = { client, watchers: new Map() };

	client.on("notification", (message) => {
		const found = message.payload === undefined ? undefined : changeOf(message.payload);

		if (found === undefined) {
			return;
		}

		for (const watcher of state.watchers.get(found.id) ?? []) {
			watcher.onChange(found.change);
		}
	});
	client.on("error", () => fail(state));
	client.on("end", () => fail(state));

	await client.connect();
	await client.query(`LISTEN ${CHANNEL}`);

	return state;
}

function startListening(): Promise<Listening> {
	const started = (globalThis.convenrListening ??= listen());

	// A connection that cannot be made is tried again by the next watch.
	started.catch(() => {
		if (globalThis.convenrListening === started) {
			globalThis.convenrListening = undefined;
		}
	});

	return started;
}

/**
 * Hands every change of event `id` to `watcher` until the returned function is called. Rejects
 * when the server cannot listen, so the caller can refuse the stream.
 */
export async function watchEvent(id: string, watcher: Watcher): Promise<() => void> {
	const { watchers } = await startListening();
	const own = watchers.get(id) ?? new Set();

	own.add(watcher);
	watchers.set(id, own);

	return () => {
		own.delete(watcher);

		if (own.size === 0 && watchers.get(id) === own) {
			watchers.delete(id);
		}
	};
}

/** Closes the listening connection; tests call it so that the process can exit. */
export async function stopListening(): Promise<void> {
	const started = globalThis.convenrListening;

	globalThis.convenrListening = undefined;

	if (started !== undefined) {
		const { client } = await started;

		client.removeAllListeners();
		await client.end();
	}
}
