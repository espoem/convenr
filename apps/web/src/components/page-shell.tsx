import { UserCircleIcon } from "@phosphor-icons/react/ssr";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { LocaleSwitch } from "@/components/locale-switch";
import { ThemeMenu } from "@/components/theme-menu";
import { Link } from "@/i18n/navigation";
import { currentVisitor } from "@/server/session";

/** Sign-in, or the account when signed in; nothing while accounts are off. */
async function AccountLink() {
	const visitor = await currentVisitor();

	if (visitor.kind === "accounts_off") {
		return null;
	}

	const t = await getTranslations("AccountLink");
	const signedIn = visitor.kind === "signed_in";

	return (
		<Link
			href={signedIn ? "/account" : "/sign-in"}
			className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-2 whitespace-nowrap text-action underline-offset-4 hover:underline"
		>
			<UserCircleIcon aria-hidden className="size-5 shrink-0" />
			{/* A phone has no room for the word beside the menus, so there the icon stands alone. */}
			<span className="max-[26rem]:sr-only">{signedIn ? t("account") : t("signIn")}</span>
		</Link>
	);
}

/** The brand bar and the page width shared by every page. */
export function PageShell({ children }: { children: ReactNode }) {
	return (
		<div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-8 px-4 py-6 sm:px-6">
			<header className="flex items-center justify-between gap-4">
				<Link href="/" className="font-heading text-xl font-semibold text-action">
					convenr
				</Link>
				<div className="flex items-center gap-1">
					<AccountLink />
					<ThemeMenu />
					<LocaleSwitch />
				</div>
			</header>
			{children}
		</div>
	);
}
