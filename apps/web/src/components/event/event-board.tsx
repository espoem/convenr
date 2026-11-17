"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { maximalWindows, sameWindow, type Window } from "@/domain/best-windows";
import { gridView, type GridView } from "@/domain/grid-labels";
import { datedLayout } from "@/domain/grid-layout";
import { heatStep } from "@/domain/heat";
import type { Weekday } from "@/domain/schedule";
import { useRouter } from "@/i18n/navigation";
import { useTemporalReady, useViewerZone } from "@/lib/browser-time";
import { type LocalEvent, updateLocalEvent, useLocalEvents } from "@/lib/local-events";
import { cn } from "@/lib/utils";
import { identifyAction, saveAction } from "@/server/participant-actions";

import { AvailabilityGrid, type CellRef } from "./availability-grid";
import { BestWindows } from "./best-windows";
import { type Joined, JoinBand } from "./join-band";
import { SlotDetail } from "./slot-detail";

export type BoardEvent = {
	id: string;
	name: string;
	segment: string;
	dated: boolean;
	referenceZone: string;
	firstDayOfWeek: Weekday;
	slotLength: number;
	/** Rows of one day, to reserve the grid's height before the browser lays it out. */
	rowCount: number;
	slots: string[];
	participants: { name: string; available: string[] }[];
};

type EventBoardProps = {
	event: BoardEvent;
	/** A weekday event's grid, laid out by the server (ADR 0002 item 9). */
	weekdayView: GridView | null;
	formatLocale: string;
};

const HEAT = ["bg-heat-0", "bg-heat-1", "bg-heat-2", "bg-heat-3", "bg-heat-4"] as const;
const DETAIL_WIDTH = 288;
const nobody: ReadonlySet<string> = new Set();

function withoutParticipant(stored: LocalEvent | undefined): LocalEvent | undefined {
	if (stored?.adminSecret === undefined) {
		return undefined;
	}

	const { participant: _forgotten, ...rest } = stored;

	return rest;
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
	return left.size === right.size && [...left].every((key) => right.has(key));
}

/** The event page below its header: join band, tabs, grid and participants (spec 6 and 8). */
export function EventBoard({ event, weekdayView, formatLocale }: EventBoardProps) {
	const t = useTranslations("Event");
	const id = useId();
	const router = useRouter();
	const temporalReady = useTemporalReady();
	const viewerZone = useViewerZone();
	const stored = useLocalEvents().get(event.id);
	const wrapper = useRef<HTMLDivElement>(null);
	const [hasPassword, setHasPassword] = useState(false);
	const [tab, setTab] = useState<"group" | "me">("group");
	const [draft, setDraft] = useState<Set<string> | null>(null);
	const [confirmDiscard, setConfirmDiscard] = useState(false);
	const [inspected, setInspected] = useState<{ cell: CellRef; x: number; y: number } | null>(null);
	const [person, setPerson] = useState<string | null>(null);
	const [saveMessage, setSaveMessage] = useState<"saved" | "failed" | "changed" | null>(null);
	const [saving, startSaving] = useTransition();
	// Rule Z1: not stored, so every visit starts in the viewer's zone.
	const [inReferenceZone, setInReferenceZone] = useState(false);
	const [chosenWindow, setChosenWindow] = useState<Window | null>(null);

	const token = stored?.participant?.token;

	const joined: Joined | null =
		stored?.participant === undefined ? null : { ...stored.participant, hasPassword };

	// Rule B2: a stored token opens the event already joined, once the server confirms it.
	useEffect(() => {
		if (token === undefined) {
			return;
		}

		let current = true;

		void identifyAction(event.id, token).then((found) => {
			if (!current) {
				return;
			}

			if (found === null) {
				updateLocalEvent(event.id, withoutParticipant);
			} else {
				setHasPassword(found.hasPassword);
			}
		});

		return () => {
			current = false;
		};
	}, [event.id, token]);

	const zoneDiffers = event.dated && viewerZone !== null && viewerZone !== event.referenceZone;
	const shownZone = inReferenceZone ? event.referenceZone : viewerZone;

	const view = useMemo(() => {
		if (weekdayView !== null) {
			return weekdayView;
		}

		return temporalReady && shownZone !== null
			? gridView(
					datedLayout(event.slots, shownZone, event.firstDayOfWeek),
					event.slotLength,
					formatLocale,
				)
			: null;
	}, [weekdayView, temporalReady, shownZone, event, formatLocale]);

	const windows = useMemo(
		() => (view === null ? [] : maximalWindows(view.layout, event.slotLength, event.participants)),
		[view, event.slotLength, event.participants],
	);

	// A window from before a reload or a zone switch may no longer exist.
	const highlight = windows.find((window) => sameWindow(chosenWindow, window)) ?? null;

	const availableIn = useMemo(() => {
		const names = new Map<string, Set<string>>();

		for (const participant of event.participants) {
			for (const key of participant.available) {
				names.set(key, (names.get(key) ?? new Set()).add(participant.name));
			}
		}

		return names;
	}, [event.participants]);

	const total = event.participants.length;

	const mine = useMemo(
		() =>
			new Set(
				event.participants.find((participant) => participant.name === joined?.name)?.available,
			),
		[event.participants, joined?.name],
	);

	// Edits of slots the organizer removed meanwhile drop out (Phase 2 rule M9).
	const edits = useMemo(() => {
		if (draft === null) {
			return null;
		}

		const slots = new Set(event.slots);

		return new Set([...draft].filter((key) => slots.has(key)));
	}, [draft, event.slots]);

	const selection = edits ?? mine;
	const dirty = edits !== null && !sameSet(edits, mine);

	// Rule I6 for leaving the page; leaving edit mode asks inside the page.
	useEffect(() => {
		if (!dirty) {
			return;
		}

		const warn = (unload: BeforeUnloadEvent) => unload.preventDefault();

		window.addEventListener("beforeunload", warn);

		return () => window.removeEventListener("beforeunload", warn);
	}, [dirty]);

	const namesIn = (keys: readonly string[]) => availableIn.get(keys[0] ?? "") ?? nobody;

	function showTab(next: "group" | "me") {
		if (next === "group" && dirty) {
			setConfirmDiscard(true);

			return;
		}

		setConfirmDiscard(false);
		setInspected(null);
		setDraft(null);
		setTab(next);
	}

	function formatTime(instant: string): string {
		if (!temporalReady) {
			return "";
		}

		return Temporal.Instant.from(instant)
			.toZonedDateTimeISO(viewerZone ?? event.referenceZone)
			.toLocaleString(formatLocale, { hour: "numeric", minute: "2-digit" });
	}

	function joinedAs(name: string, newToken: string, withPassword: boolean) {
		updateLocalEvent(event.id, (current) => ({
			...current,
			id: event.id,
			name: event.name,
			segment: event.segment,
			participant: { name, token: newToken },
		}));
		setHasPassword(withPassword);
		setDraft(null);
		setTab("me");
		router.refresh();
	}

	function forget(left: boolean) {
		updateLocalEvent(event.id, withoutParticipant);
		setDraft(null);
		setTab("group");

		if (left) {
			router.refresh();
		}
	}

	function save() {
		if (joined === null || edits === null) {
			return;
		}

		const keys = [...edits];

		startSaving(async () => {
			try {
				const saved = await saveAction(event.id, joined.token, keys);

				if (saved.ok) {
					setSaveMessage("saved");
					router.refresh();

					return;
				}

				if (saved.problem === "unknown-slot") {
					// The organizer changed the days or times; load them and keep the valid edits.
					setSaveMessage("changed");
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

	function inspect(cell: CellRef | null, box: DOMRect | null) {
		const area = wrapper.current?.getBoundingClientRect();

		if (cell === null || box === null || area === undefined) {
			setInspected(null);

			return;
		}

		const beside = box.right - area.left + 8;

		const x =
			beside + DETAIL_WIDTH > area.width
				? Math.max(box.left - area.left - DETAIL_WIDTH - 8, 0)
				: beside;

		setInspected({ cell, x, y: box.top - area.top });
	}

	const zoneNotice = (() => {
		if (viewerZone === null || viewerZone === event.referenceZone) {
			return null;
		}

		if (!event.dated) {
			return t("weekdaysNotConverted", { zone: event.referenceZone.replaceAll("_", " ") });
		}

		return inReferenceZone
			? t("shownInReferenceZone", { zone: event.referenceZone.replaceAll("_", " ") })
			: t("shownInZone", { zone: viewerZone.replaceAll("_", " ") });
	})();

	const detailKeys =
		inspected === null || view === null
			? []
			: (view.layout.blocks.flat()[inspected.cell.column]?.cells[inspected.cell.row] ?? []);

	const detailNames = namesIn(detailKeys);
	const detailTime = inspected === null ? undefined : view?.rows[inspected.cell.row];

	function renderGrid() {
		if (view === null) {
			// ADR 0002 item 9: the space is reserved until the browser lays out the dated grid.
			return <div aria-hidden style={{ height: `${(event.rowCount + 2) * 1.75}rem` }} />;
		}

		if (tab === "group") {
			return (
				<AvailabilityGrid
					view={view}
					slotLength={event.slotLength}
					label={t("groupGrid")}
					fill={(keys) => {
						const names = namesIn(keys);

						if (person !== null) {
							return names.has(person) ? "bg-heat-4" : "bg-heat-0";
						}

						return HEAT[heatStep(names.size, total)];
					}}
					describe={(keys) => t("count", { available: namesIn(keys).size, total })}
					onInspect={inspect}
					inspected={inspected?.cell}
					highlight={highlight}
				/>
			);
		}

		return (
			<AvailabilityGrid
				view={view}
				slotLength={event.slotLength}
				label={t("myGrid")}
				fill={(keys) => (keys.every((key) => selection.has(key)) ? "bg-heat-4" : "bg-heat-0")}
				describe={(keys) =>
					keys.every((key) => selection.has(key)) ? t("youCan") : t("youCannot")
				}
				edit={{
					selection,
					onChange: (next) => {
						setSaveMessage(null);
						setDraft(next);
					},
				}}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<JoinBand
				eventId={event.id}
				joined={joined}
				onJoined={joinedAs}
				onForget={forget}
				onPasswordChange={setHasPassword}
				formatTime={formatTime}
			/>

			<div className="flex flex-col gap-4">
				<div role="tablist" aria-label={t("tabs")} className="flex gap-1 border-b border-earth">
					{(["me", "group"] as const).map((name) => (
						<button
							key={name}
							id={`${id}-${name}-tab`}
							type="button"
							role="tab"
							aria-selected={tab === name}
							aria-controls={`${id}-panel`}
							onClick={() => showTab(name)}
							className="-mb-px min-h-11 rounded-t-md border border-transparent px-5 text-ink-muted aria-selected:border-earth aria-selected:border-b-background aria-selected:bg-background aria-selected:font-semibold aria-selected:text-ink"
						>
							{t(`tab.${name}`)}
						</button>
					))}
				</div>

				<div
					id={`${id}-panel`}
					role="tabpanel"
					aria-labelledby={`${id}-${tab}-tab`}
					className="flex flex-col gap-4"
				>
					{confirmDiscard ? (
						<div role="alert" className="flex flex-col gap-3 rounded-lg border border-earth p-4">
							<p>{t("unsaved")}</p>
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									variant="destructive"
									onClick={() => {
										setDraft(null);
										setConfirmDiscard(false);
										setTab("group");
									}}
								>
									{t("discardAndLeave")}
								</Button>
								<Button type="button" variant="outline" onClick={() => setConfirmDiscard(false)}>
									{t("keepEditing")}
								</Button>
							</div>
						</div>
					) : null}

					{zoneNotice === null ? null : (
						<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
							<p className="max-w-[65ch] font-semibold">{zoneNotice}</p>
							{zoneDiffers ? (
								<Button
									type="button"
									variant="outline"
									onClick={() => {
										setInspected(null);
										setInReferenceZone(!inReferenceZone);
									}}
								>
									{inReferenceZone
										? t("showViewerZone")
										: t("showReferenceZone", {
												zone: event.referenceZone.replaceAll("_", " "),
											})}
								</Button>
							) : null}
						</div>
					)}

					{tab === "group" ? (
						<>
							<div
								className="flex items-center gap-2 text-sm tabular-nums"
								aria-label={t("legendLabel", { total })}
							>
								<span>{t("count", { available: 0, total })}</span>
								<span aria-hidden className="flex border border-earth">
									{HEAT.map((step) => (
										<span key={step} className={cn("h-5 w-6", step)} />
									))}
								</span>
								<span>{t("count", { available: total, total })}</span>
							</div>
							<p className="max-w-[65ch] text-ink-muted">{t("groupHint")}</p>
						</>
					) : null}

					{tab === "me" && joined === null ? (
						<p className="max-w-[65ch]">{t("joinFirst")}</p>
					) : null}

					{tab === "me" && joined !== null ? (
						<>
							<p className="max-w-[65ch] text-ink-muted">{t("meHint")}</p>
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									variant="outline"
									onClick={() => setDraft(new Set(event.slots))}
								>
									{t("selectAll")}
								</Button>
								<Button type="button" variant="outline" onClick={() => setDraft(new Set())}>
									{t("selectNone")}
								</Button>
								<Button
									type="button"
									variant="outline"
									onClick={() =>
										setDraft(new Set(event.slots.filter((key) => !selection.has(key))))
									}
								>
									{t("invert")}
								</Button>
							</div>
						</>
					) : null}

					{tab === "group" || joined !== null ? (
						<div ref={wrapper} className="relative">
							<div className="max-h-[75dvh] max-w-full overflow-auto overscroll-x-contain pt-2">
								{renderGrid()}
							</div>
							{tab === "group" && inspected !== null && detailTime !== undefined ? (
								<SlotDetail
									heading={`${view?.columns[inspected.cell.column]?.long ?? ""} · ${detailTime.start}–${detailTime.end}`}
									available={event.participants
										.filter((participant) => detailNames.has(participant.name))
										.map((participant) => participant.name)}
									unavailable={event.participants
										.filter((participant) => !detailNames.has(participant.name))
										.map((participant) => participant.name)}
									x={inspected.x}
									y={inspected.y}
									onClose={() => setInspected(null)}
								/>
							) : null}
						</div>
					) : null}
				</div>
			</div>

			{tab === "me" && joined !== null ? (
				<div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:-mx-6 sm:px-6">
					<div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
						<p
							aria-live="polite"
							className={cn(
								"mr-auto text-sm",
								saveMessage !== null &&
									saveMessage !== "saved" &&
									"font-semibold text-action-active",
							)}
						>
							{saveMessage === null ? "" : t(saveMessage)}
						</p>
						<Button
							type="button"
							variant="outline"
							disabled={!dirty || saving}
							onClick={() => setDraft(null)}
							className="flex-1 sm:flex-none"
						>
							{t("discard")}
						</Button>
						<Button
							type="button"
							disabled={!dirty || saving}
							onClick={save}
							className="flex-1 sm:flex-none"
						>
							{saving ? t("saving") : t("save")}
						</Button>
					</div>
				</div>
			) : null}

			{view === null ? null : (
				<BestWindows
					view={view}
					windows={windows}
					names={event.participants.map((participant) => participant.name)}
					slotLength={event.slotLength}
					formatLocale={formatLocale}
					selected={highlight}
					onSelect={(window) => {
						setChosenWindow(window);
						showTab("group");
					}}
				/>
			)}

			<section aria-labelledby={`${id}-people`} className="flex flex-col gap-3">
				<h2 id={`${id}-people`} className="text-xl">
					{t("participants", { count: total })}
				</h2>
				{total === 0 ? (
					<p className="text-ink-muted">{t("noParticipants")}</p>
				) : (
					<>
						<p className="max-w-[65ch] text-sm text-ink-muted">{t("filterHint")}</p>
						<ul className="flex flex-wrap gap-2">
							{event.participants.map((participant) => (
								<li key={participant.name}>
									<button
										type="button"
										aria-pressed={person === participant.name}
										onClick={() => {
											setPerson(person === participant.name ? null : participant.name);
											showTab("group");
										}}
										className="min-h-11 rounded-md border border-earth px-3 aria-pressed:bg-ink aria-pressed:font-semibold aria-pressed:text-surface"
									>
										{participant.name}
									</button>
								</li>
							))}
						</ul>
					</>
				)}
			</section>
		</div>
	);
}
