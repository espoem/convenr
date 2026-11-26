import { useTranslations } from "next-intl";

import { PageMain } from "@/components/page-region";
import { PageShell } from "@/components/page-shell";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
	const t = useTranslations("NotFound");

	return (
		<PageShell>
			<PageMain width="measure" className="gap-4">
				<h1 className="text-3xl">{t("heading")}</h1>
				<p>{t("hint")}</p>
				<Link
					href="/"
					className="inline-flex min-h-11 w-fit items-center text-action underline underline-offset-4"
				>
					{t("back")}
				</Link>
			</PageMain>
		</PageShell>
	);
}
