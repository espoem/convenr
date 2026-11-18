import { LockSimpleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

/**
 * Text inputs and selects: earth border (DESIGN.md token table), touch-target height. A
 * disabled control is a locked one (DESIGN.md rule 12): its value stays in `ink`.
 */
export const controlClass =
	"min-h-11 w-full min-w-0 rounded-md border border-earth bg-surface px-3 text-base disabled:cursor-not-allowed disabled:border-line disabled:bg-locked disabled:text-ink aria-invalid:border-2 aria-invalid:border-action-active";

type FieldProps = {
	id: string;
	label: string;
	hint?: string | undefined;
	error?: string | undefined;
	/** Why the control cannot change; shown with a lock below it (DESIGN.md rule 12). */
	locked?: string | undefined;
	children: ReactNode;
	className?: string;
};

/**
 * A label, its control and the control's messages. The control sets `aria-describedby` to
 * `${id}-message`, and also `${id}-locked` when `locked` is given, and `aria-invalid` when
 * `error` is given.
 */
export function Field({ id, label, hint, error, locked, children, className }: FieldProps) {
	return (
		<div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
			<label htmlFor={id} className="font-medium">
				{label}
			</label>
			{children}
			{locked === undefined ? null : <LockedNote id={`${id}-locked`} text={locked} />}
			<FieldMessage id={`${id}-message`} hint={hint} error={error} />
		</div>
	);
}

/** The lock and the reason below a control that cannot change (DESIGN.md rule 12). */
export function LockedNote({ id, text }: { id: string; text: string }) {
	return (
		<p id={id} className="flex max-w-(--cv-measure) items-start gap-1.5 text-sm text-ink-muted">
			<LockSimpleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
			{text}
		</p>
	);
}

type FieldMessageProps = { id: string; hint?: string | undefined; error?: string | undefined };

export function FieldMessage({ id, hint, error }: FieldMessageProps) {
	if (error !== undefined) {
		return (
			<p id={id} className="text-sm font-semibold text-action-active">
				{error}
			</p>
		);
	}

	return hint === undefined ? null : (
		<p id={id} className="max-w-(--cv-measure) text-sm text-ink-muted">
			{hint}
		</p>
	);
}
