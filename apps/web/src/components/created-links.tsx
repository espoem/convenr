"use client";

import { useTranslations } from "next-intl";

import { CopyField } from "@/components/copy-field";
import { Link, getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { useLocalEvents } from "@/lib/local-events";
import { useOrigin } from "@/lib/use-origin";

type CreatedLinksProps = {
	id: string;
	segment: string;
	locale: Locale;
	/** The signed-in organizer's account owns the event, so losing the admin link loses nothing. */
	inAccount: boolean;
};

/** The share link and the admin link. The admin link exists only in this browser's storage. */
export function CreatedLinks({ id, segment, locale, inAccount }: CreatedLinksProps) {
	const t = useTranslations("Created");
	const origin = useOrigin();
	const stored = useLocalEvents().get(id);
	const eventPath = getPathname({ href: `/e/${segment}`, locale });

	if (origin === null) {
		return <div className="h-64" />;
	}

	if (stored?.adminSecret === undefined) {
		return (
			<div className="flex max-w-(--cv-form) flex-col gap-4">
				<p>{t("missing")}</p>
				<CopyField label={t("shareLink")} value={`${origin}${eventPath}`} />
			</div>
		);
	}

	return (
		<div className="flex max-w-(--cv-form) flex-col gap-6">
			<CopyField label={t("shareLink")} value={`${origin}${eventPath}`} />
			<div className="flex flex-col gap-2">
				<CopyField
					label={t("adminLink")}
					value={`${origin}${eventPath}/manage#${stored.adminSecret}`}
				/>
				{inAccount ? (
					<p className="max-w-(--cv-measure)">{t("adminInAccount")}</p>
				) : (
					<p className="max-w-(--cv-measure) font-semibold">{t("adminWarning")}</p>
				)}
			</div>
			<Link
				href={`/e/${segment}`}
				className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-action px-4 font-semibold text-on-action hover:bg-action-active sm:w-fit"
			>
				{t("open")}
			</Link>
		</div>
	);
}
