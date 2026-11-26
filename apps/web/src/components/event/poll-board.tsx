"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { PageRegion } from "@/components/page-region";
import { SteadyLabel } from "@/components/steady-label";
import { type Brush, type Level, withLevel } from "@/domain/levels";
import { useViewerZone } from "@/lib/browser-time";

import type { ShownFinal } from "./event-board";
import { JoinBand, type Joined } from "./join-band";
import { Swatch } from "./level-marks";
import { BestOptions, PollTable, type ShownOption, type ShownResult } from "./poll-table";
import { SaveBar } from "./save-bar";
import { useParticipation } from "./use-participation";
import { ZoneNotice } from "./zone-notice";

export type PollBoardEvent = {
	id: string;
	name: string;
	segment: string;
	referenceZone: string;
	/** In time order. */
	options: ShownOption[];
	/** The best options, best first. */
	best: ShownResult[];
	/** The answer keys of the options. */
	slots: string[];
	participants: { name: string; levels: Record<string, Level> }[];
	final: ShownFinal;
};

/** The key of the final option, or `null` while the final time is open. */
export function finalKeyOf(final: ShownFinal): string | null {
	return final.kind === "chosen" ? (final.slots[0] ?? null) : null;
}

const ANSWERS = ["available", "if_need_be", "clear"] as const satisfies readonly Brush[];

type AnswerButtonsProps = {
	level: Level | null;
	label: string;
	onChange: (level: Level | null) => void;
};

/** Three buttons with one pressed: the viewer's answer to one option. */
function AnswerButtons({ level, label, onChange }: AnswerButtonsProps) {
	const t = useTranslations("Event");

	return (
		<fieldset className="flex flex-wrap gap-2 @3xl:flex-nowrap">
			<legend className="sr-only">{label}</legend>
			{ANSWERS.map((answer) => {
				const pressed = answer === "clear" ? level === null : level === answer;

				return (
					<button
						key={answer}
						type="button"
						aria-pressed={pressed}
						onClick={() => onChange(answer === "clear" ? null : answer)}
						className="inline-flex min-h-11 flex-[1_1_auto] items-center gap-2 rounded-md border border-earth px-3 whitespace-nowrap aria-pressed:bg-ink aria-pressed:font-semibold aria-pressed:text-surface"
					>
						<Swatch mark={answer} />
						<SteadyLabel text={t(`pollLevel.${answer}`)} />
					</button>
				);
			})}
		</fieldset>
	);
}

type PollBoardProps = {
	event: PollBoardEvent;
	/** The participant the server recognized from the browser's key. */
	viewer: Joined | null;
	formatLocale: string;
};

/** The event page of a poll below its header: join band, the options with answers and results. */
export function PollBoard({ event, viewer, formatLocale }: PollBoardProps) {
	const t = useTranslations("Event");
	const tJoin = useTranslations("Join");
	const id = useId();
	const viewerZone = useViewerZone();
	// Not stored, so every visit starts in the viewer's zone.
	const [inReferenceZone, setInReferenceZone] = useState(false);

	const participation = useParticipation(event, viewer, formatLocale);
	const { joined, selection, dirty, edit } = participation;
	const zone = inReferenceZone ? event.referenceZone : viewerZone;
	const names = event.participants.map((participant) => participant.name);
	const table = { ...event, finalKey: finalKeyOf(event.final) };

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

			<section aria-labelledby={`${id}-options`} className="flex flex-col gap-4">
				<h2 id={`${id}-options`} className="text-xl">
					{t("pollHeading")}
				</h2>
				<ZoneNotice
					referenceZone={event.referenceZone}
					viewerZone={viewerZone}
					dated
					poll
					inReferenceZone={inReferenceZone}
					onSwitch={() => setInReferenceZone(!inReferenceZone)}
				/>
				<PageRegion width="measure">
					<p className="text-sm text-ink-muted">
						{joined === null ? t("pollJoinFirst") : t("pollHint")}
					</p>
				</PageRegion>
				<PollTable
					event={table}
					zone={zone}
					formatLocale={formatLocale}
					label={t("pollHeading")}
					action={
						joined === null
							? undefined
							: {
									heading: t("pollYours"),
									renderCell: (option, when) => (
										<AnswerButtons
											level={selection[option.key] ?? null}
											label={t("pollYoursFor", { when })}
											onChange={(level) => edit(withLevel(selection, [option.key], level))}
										/>
									),
								}
					}
				/>
			</section>

			{joined === null ? null : (
				<SaveBar
					message={participation.barMessage}
					dirty={dirty}
					saving={participation.saving}
					poll
					onDiscard={() => edit(null)}
					onSave={participation.save}
				/>
			)}

			<BestOptions
				options={event.options}
				best={event.best}
				names={names}
				zone={zone}
				formatLocale={formatLocale}
			/>

			<section aria-labelledby={`${id}-people`} className="flex flex-col gap-3">
				<h2 id={`${id}-people`} className="text-xl">
					{t("participants", { count: names.length })}
				</h2>
				{names.length === 0 ? (
					<p className="text-ink-muted">{t("noParticipants")}</p>
				) : (
					<ul className="flex flex-wrap gap-x-4 gap-y-1">
						{names.map((name) => (
							<li key={name} className="break-words">
								{name}
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
