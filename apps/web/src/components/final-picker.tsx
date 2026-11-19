"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";

import { AvailabilityGrid, type CellRef } from "@/components/event/availability-grid";
import { BestWindows } from "@/components/event/best-windows";
import { useBoardView } from "@/components/event/board-view";
import { useCount } from "@/components/event/count";
import type { BoardEvent } from "@/components/event/event-board";
import { FinalLegend, useFinalWhen } from "@/components/event/final-time";
import { controlClass, Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import type { GridView } from "@/domain/grid-labels";
import { heatStep } from "@/domain/heat";
import { cellLevel, type Tally } from "@/domain/levels";
import type { Weekday } from "@/domain/schedule";
import { useRouter } from "@/i18n/navigation";
import { useViewerZone } from "@/lib/browser-time";
import { clearFinalAction, type FinalChange, pickFinalAction } from "@/server/event-actions";

/** Rows `first` to `last` of one column. */
type Run = { column: number; first: number; last: number };

type FinalPickerProps = {
	event: BoardEvent;
	/** A weekday event's grid, laid out by the server. */
	weekdayView: GridView | null;
	formatLocale: string;
	secret: string;
	/** The admin secret stopped fitting. */
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

/** Picking and clearing the final time on the manage page: a best window or a run in the grid. */
export function FinalPicker({
	event,
	weekdayView,
	formatLocale,
	secret,
	onDenied,
}: FinalPickerProps) {
	const t = useTranslations("Manage");
	const tEvent = useTranslations("Event");
	const count = useCount();
	const id = useId();
	const router = useRouter();
	const viewerZone = useViewerZone();
	const when = useFinalWhen();
	const [proposal, setProposal] = useState<Run | null>(null);
	// The first cell of a run picked in the grid, until a second cell in its column ends it.
	const [anchor, setAnchor] = useState<CellRef | null>(null);
	const [chosenDate, setChosenDate] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();

	const { view, windows } = useBoardView(event, weekdayView, viewerZone, formatLocale);

	if (view === null || viewerZone === null) {
		return <div aria-hidden style={{ height: `${(event.rowCount + 2) * 1.75}rem` }} />;
	}

	const columns = view.layout.blocks.flat();
	const total = event.participants.length;
	const column = proposal === null ? undefined : columns[proposal.column];
	const weekday = column?.kind === "weekday" ? column.weekday : null;
	const dates = weekday === null ? [] : occurrences(weekday, event.referenceZone);
	const date = chosenDate !== null && dates.includes(chosenDate) ? chosenDate : (dates[0] ?? null);

	const final =
		event.final.kind === "chosen"
			? { keys: new Set(event.final.slots), label: tEvent("finalTime") }
			: undefined;

	function tallyIn(keys: readonly string[]): Tally {
		const at = (level: "available" | "if_need_be") =>
			event.participants.filter((person) => cellLevel(person.levels, keys) === level).length;

		return { available: at("available"), ifNeedBe: at("if_need_be") };
	}

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

	function answer(change: FinalChange) {
		switch (change.status) {
			case "saved":
				setProposal(null);
				setAnchor(null);
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

	function pick(run: Run) {
		const keys = columns[run.column]?.cells.slice(run.first, run.last + 1).flat() ?? [];

		send(() => pickFinalAction(event.id, secret, keys, weekday === null ? null : date));
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
						onClick={() => send(() => clearFinalAction(event.id, secret))}
					>
						{t("finalClear")}
					</Button>
				</div>
			) : (
				<p className="max-w-(--cv-measure) text-ink-muted">{t("finalNone")}</p>
			)}

			<p className="max-w-(--cv-measure) text-sm text-ink-muted">{t("finalHint")}</p>
			{final === undefined ? null : <FinalLegend />}

			<div className="max-h-[75dvh] max-w-full overflow-auto overscroll-x-contain pt-2">
				<AvailabilityGrid
					view={view}
					slotLength={event.slotLength}
					label={t("finalGrid")}
					fill={(keys) => heatStep(tallyIn(keys), total)}
					describe={(keys) => count(tallyIn(keys), total)}
					onPick={pickCell}
					highlight={proposal}
					final={final}
				/>
			</div>

			{proposal === null ? null : (
				<div className="flex max-w-(--cv-measure) flex-col gap-3">
					<p aria-live="polite" className="font-semibold">
						{t("finalProposal", { when: time(proposal) })}
					</p>
					{weekday === null ? null : (
						<Field id={`${id}-date`} label={t("finalDate")} hint={t("finalDateHint")}>
							<select
								id={`${id}-date`}
								aria-describedby={`${id}-date-message`}
								className={controlClass}
								value={date ?? ""}
								onChange={(change) => setChosenDate(change.target.value)}
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
					<Button type="button" className="w-fit" disabled={pending} onClick={() => pick(proposal)}>
						{t("finalPick")}
					</Button>
				</div>
			)}

			<p aria-live="polite" className="text-sm font-semibold text-action-active">
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
							window.column === proposal?.column &&
							window.first === proposal.first &&
							window.last === proposal.last,
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
