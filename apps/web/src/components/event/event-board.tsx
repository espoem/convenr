"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

import { PageRegion } from "@/components/page-region";
import { SteadyLabel } from "@/components/steady-label";
import { Button } from "@/components/ui/button";
import { bestWindows, mostPeople, sameWindow, type Window } from "@/domain/best-windows";
import { heatStep } from "@/domain/heat";
import {
	type Brush,
	cellLevel,
	type Level,
	type Levels,
	tallyIn as countTallyIn,
	withLevel,
} from "@/domain/levels";
import type { Weekday } from "@/domain/schedule";
import { useViewerZone } from "@/lib/browser-time";
import { cn } from "@/lib/utils";

import { AvailabilityGrid, type CellFill, type CellRef } from "./availability-grid";
import { BestWindows } from "./best-windows";
import { type ServerGrid, useBoardView } from "./board-view";
import { useCount } from "./count";
import { FinalLegend } from "./final-time";
import { JoinBand, type Joined } from "./join-band";
import { BrushPicker, PersonLegend } from "./level-marks";
import { HEAT } from "./poll-table";
import { SaveBar } from "./save-bar";
import { SlotDetail } from "./slot-detail";
import { useParticipation } from "./use-participation";
import { ZoneNotice } from "./zone-notice";

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
	participants: { name: string; levels: Levels }[];
	final: ShownFinal;
};

/** The final time as RFC 3339 instants, with the event's slots inside it. */
export type ShownFinal =
	| { kind: "open" }
	| { kind: "chosen"; start: string; end: string; sequence: number; slots: string[] };

type EventBoardProps = {
	event: BoardEvent;
	/** The participant the server recognized from the browser's key. */
	viewer: Joined | null;
	serverGrid: ServerGrid;
	formatLocale: string;
	initialTab?: "group" | "me" | undefined;
};

const DETAIL_WIDTH = 288;

/** A participant's own marks: the darkest step when available, hatched at if need be. */
function ownFill(level: Level | null): CellFill {
	if (level === null) {
		return 0;
	}

	return level === "available" ? 4 : "if_need_be";
}

function syncTabUrl(next: "group" | "me", isJoined: boolean) {
	const url = new URL(window.location.href);
	const effectiveDefault = isJoined ? "me" : "group";

	if (next === effectiveDefault) {
		url.searchParams.delete("tab");
	} else {
		url.searchParams.set("tab", next);
	}

	const nextHref = `${url.pathname}${url.search}${url.hash}`;

	if (nextHref === `${window.location.pathname}${window.location.search}${window.location.hash}`) {
		return;
	}

	window.history.replaceState(null, "", nextHref);
}

/** The event page below its header: join band, tabs, grid and participants. */
export function EventBoard({
	event,
	viewer,
	serverGrid,
	formatLocale,
	initialTab,
}: EventBoardProps) {
	const t = useTranslations("Event");
	const tJoin = useTranslations("Join");
	const count = useCount();
	const id = useId();
	const viewerZone = useViewerZone();
	const wrapper = useRef<HTMLDivElement>(null);
	// A participant the server recognized starts at their own grid.
	const defaultTab: "group" | "me" = viewer === null ? "group" : "me";
	const [tab, setTab] = useState<"group" | "me">(initialTab ?? defaultTab);
	const [brush, setBrush] = useState<Brush>("available");
	const [confirmDiscard, setConfirmDiscard] = useState(false);
	const [inspected, setInspected] = useState<{ cell: CellRef; x: number; y: number } | null>(null);
	const [person, setPerson] = useState<string | null>(null);
	// Not stored, so every visit starts in the viewer's zone.
	const [inReferenceZone, setInReferenceZone] = useState(false);
	const [chosenWindow, setChosenWindow] = useState<Window | null>(null);
	const [minSlots, setMinSlots] = useState(1);
	const [chosenPeople, setChosenPeople] = useState<number | null>(null);

	const participation = useParticipation(event, viewer, formatLocale, {
		onJoined: () => {
			setTab("me");
			syncTabUrl("me", true);
		},
		onLeft: () => {
			setTab("group");
			syncTabUrl("group", false);
		},
	});

	const { joined, selection, dirty, edit } = participation;
	const shownZone = inReferenceZone ? event.referenceZone : viewerZone;

	const { view, windows } = useBoardView(event, serverGrid, shownZone, formatLocale);

	const highest = mostPeople(windows);
	const minPeople = chosenPeople ?? Math.max(highest, 1);
	const shownWindows = bestWindows(windows, { minSlots, minPeople });

	// A window that disappeared from the shown list clears rather than staying highlighted.
	const highlight = shownWindows.find((window) => sameWindow(chosenWindow, window)) ?? null;

	const total = event.participants.length;

	const final =
		event.final.kind === "chosen"
			? { keys: new Set(event.final.slots), label: t("finalTime") }
			: undefined;

	/** The names at each level in a cell, in list order. */
	function namesIn(keys: readonly string[]) {
		const at = (level: Level | null) =>
			event.participants
				.filter((participant) => cellLevel(participant.levels, keys) === level)
				.map((participant) => participant.name);

		return { available: at("available"), ifNeedBe: at("if_need_be"), unavailable: at(null) };
	}

	const tallyIn = (keys: readonly string[]) =>
		countTallyIn(
			event.participants.map((participant) => participant.levels),
			keys,
		);

	const filtered = event.participants.find((participant) => participant.name === person);

	function showTab(next: "group" | "me") {
		if (next === "group" && dirty) {
			setConfirmDiscard(true);

			return;
		}

		setConfirmDiscard(false);
		setInspected(null);
		edit(null);
		setTab(next);
		syncTabUrl(next, joined !== null);
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

		setInspected({ cell, x, y: Math.max(0, box.top - area.top) });
	}

	const detailKeys =
		inspected === null
			? []
			: (view.layout.blocks.flat()[inspected.cell.column]?.cells[inspected.cell.row] ?? []);

	const detailNames = namesIn(detailKeys);
	const myLevel = (keys: readonly string[]) => cellLevel(selection, keys);
	const detailTime = inspected === null ? undefined : view.rows[inspected.cell.row];

	function renderGrid() {
		if (tab === "group") {
			return (
				<AvailabilityGrid
					view={view}
					slotLength={event.slotLength}
					label={t("groupGrid")}
					fill={(keys) =>
						filtered === undefined
							? heatStep(tallyIn(keys), total)
							: ownFill(cellLevel(filtered.levels, keys))
					}
					describe={(keys) => count(tallyIn(keys), total)}
					onInspect={inspect}
					inspected={inspected?.cell}
					highlight={highlight}
					final={final}
				/>
			);
		}

		return (
			<AvailabilityGrid
				view={view}
				slotLength={event.slotLength}
				label={t("myGrid")}
				final={final}
				fill={(keys) => ownFill(myLevel(keys))}
				describe={(keys) => {
					const level = myLevel(keys);

					if (level === null) {
						return t("youCannot");
					}

					return level === "available" ? t("youCan") : t("youIfNeedBe");
				}}
				edit={{
					levels: selection,
					brush,
					onChange: edit,
				}}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			{participation.dropped ? (
				<PageRegion width="measure">
					<output className="block font-semibold text-action-active">
						{tJoin("problem.not_joined")}
					</output>
				</PageRegion>
			) : null}
			<JoinBand {...participation.band} />

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
							<SteadyLabel text={t(`tab.${name}`)} />
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
										edit(null);
										setConfirmDiscard(false);
										setTab("group");
										syncTabUrl("group", joined !== null);
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

					<ZoneNotice
						referenceZone={event.referenceZone}
						viewerZone={viewerZone}
						dated={event.dated}
						inReferenceZone={inReferenceZone}
						onSwitch={() => {
							setInspected(null);
							setInReferenceZone(!inReferenceZone);
						}}
					/>

					{tab === "group" ? (
						<>
							<div className="grid items-start">
								<div
									aria-hidden={filtered !== undefined}
									className={cn(
										"col-start-1 row-start-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums",
										filtered !== undefined && "invisible",
									)}
									aria-label={t("legendLabel", { total })}
								>
									<span className="whitespace-nowrap">{t("count", { available: 0, total })}</span>
									<span aria-hidden className="flex border border-earth">
										{HEAT.map((step) => (
											<span key={step} className={cn("h-5 w-6", step)} />
										))}
									</span>
									<span className="whitespace-nowrap">
										{t("count", { available: total, total })}
									</span>
									<span aria-hidden className="text-ink-muted">
										{t("legendHalf")}
									</span>
								</div>
								<PersonLegend shown={filtered !== undefined} className="col-start-1 row-start-1" />
							</div>
							{final === undefined ? null : <FinalLegend />}
							<PageRegion width="measure">
								<p className="text-sm text-ink-muted">{t("groupHint")}</p>
							</PageRegion>
						</>
					) : null}

					{tab === "me" && joined === null ? (
						<PageRegion width="measure">
							<p>{t("joinFirst")}</p>
						</PageRegion>
					) : null}

					{tab === "me" && joined !== null ? (
						<>
							<PageRegion width="measure">
								<p className="text-sm text-ink-muted">{t("meHint")}</p>
							</PageRegion>
							<BrushPicker brush={brush} onChange={setBrush} />
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									variant="outline"
									onClick={() => edit(withLevel({}, event.slots, "available"))}
								>
									{t("selectAll")}
								</Button>
								<Button type="button" variant="outline" onClick={() => edit({})}>
									{t("selectNone")}
								</Button>
								<Button
									type="button"
									variant="outline"
									onClick={() =>
										edit(
											withLevel(
												{},
												event.slots.filter((key) => selection[key] === undefined),
												"available",
											),
										)
									}
								>
									{t("invert")}
								</Button>
							</div>
						</>
					) : null}

					{tab === "group" || joined !== null ? (
						<div ref={wrapper} className="relative">
							<div className="max-h-[75dvh] max-w-full overflow-auto overscroll-x-contain pt-2 pb-3">
								{renderGrid()}
							</div>
							{tab === "group" && inspected !== null && detailTime !== undefined ? (
								<SlotDetail
									day={view.columns[inspected.cell.column]?.long ?? ""}
									time={`${detailTime.start}–${detailTime.end}`}
									available={detailNames.available}
									ifNeedBe={detailNames.ifNeedBe}
									unavailable={detailNames.unavailable}
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
				<SaveBar
					message={participation.barMessage}
					dirty={dirty}
					saving={participation.saving}
					onDiscard={() => edit(null)}
					onSave={participation.save}
				/>
			) : null}

			{tab === "group" ? (
				<BestWindows
					view={view}
					windows={windows}
					names={event.participants.map((participant) => participant.name)}
					slotLength={event.slotLength}
					formatLocale={formatLocale}
					selected={highlight}
					filters={{
						minSlots,
						chosenPeople,
						onMinSlotsChange: (next) => {
							setMinSlots(next);
							const nextShown = bestWindows(windows, { minSlots: next, minPeople });

							if (!nextShown.some((window) => sameWindow(chosenWindow, window))) {
								setChosenWindow(null);
							}
						},
						onChosenPeopleChange: (next) => {
							setChosenPeople(next);
							const nextPeople = next ?? Math.max(highest, 1);
							const nextShown = bestWindows(windows, { minSlots, minPeople: nextPeople });

							if (!nextShown.some((window) => sameWindow(chosenWindow, window))) {
								setChosenWindow(null);
							}
						},
					}}
					onSelect={(window) => {
						setChosenWindow(window);
					}}
				/>
			) : null}

			<section aria-labelledby={`${id}-people`} className="flex flex-col gap-3">
				<h2 id={`${id}-people`} className="text-xl">
					{t("participants", { count: total })}
				</h2>
				{total === 0 ? (
					<p className="text-ink-muted">{t("noParticipants")}</p>
				) : (
					<>
						<PageRegion width="measure">
							<p className="text-sm text-ink-muted">{t("filterHint")}</p>
						</PageRegion>
						<ul className="flex flex-wrap gap-2">
							{event.participants.map((participant) => (
								<li key={participant.name} className="max-w-full">
									<button
										type="button"
										aria-pressed={person === participant.name}
										onClick={() => {
											if (tab === "me" && dirty) {
												setConfirmDiscard(true);

												return;
											}

											setPerson(person === participant.name ? null : participant.name);
											showTab("group");
										}}
										className="min-h-11 max-w-full rounded-md border border-earth px-3 text-left [overflow-wrap:anywhere] aria-pressed:bg-ink aria-pressed:font-semibold aria-pressed:text-surface"
									>
										<SteadyLabel text={participant.name} />
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
