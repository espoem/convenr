"use client";

import { XIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

import { useFinalWhen } from "@/components/event/final-time";
import { DateTimeInput, Field, FieldMessage } from "@/components/field";
import { Button } from "@/components/ui/button";
import { MAX_OPTIONS, MIN_OPTIONS } from "@/domain/poll";
import { useTemporalReady } from "@/lib/browser-time";

/** An option the event has, with its ends as RFC 3339 instants. */
export type StoredOption = { id: string; start: string; end: string };

/**
 * An option in the form: one the event keeps, or a new one as a date and wall-clock times in
 * the reference zone, which become instants when the form is sent.
 */
export type DraftOption =
	| { kind: "kept"; option: StoredOption }
	| { kind: "new"; key: string; date: string; start: string; end: string };

/** A new option's ends in `zone`. An end at 0:00 is the midnight that closes the date. */
function newOptionEnds(option: Extract<DraftOption, { kind: "new" }>, zone: string) {
	const date = Temporal.PlainDate.from(option.date);
	const endDay = option.end === "00:00" ? date.add({ days: 1 }) : date;

	const at = (day: Temporal.PlainDate, time: string) =>
		day.toZonedDateTime({ timeZone: zone, plainTime: Temporal.PlainTime.from(time) }).toInstant();

	return { start: at(date, option.start).toString(), end: at(endDay, option.end).toString() };
}

/** The option as the server takes it: a kept one by id, a new one by its times. */
export function optionInput(option: DraftOption, zone: string) {
	return option.kind === "kept" ? { id: option.option.id } : newOptionEnds(option, zone);
}

function draftKey(option: DraftOption): string {
	return option.kind === "kept" ? option.option.id : option.key;
}

type PollOptionsEditorProps = {
	options: DraftOption[];
	onChange: (options: DraftOption[]) => void;
	/** The reference zone, in which new options are entered and every option is shown. */
	zone: string;
	formatLocale: string;
	/** The message key of a problem the server reported for the whole list. */
	listProblem: string | undefined;
	/** The message keys of problems the server reported, by index in `options`. */
	optionProblems: ReadonlyMap<number, string>;
};

/**
 * The options of a poll: the list with a way to remove each, and fields to add a new one. An
 * option cannot be changed; a new time is a new option.
 */
export function PollOptionsEditor({
	options,
	onChange,
	zone,
	formatLocale,
	listProblem,
	optionProblems,
}: PollOptionsEditorProps) {
	const t = useTranslations("Create");
	const id = useId();
	const temporalReady = useTemporalReady();
	const when = useFinalWhen();
	const [date, setDate] = useState("");
	const [start, setStart] = useState("");
	const [end, setEnd] = useState("");
	const [addError, setAddError] = useState<string | null>(null);
	// Names each added option for React's list; a counter, as an option has no id until saved.
	const added = useRef(0);
	const full = options.length >= MAX_OPTIONS;
	const today = temporalReady ? Temporal.Now.plainDateISO(zone).toString() : undefined;

	function label(option: DraftOption): string {
		if (!temporalReady) {
			return "";
		}

		return when(
			option.kind === "kept" ? option.option : newOptionEnds(option, zone),
			zone,
			formatLocale,
		);
	}

	function add() {
		if (date === "" || start === "" || end === "") {
			setAddError(t("problem.option_incomplete"));

			return;
		}

		if (end !== "00:00" && end <= start) {
			setAddError(t("problem.option_end_not_after_start"));

			return;
		}

		setAddError(null);
		added.current += 1;
		onChange([...options, { kind: "new", key: `${id}-${added.current}`, date, start, end }]);
		setStart("");
		setEnd("");
	}

	return (
		<fieldset className="flex flex-col gap-4" aria-describedby={`${id}-list-message`}>
			<legend className="mb-2 font-heading text-xl font-semibold">{t("pollOptions")}</legend>
			<p className="text-sm text-ink-muted">
				{t("pollOptionsHint", { min: MIN_OPTIONS, max: MAX_OPTIONS })}
			</p>

			{options.length === 0 ? null : (
				<ul className="flex flex-col divide-y divide-line border-y border-line">
					{options.map((option, index) => {
						const shown = label(option);
						const problem = optionProblems.get(index);
						const error = problem === undefined ? undefined : t(`problem.${problem}`);

						return (
							<li key={draftKey(option)} className="flex flex-col gap-1 py-2">
								<span className="flex items-center justify-between gap-2">
									<span className="min-h-[1.5em] break-words">{shown}</span>
									<Button
										type="button"
										variant="outline"
										aria-label={t("pollRemoveLabel", { when: shown })}
										onClick={() => onChange(options.filter((other) => other !== option))}
									>
										<XIcon aria-hidden />
										{t("pollRemove")}
									</Button>
								</span>
								{error === undefined ? null : (
									<p className="text-sm font-semibold text-action-active">{error}</p>
								)}
							</li>
						);
					})}
				</ul>
			)}

			<p aria-live="polite" className="text-sm text-ink-muted tabular-nums">
				{t("pollCount", { count: options.length, max: MAX_OPTIONS })}
			</p>

			<div className="flex flex-wrap items-end gap-4">
				<Field
					id={`${id}-date`}
					label={t("pollDate")}
					className="flex-[1_1_100%] sm:flex-[2_1_11rem]"
				>
					<DateTimeInput
						id={`${id}-date`}
						type="date"
						min={today}
						value={date}
						disabled={full}
						onChange={(change) => setDate(change.target.value)}
					/>
				</Field>
				<Field id={`${id}-start`} label={t("pollStart")} className="flex-[1_1_7rem]">
					<DateTimeInput
						id={`${id}-start`}
						type="time"
						value={start}
						disabled={full}
						onChange={(change) => setStart(change.target.value)}
					/>
				</Field>
				<Field id={`${id}-end`} label={t("pollEnd")} className="flex-[1_1_7rem]">
					<DateTimeInput
						id={`${id}-end`}
						type="time"
						value={end}
						disabled={full}
						onChange={(change) => setEnd(change.target.value)}
					/>
				</Field>
				<Button
					type="button"
					variant="outline"
					disabled={full || !temporalReady}
					onClick={add}
					className="w-full sm:w-auto"
				>
					{t("pollAdd")}
				</Button>
			</div>
			<p aria-live="polite" className="text-sm font-semibold text-action-active empty:sr-only">
				{full ? t("pollFull", { max: MAX_OPTIONS }) : (addError ?? "")}
			</p>
			<FieldMessage
				id={`${id}-list-message`}
				error={listProblem === undefined ? undefined : t(`problem.${listProblem}`)}
			/>
		</fieldset>
	);
}
