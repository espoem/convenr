"use client";

import { useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

/**
 * Removes something of the account after a question inside the page, as every destructive action
 * asks first. `fields` are the form's hidden inputs: the page's language and what to remove.
 */
export function RemoveQuestion({
	action,
	fields,
	texts,
}: {
	action: (form: FormData) => Promise<void>;
	fields: ReactNode;
	texts: { remove: string; question: string; yes: string; no: string };
}) {
	const id = useId();
	const [confirming, setConfirming] = useState(false);

	return (
		<div className="flex flex-col gap-3">
			<Button
				type="button"
				variant="destructive"
				aria-expanded={confirming}
				aria-controls={id}
				onClick={() => setConfirming(!confirming)}
				className="w-fit"
			>
				{texts.remove}
			</Button>
			<div id={id} className="empty:hidden">
				{confirming ? (
					<form action={action} role="alert" className="flex max-w-(--cv-measure) flex-col gap-3">
						{fields}
						<p>{texts.question}</p>
						<div className="flex flex-wrap gap-2">
							<Button type="submit" variant="destructive">
								{texts.yes}
							</Button>
							<Button type="button" variant="outline" onClick={() => setConfirming(false)}>
								{texts.no}
							</Button>
						</div>
					</form>
				) : null}
			</div>
		</div>
	);
}
