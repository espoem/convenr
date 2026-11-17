"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type CopyFieldProps = {
	label: string;
	value: string;
};

/** A read-only link with a copy button. Selecting the text works where the clipboard does not. */
export function CopyField({ label, value }: CopyFieldProps) {
	const t = useTranslations("Copy");
	const id = useId();
	const field = useRef<HTMLInputElement>(null);
	const [copied, setCopied] = useState(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
		} catch {
			field.current?.select();
		}
	}

	return (
		<div className="flex flex-col gap-1.5">
			<label htmlFor={id} className="font-medium">
				{label}
			</label>
			<div className="flex flex-wrap gap-2">
				<input
					ref={field}
					id={id}
					readOnly
					value={value}
					onFocus={(event) => event.currentTarget.select()}
					className="min-h-11 min-w-0 flex-[1_1_18rem] rounded-md border border-line bg-surface px-3"
				/>
				<Button type="button" variant="outline" onClick={() => void copy()}>
					{t("copy")}
				</Button>
			</div>
			<p aria-live="polite" className="min-h-6 text-sm text-ink-muted">
				{copied ? t("copied") : ""}
			</p>
		</div>
	);
}
