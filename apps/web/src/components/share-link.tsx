"use client";

import { CopyField } from "@/components/copy-field";
import { useOrigin } from "@/lib/use-origin";

/** The share link of an event page, complete with the address the visitor used. */
export function ShareLink({ label, path }: { label: string; path: string }) {
	const origin = useOrigin();

	return <CopyField label={label} value={`${origin ?? ""}${path}`} />;
}
