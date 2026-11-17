import type { ReactNode } from "react";

/** Text inputs and selects: earth border (DESIGN.md token table), touch-target height. */
export const controlClass =
	"min-h-11 w-full min-w-0 rounded-md border border-earth bg-surface px-3 text-base disabled:cursor-not-allowed disabled:border-line disabled:text-ink-muted aria-invalid:border-2 aria-invalid:border-action-active";

type FieldProps = {
	id: string;
	label: string;
	hint?: string | undefined;
	error?: string | undefined;
	children: ReactNode;
	className?: string;
};

/**
 * A label, its control and the control's message. The control sets `aria-describedby` to
 * `${id}-message` and `aria-invalid` when `error` is given.
 */
export function Field({ id, label, hint, error, children, className }: FieldProps) {
	return (
		<div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
			<label htmlFor={id} className="font-medium">
				{label}
			</label>
			{children}
			<FieldMessage id={`${id}-message`} hint={hint} error={error} />
		</div>
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
		<p id={id} className="text-sm text-ink-muted">
			{hint}
		</p>
	);
}
