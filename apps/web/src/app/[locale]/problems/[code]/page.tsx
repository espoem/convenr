import { notFound, redirect } from "next/navigation";

import { problemAnchor } from "@/components/api-reference/schema-type";
import { currentLocale } from "@/i18n/current-locale";
import { PROBLEM_STATUS } from "@/server/api/http";

/** The `type` of a problem resolves to the code's description on the reference page. */
export default async function ProblemPage({ params }: PageProps<"/[locale]/problems/[code]">) {
	const { code } = await params;

	if (!Object.hasOwn(PROBLEM_STATUS, code)) {
		notFound();
	}

	redirect(`/${await currentLocale()}/api#${problemAnchor(code)}`);
}
