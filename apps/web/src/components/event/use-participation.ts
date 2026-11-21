"use client";
// The participant this browser joined an event as: joining, the participant the server
// recognized from the browser's key (ADR 0008), and the unsaved edits of the response with
// their save. The grid and the poll share it.

import { useEffect, useEffectEvent, useMemo, useRef, useState, useTransition } from "react";

import { type Levels, sameLevels, slotsAt } from "@/domain/levels";
import { useRouter } from "@/i18n/navigation";
import { useTemporalReady, useViewerZone } from "@/lib/browser-time";
import { type LocalEvent, updateLocalEvent, useLocalEvents } from "@/lib/local-events";
import { moveTokenAction, saveAction } from "@/server/participant-actions";

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

/**
 * What an action answered, standing in for the server's view of the participant until the
 * page's refresh brings a new one. `basis` is the event as the server rendered it when the
 * action answered; every render of the server sends a new object, so a refresh ends the answer.
 */
type Answered = { joined: Joined | null; basis: ParticipationEvent };

const nobody: Levels = {};

function withoutParticipant(stored: LocalEvent | undefined): LocalEvent | undefined {
	if (stored?.adminSecret === undefined) {
		return undefined;
	}

	const { participant: _forgotten, ...rest } = stored;

	return rest;
}

export function useParticipation(
	event: ParticipationEvent,
	viewer: Joined | null,
	formatLocale: string,
	moves: Moves = {},
) {
	const router = useRouter();
	const temporalReady = useTemporalReady();
	const viewerZone = useViewerZone();
	const stored = useLocalEvents().get(event.id);
	const [answered, setAnswered] = useState<Answered | null>(null);
	const [draft, setDraft] = useState<Levels | null>(null);
	const [saveMessage, setSaveMessage] = useState<"saved" | "failed" | null>(null);
	const [saving, startSaving] = useTransition();
	// The organizer deleted this browser's participant, or it left in another tab.
	const [dropped, setDropped] = useState(false);
	const { onJoined, onLeft } = moves;
	const moving = useRef(false);

	const droppedOut = useEffectEvent(() => {
		updateLocalEvent(event.id, withoutParticipant);
		onLeft?.();
	});

	// The moved participant stands in until the refresh brings the server's view of it.
	const moved = useEffectEvent((found: Joined) => setAnswered({ joined: found, basis: event }));

	const joined = answered !== null && answered.basis === event ? answered.joined : viewer;
	const oldToken = stored?.participant?.token;
	const remembered = stored?.participant?.name;

	// A token kept in local storage before the browser had a key moves to the key once.
	useEffect(() => {
		if (oldToken === undefined || moving.current) {
			return;
		}

		moving.current = true;

		void moveTokenAction(event.id, oldToken)
			.then((found) => {
				if (found !== null) {
					moved(found);
				}

				updateLocalEvent(event.id, (current) =>
					found === null || current === undefined
						? withoutParticipant(current)
						: { ...current, participant: { name: found.name } },
				);
				router.refresh();
			})
			.finally(() => {
				moving.current = false;
			});
	}, [event.id, oldToken, router]);

	// The browser remembers joining, but the server no longer knows it: the organizer deleted
	// the participant, it left in another tab, or the cookie is gone. The notice stays after
	// local storage forgets the name, so it is kept in state during the render that finds it.
	const lost = oldToken === undefined && remembered !== undefined && joined === null;

	if (lost && !dropped) {
		setDropped(true);
		setDraft(null);
	}

	useEffect(() => {
		if (lost) {
			droppedOut();
		}
	}, [lost]);

	// The start page lists the events by what local storage remembers, so it follows the server.
	useEffect(() => {
		if (viewer === null || remembered === viewer.name) {
			return;
		}

		updateLocalEvent(event.id, (current) => ({
			...current,
			id: event.id,
			name: event.name,
			segment: event.segment,
			participant: { name: viewer.name },
		}));
	}, [event.id, event.name, event.segment, viewer, remembered]);

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

	function joinedAs(found: Joined) {
		updateLocalEvent(event.id, (current) => ({
			...current,
			id: event.id,
			name: event.name,
			segment: event.segment,
			participant: { name: found.name },
		}));
		setAnswered({ joined: found, basis: event });
		setDropped(false);
		setDraft(null);
		onJoined?.();
		router.refresh();
	}

	function forget() {
		updateLocalEvent(event.id, withoutParticipant);
		setAnswered({ joined: null, basis: event });
		setDraft(null);
		onLeft?.();
		router.refresh();
	}

	function passwordChanged(hasPassword: boolean) {
		if (joined !== null) {
			setAnswered({ joined: { ...joined, hasPassword }, basis: event });
		}

		router.refresh();
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
				const saved = await saveAction(event.id, Object.keys(edits), slotsAt(edits, "if_need_be"));

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

				setSaveMessage("failed");
				router.refresh();
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
			onPasswordChange: passwordChanged,
			formatTime,
		},
	};
}
