"use client";

import { useTranslations } from "next-intl";

import type { EventVersion } from "@/lib/event-version";
import type { LiveSettings } from "@/lib/live-settings";
import { useLiveUpdates } from "@/lib/live-updates";

type LiveUpdatesProps = { eventId: string; version: EventVersion; settings: LiveSettings };

/**
 * Follows the event's changes, and says so while it stops for an idle viewer. The notice floats
 * above the page, so it moves nothing when it appears.
 */
export function LiveUpdates({ eventId, version, settings }: LiveUpdatesProps) {
	const t = useTranslations("Event");
	const { paused } = useLiveUpdates(eventId, version, settings);

	return (
		<output
			aria-live="polite"
			className="pointer-events-none fixed inset-x-4 top-4 z-30 mx-auto block w-fit max-w-(--cv-measure) rounded-md border border-earth bg-surface px-4 py-2 text-sm empty:hidden"
		>
			{paused ? t("paused") : ""}
		</output>
	);
}
