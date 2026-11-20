"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

type ZoneNoticeProps = {
	referenceZone: string;
	viewerZone: string | null;
	/** A weekday event's times are not converted, so it has no switch. */
	dated: boolean;
	/** The times are a poll's options rather than a grid. */
	poll?: boolean;
	inReferenceZone: boolean;
	onSwitch: () => void;
};

const spaced = (zone: string) => zone.replaceAll("_", " ");

/** Which zone the times are shown in, and the switch to the other one, for a viewer elsewhere. */
export function ZoneNotice({
	referenceZone,
	viewerZone,
	dated,
	poll = false,
	inReferenceZone,
	onSwitch,
}: ZoneNoticeProps) {
	const t = useTranslations("Event");

	if (viewerZone === null || viewerZone === referenceZone) {
		return null;
	}

	function notice(zone: string) {
		if (!dated) {
			return t("weekdaysNotConverted", { zone: spaced(referenceZone) });
		}

		if (poll) {
			return inReferenceZone
				? t("pollShownInReferenceZone", { zone: spaced(referenceZone) })
				: t("pollShownInZone", { zone: spaced(zone) });
		}

		return inReferenceZone
			? t("shownInReferenceZone", { zone: spaced(referenceZone) })
			: t("shownInZone", { zone: spaced(zone) });
	}

	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
			<p className="max-w-(--cv-measure) font-semibold">{notice(viewerZone)}</p>
			{dated ? (
				<Button type="button" variant="outline" onClick={onSwitch}>
					{inReferenceZone
						? t("showViewerZone")
						: t("showReferenceZone", { zone: spaced(referenceZone) })}
				</Button>
			) : null}
		</div>
	);
}
