"use client";
// The event page's version check: polls the event's version and refreshes the page when it moves.

import { useEffect } from "react";

import { useRouter } from "@/i18n/navigation";
import type { EventVersion } from "@/lib/event-version";
import { eventVersionAction } from "@/server/event-actions";

const INTERVAL_MS = 15_000;

/**
 * Asks for the version of event `id` every 15 seconds while the page is visible, and at once
 * when it becomes visible again. A different version, or none once the event is deleted,
 * renders the page again on the server; client state such as unsaved edits stays.
 */
export function useVersionCheck(id: string, version: EventVersion): void {
	const router = useRouter();

	useEffect(() => {
		let current = true;

		async function ask() {
			if (document.visibilityState !== "visible") {
				return;
			}

			try {
				const latest = await eventVersionAction(id);

				if (current && latest !== version) {
					router.refresh();
				}
			} catch {
				// A failed check waits for the next one; the page stays usable as it is.
			}
		}

		function check() {
			void ask();
		}

		const timer = setInterval(check, INTERVAL_MS);

		// A page that becomes hidden asks nothing, since `ask` checks the visibility first.
		document.addEventListener("visibilitychange", check);

		return () => {
			current = false;
			clearInterval(timer);
			document.removeEventListener("visibilitychange", check);
		};
	}, [id, version, router]);
}
