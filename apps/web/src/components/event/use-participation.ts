"use client";
// The participant this browser holds for an event: joining, the stored token checked by the
// server, and the unsaved edits of the response with their save. The grid and the poll share it.

import { useEffect, useEffectEvent, useMemo, useRef, useState, useTransition } from "react";

import { type Levels, sameLevels, slotsAt } from "@/domain/levels";
import { useRouter } from "@/i18n/navigation";
import { useTemporalReady, useViewerZone } from "@/lib/browser-time";
import { type LocalEvent, updateLocalEvent, useLocalEvents } from "@/lib/local-events";
import { identifyAction, saveAction } from "@/server/participant-actions";

import type { Joined } from "./join-band";

export type ParticipationEvent = {
	id: string;
	name: string;
	segment: string;
	referenceZone: string;
	slots: string[];
	participants: { name: string; levels: Levels }[];
};

/** What the save bar says: saved, failed, or the organizer changed the slots meanwhile. */
export type BarMessage = "saved" | "failed" | "changed" | null;

type Moves = {
	/** The browser joined as a new participant. */
	onJoined?: () => void;
	/** The browser no longer holds a participant. */
	onLeft?: () => void;
};

const nobody: Levels = {};

function withoutParticipant(stored: LocalEvent | undefined): LocalEvent | undefined {
	if (stored?.adminSecret === undefined) {
		return undefined;
	}

	const { participant: _forgotten, ...rest } = stored;

	return rest;
}

function withPassword(hasPassword: boolean) {
	return (stored: LocalEvent | undefined): LocalEvent | undefined =>
		stored?.participant === undefined || stored.participant.hasPassword === hasPassword
			? stored
			: { ...stored, participant: { ...stored.participant, hasPassword } };
}

export function useParticipation(
	event: ParticipationEvent,
	formatLocale: string,
	moves: Moves = {},
) {
	const router = useRouter();
	const temporalReady = useTemporalReady();
	const viewerZone = useViewerZone();
	const stored = useLocalEvents().get(event.id);
	const [draft, setDraft] = useState<Levels | null>(null);
	const [saveMessage, setSaveMessage] = useState<"saved" | "failed" | null>(null);
	const [saving, startSaving] = useTransition();
	// The organizer deleted this browser's participant, or it left in another tab.
	const [dropped, setDropped] = useState(false);
	const { onJoined, onLeft } = moves;
	const refused = useEffectEvent(() => onLeft?.());

	const token = stored?.participant?.token;

	const joined: Joined | null =
		stored?.participant === undefined
			? null
			: { ...stored.participant, hasPassword: stored.participant.hasPassword ?? false };

	const listed = event.participants.some((participant) => participant.name === joined?.name);
	const confirmedToken = useRef<string | null>(null);

	// A stored token opens the event already joined, once the server confirms it. When
	// the name later leaves the list, the server is asked again; right after
	// joining the name is missing too, until the page reloads, so the list alone cannot decide.
	useEffect(() => {
		if (token === undefined || (listed && confirmedToken.current === token)) {
			return;
		}

		let current = true;

		void identifyAction(event.id, token).then((found) => {
			if (!current) {
				return;
			}

			if (found === null) {
				confirmedToken.current = null;
				updateLocalEvent(event.id, withoutParticipant);
				setDraft(null);
				refused();
				setDropped(true);
			} else {
				confirmedToken.current = token;
				updateLocalEvent(event.id, withPassword(found.hasPassword));
			}
		});

		return () => {
			current = false;
		};
	}, [event.id, token, listed]);

	const mine =
		event.participants.find((participant) => participant.name === joined?.name)?.levels ?? nobody;

	// Edits of slots the organizer removed meanwhile drop out, and the page says so.
	const lostEdits = draft !== null && Object.keys(draft).some((key) => !event.slots.includes(key));

	const edits = useMemo(() => {
		if (draft === null) {
			return null;
		}

		const slots = new Set(event.slots);

		return Object.fromEntries(Object.entries(draft).filter(([key]) => slots.has(key)));
	}, [draft, event.slots]);

	const selection = edits ?? mine;
	const dirty = edits !== null && !sameLevels(edits, mine);

	// Warn before the browser leaves the page with unsaved edits; leaving edit mode asks inside the page.
	useEffect(() => {
		if (!dirty) {
			return;
		}

		const warn = (unload: BeforeUnloadEvent) => unload.preventDefault();

		window.addEventListener("beforeunload", warn);

		return () => window.removeEventListener("beforeunload", warn);
	}, [dirty]);

	function formatTime(instant: string): string {
		if (!temporalReady) {
			return "";
		}

		return Temporal.Instant.from(instant)
			.toZonedDateTimeISO(viewerZone ?? event.referenceZone)
			.toLocaleString(formatLocale, { hour: "numeric", minute: "2-digit" });
	}

	function joinedAs(name: string, newToken: string, passwordSet: boolean) {
		updateLocalEvent(event.id, (current) => ({
			...current,
			id: event.id,
			name: event.name,
			segment: event.segment,
			participant: { name, token: newToken, hasPassword: passwordSet },
		}));
		setDropped(false);
		setDraft(null);
		onJoined?.();
		router.refresh();
	}

	function forget(left: boolean) {
		updateLocalEvent(event.id, withoutParticipant);
		setDraft(null);
		onLeft?.();

		if (left) {
			router.refresh();
		}
	}

	function edit(next: Levels | null) {
		setSaveMessage(null);
		setDraft(next);
	}

	function save() {
		if (joined === null || edits === null) {
			return;
		}

		// The draft keeps only what is saved, which ends the notice about lost edits.
		setDraft(edits);
		startSaving(async () => {
			try {
				const saved = await saveAction(
					event.id,
					joined.token,
					Object.keys(edits),
					slotsAt(edits, "if_need_be"),
				);

				if (saved.ok) {
					setSaveMessage("saved");
					router.refresh();

					return;
				}

				if (saved.problem === "unknown_slot") {
					// The organizer changed the slots; the reload drops the lost edits and
					// `lostEdits` says so.
					setSaveMessage(null);
					router.refresh();

					return;
				}

				forget(false);
				setSaveMessage("failed");
			} catch {
				setSaveMessage("failed");
			}
		});
	}

	const barMessage: BarMessage = lostEdits ? "changed" : saveMessage;

	return {
		joined,
		dropped: dropped && joined === null,
		mine,
		selection,
		dirty,
		saving,
		barMessage,
		/** Replaces the draft; `null` discards it. */
		edit,
		save,
		band: {
			eventId: event.id,
			joined,
			onJoined: joinedAs,
			onForget: forget,
			onPasswordChange: (hasPassword: boolean) =>
				updateLocalEvent(event.id, withPassword(hasPassword)),
			formatTime,
		},
	};
}
