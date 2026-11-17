import type { ReactNode } from "react";

import { LocaleSwitch } from "@/components/locale-switch";
import { Link } from "@/i18n/navigation";

/** The brand bar and the page width shared by every page. */
export function PageShell({ children }: { children: ReactNode }) {
	return (
		<div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-8 px-4 py-6 sm:px-6">
			<header className="flex items-center justify-between gap-4">
				<Link href="/" className="font-heading text-xl font-semibold text-action">
					convenr
				</Link>
				<LocaleSwitch />
			</header>
			{children}
		</div>
	);
}
