import { useTranslations } from "next-intl";

import { headsOf, type Tally } from "@/domain/levels";

/** The count of a slot or a window: "4 of 6", and "1 of them if need be" when anyone is. */
export function useCount() {
	const t = useTranslations("Event");

	return (tally: Tally, total: number) => {
		const available = headsOf(tally);

		return tally.ifNeedBe === 0
			? t("count", { available, total })
			: t("countIfNeedBe", { available, total, ifNeedBe: tally.ifNeedBe });
	};
}
