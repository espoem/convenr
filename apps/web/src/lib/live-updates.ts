"use client";
// How an open event page or manage page learns of a new version (ADR 0006): a stream from the
// server with `push`, or checks at an interval with `poll`. A different version, or none once the
// event is gone, renders the page again on the server; client state such as unsaved edits stays.

import { useEffect, useRef, useState } from "react";

import { useRouter } from "@/i18n/navigation";
import { type EventVersion, parseVersion } from "@/lib/event-version";
import type { LiveSettings } from "@/lib/live-settings";
import { eventVersionAction } from "@/server/event-actions";

// A stream that fails this often in a row gives way to checks, until the retry below.
const FAILURES_BEFORE_FALLBACK = 2;
const STREAM_RETRY_MS = 5 * 60_000;

// A stream the server refused is opened again after the delay the server asks for.
const REOPEN_MS = 1000;

const INPUTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * Follows event `id` while the page is visible and someone uses it. A hidden page stops, and so
 * does a visible page without input for the idle time; it resumes at once on the next input,
 * focus or return to the page. Returns whether updates are paused for being idle.
 */
export function useLiveUpdates(id: string, version: EventVersion, settings: LiveSettings) {
	const router = useRouter();
	const [paused, setPaused] = useState(false);
	// The shown version changes with every reload; the stream stays open across them.
	const shown = useRef(version);
	const { transport, pollSeconds, idleMinutes } = settings;

	useEffect(() => {
		shown.current = version;
	}, [version]);

	useEffect(() => {
		let source: EventSource | null = null;
		let pollTimer: ReturnType<typeof setInterval> | undefined;
		let idleTimer: ReturnType<typeof setTimeout> | undefined;
		let retryTimer: ReturnType<typeof setTimeout> | undefined;
		let reopenTimer: ReturnType<typeof setTimeout> | undefined;
		let streaming = transport === "push";
		let failures = 0;
		// Whether the current connection has said anything; a failure before that counts.
		let delivered = false;
		let idle = false;
		let ended = false;

		function changed(latest: EventVersion | null) {
			if (!ended && latest !== shown.current) {
				router.refresh();
			}
		}

		async function check() {
			try {
				changed(await eventVersionAction(id));
			} catch {
				// A failed check waits for the next one; the page stays usable as it is.
			}
		}

		function active() {
			return !ended && !idle && document.visibilityState === "visible";
		}

		function stop() {
			source?.close();
			source = null;
			clearInterval(pollTimer);
			pollTimer = undefined;
			clearTimeout(reopenTimer);
		}

		function startPolling() {
			pollTimer ??= setInterval(() => void check(), pollSeconds * 1000);
		}

		function fallBack() {
			stop();
			streaming = false;
			startPolling();
			retryTimer = setTimeout(() => {
				streaming = true;
				failures = 0;
				stop();
				start();
			}, STREAM_RETRY_MS);
		}

		function openStream() {
			const opened = new EventSource(`/api/live/${encodeURIComponent(id)}`);

			source = opened;
			delivered = false;
			opened.addEventListener("version", (event) => {
				delivered = true;
				failures = 0;

				const latest = parseVersion(String(event.data));

				if (latest !== undefined) {
					changed(latest);
				}
			});
			opened.addEventListener("gone", () => {
				delivered = true;
				changed(null);
			});
			opened.addEventListener("error", () => {
				if (!delivered) {
					failures += 1;
				}

				delivered = false;

				if (failures >= FAILURES_BEFORE_FALLBACK) {
					fallBack();

					return;
				}

				// A refused stream is not retried by the browser; a dropped one is.
				if (opened.readyState === EventSource.CLOSED && source === opened) {
					source = null;
					reopenTimer = setTimeout(start, REOPEN_MS);
				}
			});
		}

		function start() {
			if (!active()) {
				return;
			}

			if (streaming) {
				if (source === null) {
					openStream();
				}
			} else {
				startPolling();
			}
		}

		/** Back from hidden or idle: a stream reports the version when it opens, a check asks. */
		function resume() {
			if (!active()) {
				return;
			}

			if (!streaming) {
				void check();
			}

			start();
		}

		function wake() {
			clearTimeout(idleTimer);
			idleTimer = setTimeout(() => {
				idle = true;
				setPaused(true);
				stop();
			}, idleMinutes * 60_000);

			if (idle) {
				idle = false;
				setPaused(false);
				resume();
			}
		}

		function visibility() {
			if (document.visibilityState === "visible") {
				const wasIdle = idle;

				// Waking an idle page resumes it already.
				wake();

				if (!wasIdle) {
					resume();
				}
			} else {
				stop();
			}
		}

		for (const input of INPUTS) {
			window.addEventListener(input, wake, { passive: true });
		}

		window.addEventListener("focus", wake);
		document.addEventListener("visibilitychange", visibility);
		wake();
		start();

		return () => {
			ended = true;
			stop();
			clearTimeout(idleTimer);
			clearTimeout(retryTimer);

			for (const input of INPUTS) {
				window.removeEventListener(input, wake);
			}

			window.removeEventListener("focus", wake);
			document.removeEventListener("visibilitychange", visibility);
		};
	}, [id, router, transport, pollSeconds, idleMinutes]);

	return { paused };
}
