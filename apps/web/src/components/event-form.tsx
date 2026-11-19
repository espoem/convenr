"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type SubmitEvent } from "react";

import { DatePicker } from "@/components/date-picker";
import { controlClass, Field, FieldMessage, LockedNote } from "@/components/field";
import { Button } from "@/components/ui/button";
import type { DayName } from "@/domain/calendar-labels";
import {
	MAX_DATES,
	SLOT_LENGTHS,
	toSlotLength,
	toWeekday,
	type Weekday,
	WEEKDAYS,
	weekdaysFrom,
} from "@/domain/schedule";
import { useTemporalReady, useViewerZone } from "@/lib/browser-time";
import type { EventVersion } from "@/lib/event-version";
import { formText } from "@/lib/form-text";
import type { EventProblem, NewEvent } from "@/server/events";
import type { Confirmation } from "@/server/manage";

export type EventFormOptions = {
	formatLocale: string;
	/** Labels of whole hours from 0:00 to midnight, indexed by hour. */
	hours: string[];
	zones: string[];
	weekdays: DayName[];
	firstDayOfWeek: Weekday;
};

/** What the server said about a submitted event. */
export type FormOutcome =
	| { status: "done" }
	| { status: "failed" }
	| { status: "invalid"; problems: EventProblem[] }
	/** How many participants lose part of their availability, at which version of the event. */
	| { status: "confirm"; losing: number; version: EventVersion };

/** A change the server asked to confirm: the loss it would cause, at the version it was counted. */
type PendingLoss = { input: NewEvent; losing: number; version: EventVersion };

type EventFormProps = {
	options: EventFormOptions;
	/** The stored event on the manage page; the create form starts empty. */
	initial?: NewEvent | undefined;
	/** Slot length, day mode and reference zone cannot change because people joined. */
	locked?: boolean;
	submitLabel: string;
	pendingLabel: string;
	onSubmit: (input: NewEvent, confirmation: Confirmation) => Promise<FormOutcome>;
};

type DayMode = NewEvent["days"]["mode"];

const DAY_MODES: DayMode[] = ["dates", "range", "weekdays"];

const TIME_PROBLEMS = new Set<string>([
	"out_of_day",
	"end_not_after_start",
	"not_on_slot_boundary",
]);

const DAY_PROBLEMS = new Set<string>([
	"no_days",
	"range_reversed",
	"too_many_dates",
	"duplicate_day",
	"date_in_past",
	"field_locked",
]);

/** A broken rule by its code, a value of the wrong form by its field path such as `days.dates.2`. */
function problemName(problem: EventProblem): string {
	return problem.kind === "rule" ? problem.code : problem.path.join(".");
}

/** The message key for a problem the server reported: a problem code or a field path. */
function problemKey(problem: string) {
	if (TIME_PROBLEMS.has(problem) || DAY_PROBLEMS.has(problem)) {
		return problem;
	}

	return problem.split(".")[0] === "days" ? "no_days" : problem.split(".")[0];
}

/** Problems of the time range belong to the times; everything else about days to the days. */
function problemField(problem: string) {
	if (TIME_PROBLEMS.has(problem) || problem === "dailyStart" || problem === "dailyEnd") {
		return "times";
	}

	return DAY_PROBLEMS.has(problem) || problem.split(".")[0] === "days" ? "days" : problem;
}

/** The event fields. The server does the checks and reports problems by code. */
export function EventForm({
	options,
	initial,
	locked = false,
	submitLabel,
	pendingLabel,
	onSubmit,
}: EventFormProps) {
	const t = useTranslations("Create");
	const id = useId();
	const temporalReady = useTemporalReady();
	const viewerZone = useViewerZone();
	const initialDays = initial?.days;
	const startDates = initialDays?.mode === "dates" ? initialDays.dates : [];
	const startWeekdays = initialDays?.mode === "weekdays" ? initialDays.weekdays : [];
	const startWeek = initial?.firstDayOfWeek ?? options.firstDayOfWeek;
	const [mode, setMode] = useState<DayMode>(initialDays?.mode ?? "dates");
	const [dates, setDates] = useState<string[]>(startDates);
	const [weekdays, setWeekdays] = useState<Weekday[]>(startWeekdays);
	const [zone, setZone] = useState<string | null>(initial?.referenceZone ?? null);
	const [firstDayOfWeek, setFirstDayOfWeek] = useState(startWeek);
	const [problems, setProblems] = useState<string[]>([]);
	const [failed, setFailed] = useState(false);
	const [pendingLoss, setPendingLoss] = useState<PendingLoss | null>(null);
	const [pending, startTransition] = useTransition();

	const shownZone = zone ?? viewerZone ?? "Europe/Prague";
	const zones = options.zones.includes(shownZone) ? options.zones : [shownZone, ...options.zones];
	const errors = new Map(problems.map((problem) => [problemField(problem), problemKey(problem)]));
	const range = initialDays?.mode === "range" ? initialDays : undefined;

	const error = (field: string) => {
		const key = errors.get(field);

		return key === undefined ? undefined : t(`problem.${key}`);
	};

	function toggleDate(date: string) {
		setDates((current) =>
			current.includes(date) ? current.filter((other) => other !== date) : [...current, date],
		);
	}

	function toggleWeekday(weekday: Weekday) {
		setWeekdays((current) =>
			current.includes(weekday)
				? current.filter((other) => other !== weekday)
				: [...current, weekday],
		);
	}

	function send(input: NewEvent, confirmation: Confirmation) {
		startTransition(async () => {
			const outcome = await onSubmit(input, confirmation);

			setFailed(outcome.status === "failed");
			setProblems(outcome.status === "invalid" ? outcome.problems.map(problemName) : []);
			setPendingLoss(
				outcome.status === "confirm"
					? { input, losing: outcome.losing, version: outcome.version }
					: null,
			);
		});
	}

	function submit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();

		const form = new FormData(event.currentTarget);
		const text = (name: string) => formText(form, name);

		function chosenDays(): NewEvent["days"] {
			switch (mode) {
				case "range":
					return { mode, first: text("first"), last: text("last") };
				case "dates":
					return { mode, dates: dates.toSorted() };
				case "weekdays":
					return { mode, weekdays: weekdays.toSorted((a, b) => a - b) };
			}
		}

		// A disabled control sends nothing, so a locked slot length comes from the stored event.
		const slotLength = locked ? initial?.slotLength : toSlotLength(Number(text("slotLength")));

		send(
			{
				name: text("name"),
				description: text("description"),
				days: chosenDays(),
				dailyStart: Number(text("dailyStart")),
				dailyEnd: Number(text("dailyEnd")),
				slotLength: slotLength ?? 30,
				referenceZone: shownZone,
				firstDayOfWeek,
			},
			{ kind: "none" },
		);
	}

	function submitMessage() {
		if (failed) {
			return t("failed");
		}

		return problems.length > 0 ? t("fixProblems") : "";
	}

	const hourOptions = (from: number, to: number) =>
		options.hours.slice(from, to + 1).map((label, index) => (
			<option key={label} value={(from + index) * 60}>
				{label}
			</option>
		));

	return (
		<form onSubmit={submit} noValidate className="flex max-w-2xl flex-col gap-8">
			<Field id={`${id}-name`} label={t("name")} error={error("name")}>
				<input
					id={`${id}-name`}
					name="name"
					required
					maxLength={200}
					autoComplete="off"
					defaultValue={initial?.name}
					aria-invalid={errors.has("name") || undefined}
					aria-describedby={`${id}-name-message`}
					className={controlClass}
				/>
			</Field>

			<Field
				id={`${id}-description`}
				label={t("description")}
				hint={t("descriptionHint")}
				error={error("description")}
			>
				<textarea
					id={`${id}-description`}
					name="description"
					rows={3}
					defaultValue={initial?.description}
					aria-invalid={errors.has("description") || undefined}
					aria-describedby={`${id}-description-message`}
					className={`${controlClass} py-2`}
				/>
			</Field>

			<fieldset className="flex flex-col gap-4" aria-describedby={`${id}-days-message`}>
				<legend className="mb-2 font-heading text-xl font-semibold">{t("days")}</legend>
				<div
					role="radiogroup"
					aria-label={t("dayMode")}
					aria-describedby={locked ? `${id}-mode-locked` : undefined}
					className="flex flex-wrap gap-2"
				>
					{DAY_MODES.map((option) => (
						<label
							key={option}
							className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-earth px-3 has-checked:bg-ink has-checked:text-surface has-disabled:cursor-not-allowed has-disabled:not-has-checked:border-line has-disabled:not-has-checked:bg-locked"
						>
							<input
								type="radio"
								name="dayMode"
								value={option}
								checked={mode === option}
								disabled={locked}
								onChange={() => setMode(option)}
								className="accent-ink"
							/>
							{t(`mode.${option}`)}
						</label>
					))}
				</div>
				{locked ? <LockedNote id={`${id}-mode-locked`} text={t("lockedReason")} /> : null}

				{mode === "dates" ? (
					<>
						{temporalReady ? (
							<DatePicker
								selected={dates}
								onToggle={toggleDate}
								firstDayOfWeek={firstDayOfWeek}
								weekdays={options.weekdays}
								locale={options.formatLocale}
								describedBy={`${id}-days-message`}
							/>
						) : (
							<div className="h-80" />
						)}
						<p aria-live="polite" className="text-sm text-ink-muted tabular-nums">
							{t("datesChosen", { count: dates.length, max: MAX_DATES })}
						</p>
					</>
				) : null}

				{mode === "range" ? (
					<div className="flex flex-wrap gap-4">
						<Field id={`${id}-first`} label={t("first")} className="flex-[1_1_12rem]">
							<input
								id={`${id}-first`}
								name="first"
								type="date"
								defaultValue={range?.first}
								className={controlClass}
							/>
						</Field>
						<Field id={`${id}-last`} label={t("last")} className="flex-[1_1_12rem]">
							<input
								id={`${id}-last`}
								name="last"
								type="date"
								defaultValue={range?.last}
								className={controlClass}
							/>
						</Field>
					</div>
				) : null}

				{mode === "weekdays" ? (
					<div className="flex flex-col gap-2">
						<div className="flex flex-wrap gap-2">
							{weekdaysFrom(firstDayOfWeek).map((weekday) => {
								return (
									<label
										key={weekday}
										className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md border border-earth px-3 has-checked:bg-ink has-checked:text-surface"
									>
										<input
											type="checkbox"
											className="sr-only"
											checked={weekdays.includes(weekday)}
											onChange={() => toggleWeekday(weekday)}
										/>
										<abbr title={options.weekdays[weekday - 1]?.long} className="no-underline">
											{options.weekdays[weekday - 1]?.short}
										</abbr>
									</label>
								);
							})}
						</div>
						<p className="max-w-(--cv-measure) text-sm text-ink-muted">{t("weekdaysHint")}</p>
					</div>
				) : null}

				<FieldMessage id={`${id}-days-message`} error={error("days")} />
			</fieldset>

			<fieldset className="flex flex-col gap-4" aria-describedby={`${id}-times-message`}>
				<legend className="mb-2 font-heading text-xl font-semibold">{t("times")}</legend>
				<div className="flex flex-wrap gap-4">
					<Field id={`${id}-start`} label={t("dailyStart")} className="flex-[1_1_8rem]">
						<select
							id={`${id}-start`}
							name="dailyStart"
							defaultValue={initial?.dailyStart ?? 9 * 60}
							className={controlClass}
						>
							{hourOptions(0, 23)}
						</select>
					</Field>
					<Field id={`${id}-end`} label={t("dailyEnd")} className="flex-[1_1_8rem]">
						<select
							id={`${id}-end`}
							name="dailyEnd"
							defaultValue={initial?.dailyEnd ?? 17 * 60}
							className={controlClass}
						>
							{hourOptions(1, 24)}
						</select>
					</Field>
					<Field
						id={`${id}-slot`}
						label={t("slotLength")}
						locked={locked ? t("lockedReason") : undefined}
						className="flex-[1_1_8rem]"
					>
						<select
							id={`${id}-slot`}
							name="slotLength"
							defaultValue={initial?.slotLength ?? 30}
							disabled={locked}
							aria-describedby={locked ? `${id}-slot-locked` : undefined}
							className={controlClass}
						>
							{SLOT_LENGTHS.map((length) => (
								<option key={length} value={length}>
									{t("minutes", { count: length })}
								</option>
							))}
						</select>
					</Field>
				</div>
				<FieldMessage id={`${id}-times-message`} error={error("times")} />
				<div className="flex flex-wrap gap-4">
					<Field
						id={`${id}-zone`}
						label={t("zone")}
						hint={t("zoneHint")}
						error={error("referenceZone")}
						locked={locked ? t("lockedReason") : undefined}
						className="flex-[2_1_16rem]"
					>
						<select
							id={`${id}-zone`}
							value={shownZone}
							disabled={locked}
							onChange={(event) => setZone(event.target.value)}
							aria-describedby={
								locked ? `${id}-zone-locked ${id}-zone-message` : `${id}-zone-message`
							}
							className={controlClass}
						>
							{zones.map((name) => (
								<option key={name} value={name}>
									{name.replaceAll("_", " ")}
								</option>
							))}
						</select>
					</Field>
					<Field id={`${id}-week`} label={t("firstDayOfWeek")} className="flex-[1_1_10rem]">
						<select
							id={`${id}-week`}
							value={firstDayOfWeek}
							onChange={(event) =>
								setFirstDayOfWeek(toWeekday(Number(event.target.value)) ?? firstDayOfWeek)
							}
							className={controlClass}
						>
							{WEEKDAYS.map((weekday) => (
								<option key={weekday} value={weekday}>
									{options.weekdays[weekday - 1]?.long}
								</option>
							))}
						</select>
					</Field>
				</div>
			</fieldset>

			{pendingLoss === null ? (
				<div className="flex flex-col items-start gap-2">
					<Button type="submit" disabled={pending}>
						{pending ? pendingLabel : submitLabel}
					</Button>
					<p aria-live="polite" className="text-sm font-semibold text-action-active">
						{submitMessage()}
					</p>
				</div>
			) : (
				<div role="alert" className="flex max-w-(--cv-measure) flex-col gap-3">
					<p>{t("confirmLoss", { count: pendingLoss.losing })}</p>
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="destructive"
							disabled={pending}
							onClick={() =>
								send(pendingLoss.input, { kind: "version", version: pendingLoss.version })
							}
						>
							{t("confirmLossYes")}
						</Button>
						<Button type="button" variant="outline" onClick={() => setPendingLoss(null)}>
							{t("confirmLossNo")}
						</Button>
					</div>
				</div>
			)}
		</form>
	);
}
