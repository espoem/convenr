"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { controlClass } from "@/components/field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

	useEffect(() => {
		if (!copied) {
			return;
		}

		const timer = setTimeout(() => setCopied(false), 2500);

		return () => clearTimeout(timer);
	}, [copied]);

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
		} catch {
			field.current?.select();
		}
	}

	return (
		<div className="flex w-full max-w-(--cv-form) flex-col gap-1.5">
			<div className="flex items-baseline justify-between gap-2">
				<label htmlFor={id} className="font-medium">
					{label}
				</label>
				<span aria-live="polite" className="text-sm font-medium text-ink-muted empty:sr-only">
					{copied ? t("copied") : ""}
				</span>
			</div>
			<div className="flex items-center gap-2">
				<div className="relative min-w-0 flex-1">
					<input
						ref={field}
						id={id}
						readOnly
						value={value}
						onFocus={(event) => event.currentTarget.select()}
						className={cn(controlClass, "pr-8")}
					/>
					<span
						aria-hidden
						className="pointer-events-none absolute inset-y-px right-px w-6 rounded-r-lg bg-linear-to-l from-surface to-transparent"
					/>
				</div>
				<Button type="button" variant="outline" onClick={() => void copy()}>
					{t("copy")}
				</Button>
			</div>
		</div>
	);
}
