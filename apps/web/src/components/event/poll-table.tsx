"use client";

import { FlagIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";

import { PageRegion } from "@/components/page-region";
import { heatStep } from "@/domain/heat";
import { type Level, type Levels, type Tally } from "@/domain/levels";
import { useTemporalReady } from "@/lib/browser-time";
import { cn } from "@/lib/utils";

import { useCount } from "./count";
import { useFinalWhen } from "./final-time";

/** A poll option as the page shows it: its answer key and its ends as RFC 3339 instants. */
export type ShownOption = {
	key: string;
	start: string;
	end: string;
	/** Formatted in the event's reference zone on the server, for the first response. */
	initialWhen?: string | undefined;
};

/** The people who answered an option, by participant index, with their level. */
export type ShownResult = { key: string; people: { person: number; level: Level }[] };

type PollTableEvent = {
	options: ShownOption[];
	participants: { name: string; levels: Levels }[];
	/** The key of the final option, if one is picked. */
	finalKey: string | null;
};

type PollTableProps = {
	event: PollTableEvent;
	/** The zone the times are shown in; `null` until the browser knows it. */
	zone: string | null;
	formatLocale: string;
	label: string;
	/** A column between the time and the results, such as the viewer's own answer. */
	action?:
		| { heading: string; renderCell: (option: ShownOption, when: string) => ReactNode }
		| undefined;
};

/** The background of each heat step, from nobody to almost everybody. */
export const HEAT = ["bg-heat-0", "bg-heat-1", "bg-heat-2", "bg-heat-3", "bg-heat-4"] as const;

/** The time of an option in `zone`, or the server-rendered reference-zone text until hydrated. */
export function useOptionWhen(zone: string | null, formatLocale: string) {
	const temporalReady = useTemporalReady();
	const when = useFinalWhen();

	return (option: ShownOption) =>
		temporalReady && zone !== null ? when(option, zone, formatLocale) : (option.initialWhen ?? "");
}

/** The names of `people` with "(if need be)" after those at that level. */
function useNames(formatLocale: string) {
	const t = useTranslations("Event");
	const list = new Intl.ListFormat(formatLocale, { type: "conjunction" });

	return (people: { name: string; level: Level }[]) =>
		list.format(
			people.map(({ name, level }) =>
				level === "if_need_be" ? t("nameIfNeedBe", { name }) : name,
			),
		);
}

/**
 * The options of a poll, one row each with its time, an optional action and its results: the
 * heads and the names by level. In a narrow container each row becomes a card.
 */
export function PollTable({ event, zone, formatLocale, label, action }: PollTableProps) {
	const t = useTranslations("Event");
	const count = useCount();
	const whenOf = useOptionWhen(zone, formatLocale);
	const list = new Intl.ListFormat(formatLocale, { type: "conjunction" });
	const total = event.participants.length;

	const cellClass = "px-3 py-3 align-top @max-3xl:px-4 @max-3xl:py-2";
	// Shown only in the cards, where the column headings are hidden.
	const cardLabel = "hidden text-sm text-ink-muted @max-3xl:block";

	return (
		<div className="@container">
			<table className="w-full border-collapse text-left @max-3xl:block">
				<caption className="sr-only">{label}</caption>
				<thead className="border-b border-earth @max-3xl:hidden">
					<tr>
						<th scope="col" className={cn(cellClass, "font-semibold")}>
							{t("pollTime")}
						</th>
						{action === undefined ? null : (
							<th scope="col" className={cn(cellClass, "font-semibold")}>
								{action.heading}
							</th>
						)}
						<th scope="col" className={cn(cellClass, "font-semibold")}>
							{t("pollResult")}
						</th>
					</tr>
				</thead>
				<tbody className="@max-3xl:flex @max-3xl:flex-col @max-3xl:gap-3">
					{event.options.map((option) => {
						const when = whenOf(option);
						const final = option.key === event.finalKey;

						const at = (level: Level) =>
							event.participants.filter((person) => person.levels[option.key] === level);

						const available = at("available");
						const ifNeedBe = at("if_need_be");
						const tally: Tally = { available: available.length, ifNeedBe: ifNeedBe.length };

						return (
							<tr
								key={option.key}
								className="border-b border-line @max-3xl:block @max-3xl:rounded-lg @max-3xl:border @max-3xl:border-earth"
							>
								<th scope="row" className={cn(cellClass, "font-normal @max-3xl:block")}>
									<span className="block min-h-[1.5em] font-semibold text-balance">{when}</span>
									{final ? (
										<span className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
											<FlagIcon aria-hidden weight="fill" size={16} />
											{t("finalTime")}
										</span>
									) : null}
								</th>
								{action === undefined ? null : (
									<td className={cn(cellClass, "@max-3xl:block")}>
										<span className={cardLabel}>{action.heading}</span>
										{action.renderCell(option, when)}
									</td>
								)}
								<td className={cn(cellClass, "@max-3xl:block")}>
									<span className={cardLabel}>{t("pollResult")}</span>
									<span className="flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
										<span
											aria-hidden
											className={cn(
												"h-5 w-6 shrink-0 border border-earth",
												HEAT[heatStep(tally, total)],
											)}
										/>
										<span>{count(tally, total)}</span>
									</span>
									{available.length === 0 ? null : (
										<span className="mt-1 block text-sm break-words">
											{t("pollAvailable", {
												names: list.format(available.map((person) => person.name)),
											})}
										</span>
									)}
									{ifNeedBe.length === 0 ? null : (
										<span className="mt-1 block text-sm break-words">
											{t("pollIfNeedBe", {
												names: list.format(ifNeedBe.map((person) => person.name)),
											})}
										</span>
									)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

type BestOptionsProps = {
	options: ShownOption[];
	best: ShownResult[];
	names: string[];
	zone: string | null;
	formatLocale: string;
};

/** The options that suit the most people, in the order of the score; a poll has no filters. */
export function BestOptions({ options, best, names, zone, formatLocale }: BestOptionsProps) {
	const t = useTranslations("Event");
	const count = useCount();
	const whenOf = useOptionWhen(zone, formatLocale);
	const namesOf = useNames(formatLocale);
	const id = useId();

	function emptyMessage() {
		return names.length === 0 ? t("windowsNoParticipants") : t("pollBestNone");
	}

	return (
		<PageRegion as="section" width="form" aria-labelledby={id} className="gap-4">
			<h2 id={id} className="text-xl">
				{t("windowsHeading")}
			</h2>
			{best.length === 0 ? (
				<p className="text-sm text-ink-muted">{emptyMessage()}</p>
			) : (
				<ol className="flex flex-col gap-2">
					{best.map((result) => {
						const option = options.find((candidate) => candidate.key === result.key);
						const ifNeedBe = result.people.filter(({ level }) => level === "if_need_be").length;
						const tally = { available: result.people.length - ifNeedBe, ifNeedBe };

						return (
							<li
								key={result.key}
								className="flex flex-col gap-1 rounded-md border border-earth px-3 py-2"
							>
								<span className="flex flex-wrap justify-between gap-x-4">
									<span className="min-h-[1.5em] font-semibold">
										{option === undefined ? "" : whenOf(option)}
									</span>
									<span className="tabular-nums">{count(tally, names.length)}</span>
								</span>
								<span className="text-sm [overflow-wrap:anywhere]">
									{namesOf(
										result.people.map(({ person, level }) => ({
											name: names[person] ?? "",
											level,
										})),
									)}
								</span>
							</li>
						);
					})}
				</ol>
			)}
		</PageRegion>
	);
}
