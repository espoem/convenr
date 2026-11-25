"use client";

import { useTranslations } from "next-intl";

import { SteadyLabel } from "@/components/steady-label";
import type { Brush, Level } from "@/domain/levels";
import { cn } from "@/lib/utils";

const BRUSHES = ["available", "if_need_be", "clear"] as const satisfies readonly Brush[];

/** The mark of a level as the participant's own grid draws it, for the brush and the legend. */
export function Swatch({ mark }: { mark: Brush }) {
	return (
		<span
			aria-hidden
			className={cn(
				"size-5 shrink-0 border border-earth",
				mark === "available" && "bg-heat-4",
				mark === "if_need_be" && "cv-hatch",
				mark === "clear" && "bg-heat-0",
			)}
		/>
	);
}

type BrushPickerProps = { brush: Brush; onChange: (brush: Brush) => void };

/** Three buttons with one pressed: what painting writes. It names the marks, so it is the legend. */
export function BrushPicker({ brush, onChange }: BrushPickerProps) {
	const t = useTranslations("Event");

	return (
		<fieldset className="flex flex-wrap items-center gap-2">
			<legend className="float-left mr-1 text-sm text-ink-muted">{t("brush")}</legend>
			{BRUSHES.map((mark) => (
				<button
					key={mark}
					type="button"
					aria-pressed={brush === mark}
					onClick={() => onChange(mark)}
					className="inline-flex min-h-11 items-center gap-2 rounded-md border border-earth px-3 aria-pressed:bg-ink aria-pressed:font-semibold aria-pressed:text-surface"
				>
					<Swatch mark={mark} />
					<SteadyLabel text={t(`brushLevel.${mark}`)} />
				</button>
			))}
		</fieldset>
	);
}

/**
 * The marks of one participant's levels, shown while the grid shows only that participant.
 * Hidden, it keeps its space, so choosing a participant does not push the grid down.
 */
export function PersonLegend({ shown, className }: { shown: boolean; className?: string }) {
	const t = useTranslations("Event");
	const levels: Level[] = ["available", "if_need_be"];

	return (
		<ul
			aria-label={t("personLegend")}
			aria-hidden={!shown}
			className={cn("flex flex-wrap gap-x-4 gap-y-2 text-sm", !shown && "invisible", className)}
		>
			{levels.map((level) => (
				<li key={level} className="flex items-center gap-2">
					<Swatch mark={level} />
					{t(`personLevel.${level}`)}
				</li>
			))}
		</ul>
	);
}
