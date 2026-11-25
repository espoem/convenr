import type { ReactNode } from "react";

/** Shared inline emphasis formatter for localized rich-text messages. */
export function strong(text: ReactNode) {
	return <strong>{text}</strong>;
}
