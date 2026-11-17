"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type SubmitEvent } from "react";

import { DatePicker } from "@/components/date-picker";
import { controlClass, Field, FieldMessage } from "@/components/field";
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
import { useRouter } from "@/i18n/navigation";
import { useTemporalReady, useViewerZone } from "@/lib/browser-time";
import { formText } from "@/lib/form-text";
import { updateLocalEvent } from "@/lib/local-events";
import { createEventAction } from "@/server/event-actions";
import type { NewEvent } from "@/server/events";

export type CreateFormOptions = {
	formatLocale: string;
	/** Labels of whole hours from 0:00 to midnight, indexed by hour. */
	hours: string[];
	zones: string[];
	weekdays: DayName[];
	firstDayOfWeek: Weekday;
};

type DayMode = NewEvent["days"]["mode"];

const DAY_MODES: DayMode[] = ["dates", "range", "weekdays"];

/** The message key for a problem the server reported: a field path or a rule code. */
function problemKey(problem: string) {
	if (problem.startsWith("E2.") || problem.startsWith("E3.")) {
		return problem.replace(".", "_");
	}

	return problem.split(".")[0] === "days" ? "E2_no-days" : problem.split(".")[0];
}

/** Rule codes of the time range belong to the times; everything else about days to the days. */
function problemField(problem: string) {
	if (problem.startsWith("E3.") || problem === "dailyStart" || problem === "dailyEnd") {
		return "times";
	}

	return problem.startsWith("E2.") || problem.startsWith("days") ? "days" : problem;
}

/** The create form of spec rule E1 with the checks of E2 and E3 done by the server. */
export function CreateEventForm({ options }: { options: CreateFormOptions }) {
	const t = useTranslations("Create");
	const id = useId();
	const router = useRouter();
	const temporalReady = useTemporalReady();
	const viewerZone = useViewerZone();
	const [mode, setMode] = useState<DayMode>("dates");
	const [dates, setDates] = useState<string[]>([]);
	const [weekdays, setWeekdays] = useState<Weekday[]>([]);
	const [zone, setZone] = useState<string | null>(null);
	const [firstDayOfWeek, setFirstDayOfWeek] = useState(options.firstDayOfWeek);
	const [problems, setProblems] = useState<string[]>([]);
	const [failed, setFailed] = useState(false);
	const [pending, startTransition] = useTransition();

	const shownZone = zone ?? viewerZone ?? "Europe/Prague";
	const zones = options.zones.includes(shownZone) ? options.zones : [shownZone, ...options.zones];
	const errors = new Map(problems.map((problem) => [problemField(problem), problemKey(problem)]));

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

		const input: NewEvent = {
			name: text("name"),
			description: text("description"),
			days: chosenDays(),
			dailyStart: Number(text("dailyStart")),
			dailyEnd: Number(text("dailyEnd")),
			slotLength: toSlotLength(Number(text("slotLength"))) ?? 30,
			referenceZone: shownZone,
			firstDayOfWeek,
		};

		startTransition(async () => {
			try {
				const created = await createEventAction(input);

				if (!created.ok) {
					setProblems(created.problems);
					setFailed(false);

					return;
				}

				updateLocalEvent(created.id, (current) => ({
					...current,
					id: created.id,
					name: input.name.trim(),
					segment: created.segment,
					adminSecret: created.adminSecret,
				}));
				router.push(`/e/${created.segment}/created`);
			} catch {
				setFailed(true);
			}
		});
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
					aria-invalid={errors.has("description") || undefined}
					aria-describedby={`${id}-description-message`}
					className={`${controlClass} py-2`}
				/>
			</Field>

			<fieldset className="flex flex-col gap-4" aria-describedby={`${id}-days-message`}>
				<legend className="mb-2 font-heading text-xl font-semibold">{t("days")}</legend>
				<div role="radiogroup" aria-label={t("dayMode")} className="flex flex-wrap gap-2">
					{DAY_MODES.map((option) => (
						<label
							key={option}
							className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-earth px-3 has-checked:bg-ink has-checked:font-semibold has-checked:text-surface"
						>
							<input
								type="radio"
								name="dayMode"
								value={option}
								checked={mode === option}
								onChange={() => setMode(option)}
								className="accent-ink"
							/>
							{t(`mode.${option}`)}
						</label>
					))}
				</div>

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
							<input id={`${id}-first`} name="first" type="date" className={controlClass} />
						</Field>
						<Field id={`${id}-last`} label={t("last")} className="flex-[1_1_12rem]">
							<input id={`${id}-last`} name="last" type="date" className={controlClass} />
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
										className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md border border-earth px-3 has-checked:bg-ink has-checked:font-semibold has-checked:text-surface"
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
						<p className="text-sm text-ink-muted">{t("weekdaysHint")}</p>
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
							defaultValue={9 * 60}
							className={controlClass}
						>
							{hourOptions(0, 23)}
						</select>
					</Field>
					<Field id={`${id}-end`} label={t("dailyEnd")} className="flex-[1_1_8rem]">
						<select
							id={`${id}-end`}
							name="dailyEnd"
							defaultValue={17 * 60}
							className={controlClass}
						>
							{hourOptions(1, 24)}
						</select>
					</Field>
					<Field id={`${id}-slot`} label={t("slotLength")} className="flex-[1_1_8rem]">
						<select id={`${id}-slot`} name="slotLength" defaultValue={30} className={controlClass}>
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
						className="flex-[2_1_16rem]"
					>
						<select
							id={`${id}-zone`}
							value={shownZone}
							onChange={(event) => setZone(event.target.value)}
							aria-describedby={`${id}-zone-message`}
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

			<div className="flex flex-col items-start gap-2">
				<Button type="submit" disabled={pending}>
					{pending ? t("creating") : t("submit")}
				</Button>
				<p aria-live="polite" className="text-sm font-semibold text-action-active">
					{submitMessage()}
				</p>
			</div>
		</form>
	);
}
