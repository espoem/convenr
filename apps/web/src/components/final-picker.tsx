"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";

import { AvailabilityGrid, type CellRef } from "@/components/event/availability-grid";
import { BestWindows } from "@/components/event/best-windows";
import { type ServerGrid, useBoardView } from "@/components/event/board-view";
import { useCount } from "@/components/event/count";
import type { BoardEvent } from "@/components/event/event-board";
import { FinalLegend, useFinalWhen } from "@/components/event/final-time";
import { controlClass, Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { heatStep } from "@/domain/heat";
import { tallyIn as countTallyIn } from "@/domain/levels";
import type { Weekday } from "@/domain/schedule";
import { useRouter } from "@/i18n/navigation";
import { useTemporalReady, useViewerZone } from "@/lib/browser-time";
import type { ManageCredential } from "@/lib/manage-credential";
import { clearFinalAction, type FinalChange, pickFinalAction } from "@/server/event-actions";

/** Rows `first` to `last` of one column. */
type Run = { column: number; first: number; last: number };

type FinalPickerProps = {
	event: BoardEvent;
	serverGrid: ServerGrid;
	formatLocale: string;
	credential: ManageCredential;
	/** The credential stopped fitting. */
	onDenied: () => void;
};

// How many coming dates of the window's weekday the organizer chooses from.
const OCCURRENCES = 8;

/** The next dates on `weekday`, from today in the reference zone on. */
function occurrences(weekday: Weekday, zone: string): string[] {
	const today = Temporal.Now.plainDateISO(zone);
	const first = today.add({ days: (weekday - today.dayOfWeek + 7) % 7 });

	return Array.from({ length: OCCURRENCES }, (_unused, week) =>
		first.add({ weeks: week }).toString(),
	);
}

/**
 * Sending a pick or a clear of the final time: the message to show, and whether one is under
 * way. `onSaved` runs after a change the server accepted, before the page reloads.
 */
export function useFinalChange(onDenied: () => void, onSaved: () => void = () => {}) {
	const t = useTranslations("Manage");
	const router = useRouter();
	const [message, setMessage] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();

	function answer(change: FinalChange) {
		switch (change.status) {
			case "saved":
				onSaved();
				setMessage(null);
				router.refresh();

				return;
			case "denied":
				onDenied();

				return;
			case "invalid":
				setMessage(t(`finalProblem.${change.problem}`));
		}
	}

	function send(action: () => Promise<FinalChange>) {
		startTransition(async () => {
			try {
				answer(await action());
			} catch {
				setMessage(t("failed"));
			}
		});
	}

	return { message, setMessage, pending, send };
}

/** Picking and clearing the final time on the manage page: a best window or a run in the grid. */
export function FinalPicker({
	event,
	serverGrid,
	formatLocale,
	credential,
	onDenied,
}: FinalPickerProps) {
	const t = useTranslations("Manage");
	const tEvent = useTranslations("Event");
	const count = useCount();
	const id = useId();
	const temporalReady = useTemporalReady();
	const viewerZone = useViewerZone();
	const when = useFinalWhen();
	const [proposal, setProposal] = useState<Run | null>(null);
	// The first cell of a run picked in the grid, until a second cell in its column ends it.
	const [anchor, setAnchor] = useState<CellRef | null>(null);
	const [selectedDate, setSelectedDate] = useState<string | null>(null);

	const { message, setMessage, pending, send } = useFinalChange(onDenied, () => {
		setProposal(null);
		setAnchor(null);
	});

	const { view, windows } = useBoardView(event, serverGrid, viewerZone, formatLocale);

	// Picking needs Temporal and the viewer's zone, which the browser knows only once it runs.
	if (!temporalReady || viewerZone === null) {
		return <div aria-hidden style={{ height: `${(event.rowCount + 2) * 1.75}rem` }} />;
	}

	const columns = view.layout.blocks.flat();
	const total = event.participants.length;

	const validProposal =
		proposal !== null &&
		proposal.column >= 0 &&
		proposal.column < columns.length &&
		proposal.first >= 0 &&
		proposal.last < view.rows.length &&
		proposal.first <= proposal.last
			? proposal
			: null;

	const column = validProposal === null ? undefined : columns[validProposal.column];
	const weekday = column?.kind === "weekday" ? column.weekday : null;
	const dates = weekday === null ? [] : occurrences(weekday, event.referenceZone);

	const date =
		selectedDate !== null && dates.includes(selectedDate) ? selectedDate : (dates[0] ?? null);

	const final =
		event.final.kind === "chosen"
			? { keys: new Set(event.final.slots), label: tEvent("finalTime") }
			: undefined;

	const tallyIn = (keys: readonly string[]) =>
		countTallyIn(
			event.participants.map((person) => person.levels),
			keys,
		);

	function pickCell(cell: CellRef) {
		setMessage(null);

		if (anchor !== null && anchor.column === cell.column) {
			setProposal({
				column: cell.column,
				first: Math.min(anchor.row, cell.row),
				last: Math.max(anchor.row, cell.row),
			});
			setAnchor(null);

			return;
		}

		setAnchor(cell);
		setProposal({ column: cell.column, first: cell.row, last: cell.row });
	}

	function pick(run: Run) {
		const keys = columns[run.column]?.cells.slice(run.first, run.last + 1).flat() ?? [];

		send(() => pickFinalAction(event.id, credential, keys, weekday === null ? null : date));
	}

	const time = (run: Run) =>
		`${view.columns[run.column]?.long ?? ""}, ${view.rows[run.first]?.start ?? ""}–${view.rows[run.last]?.end ?? ""}`;

	return (
		<section aria-labelledby={`${id}-final`} className="flex flex-col gap-4">
			<h2 id={`${id}-final`} className="text-2xl">
				{tEvent("finalTime")}
			</h2>

			{event.final.kind === "chosen" ? (
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
					<p className="max-w-(--cv-measure) text-lg">
						{t("finalIs", { when: when(event.final, viewerZone, formatLocale) })}
					</p>
					<Button
						type="button"
						variant="outline"
						disabled={pending}
						onClick={() => send(() => clearFinalAction(event.id, credential))}
					>
						{t("finalClear")}
					</Button>
				</div>
			) : (
				<p className="max-w-(--cv-measure) text-ink-muted">{t("finalNone")}</p>
			)}

			<p className="max-w-(--cv-measure) text-sm text-ink-muted">{t("finalHint")}</p>
			{final === undefined ? null : <FinalLegend />}

			<div className="max-h-[75dvh] max-w-full overflow-auto overscroll-x-contain pt-2 pb-3">
				<AvailabilityGrid
					view={view}
					slotLength={event.slotLength}
					label={t("finalGrid")}
					fill={(keys) => heatStep(tallyIn(keys), total)}
					describe={(keys) => count(tallyIn(keys), total)}
					onPick={pickCell}
					highlight={validProposal}
					final={final}
				/>
			</div>

			{validProposal === null ? null : (
				<div className="flex max-w-(--cv-measure) flex-col gap-3">
					<p aria-live="polite" className="font-semibold">
						{t("finalProposal", { when: time(validProposal) })}
					</p>
					{weekday === null ? null : (
						<Field id={`${id}-date`} label={t("finalDate")} hint={t("finalDateHint")}>
							<select
								id={`${id}-date`}
								aria-describedby={`${id}-date-message`}
								className={controlClass}
								value={date ?? ""}
								onChange={(change) => setSelectedDate(change.target.value)}
							>
								{dates.map((option) => (
									<option key={option} value={option}>
										{Temporal.PlainDate.from(option).toLocaleString(formatLocale, {
											weekday: "long",
											day: "numeric",
											month: "long",
											year: "numeric",
										})}
									</option>
								))}
							</select>
						</Field>
					)}
					<Button
						type="button"
						className="w-full sm:w-fit"
						disabled={pending}
						onClick={() => pick(validProposal)}
					>
						{t("finalPick")}
					</Button>
				</div>
			)}

			<p aria-live="polite" className="text-sm font-semibold text-action-active empty:sr-only">
				{message ?? ""}
			</p>

			<BestWindows
				view={view}
				windows={windows}
				names={event.participants.map((person) => person.name)}
				slotLength={event.slotLength}
				formatLocale={formatLocale}
				selected={
					windows.find(
						(window) =>
							window.column === validProposal?.column &&
							window.first === validProposal.first &&
							window.last === validProposal.last,
					) ?? null
				}
				onSelect={(window) => {
					setMessage(null);
					setAnchor(null);
					setProposal(
						window === null
							? null
							: { column: window.column, first: window.first, last: window.last },
					);
				}}
			/>
		</section>
	);
}
