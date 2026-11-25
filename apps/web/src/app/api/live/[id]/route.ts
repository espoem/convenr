// The stream of an event's versions for its open pages (ADR 0006). A web route, not part of the
// API: it exists only while the instance pushes changes. It carries the version and the fact that
// the event is gone, nothing else, so like the share link it needs no secret.
import { connection } from "next/server";

import { env } from "@/env";
import { versionText } from "@/lib/event-version";
import { eventVersion } from "@/server/events";
import { type LiveChange, watchEvent } from "@/server/live";

const HEARTBEAT_MS = 15_000;
const encoder = new TextEncoder();

function message(change: LiveChange): string {
	return change.kind === "gone"
		? "event: gone\ndata: \n\n"
		: `event: version\ndata: ${versionText(change.version)}\n\n`;
}

export async function GET(request: Request, { params }: RouteContext<"/api/live/[id]">) {
	await connection();

	const settings = env();
	const { id } = await params;

	if (settings.LIVE_UPDATES !== "push" || id.length > 64) {
		return new Response(null, { status: 404 });
	}

	let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
	let closed = false;
	let unwatch: (() => void) | undefined;
	let heartbeat: ReturnType<typeof setInterval> | undefined;
	let limit: ReturnType<typeof setTimeout> | undefined;

	function close() {
		if (closed) {
			return;
		}

		closed = true;
		clearInterval(heartbeat);
		clearTimeout(limit);
		request.signal.removeEventListener("abort", close);
		unwatch?.();

		try {
			controller?.close();
		} catch {
			// The page already went away.
		}
	}

	function send(text: string) {
		if (!closed) {
			try {
				controller?.enqueue(encoder.encode(text));
			} catch {
				close();
			}
		}
	}

	function deliver(change: LiveChange) {
		send(message(change));

		if (change.kind === "gone") {
			close();
		}
	}

	const body = new ReadableStream<Uint8Array>({
		start(started) {
			controller = started;
		},
		cancel: close,
	});

	try {
		// Watching starts before the version is read, so no change falls between the two.
		unwatch = await watchEvent(id, { onChange: deliver, onFailure: close });
	} catch {
		return new Response(null, { status: 503 });
	}

	let version;

	try {
		version = await eventVersion(id);
	} catch {
		unwatch?.();

		return new Response(null, { status: 503 });
	}

	// The page opens a new stream a second after this one ends.
	send("retry: 1000\n\n");
	deliver(version === null ? { kind: "gone" } : { kind: "version", version });

	if (!closed && !request.signal.aborted) {
		heartbeat = setInterval(() => send(": still here\n\n"), HEARTBEAT_MS);
		limit = setTimeout(close, settings.LIVE_STREAM_SECONDS * 1000);
		request.signal.addEventListener("abort", close);
	} else {
		close();
	}

	return new Response(body, {
		headers: {
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
			// Proxies that buffer responses would hold the versions back.
			"X-Accel-Buffering": "no",
		},
	});
}
