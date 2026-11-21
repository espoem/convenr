"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { useLocalEvents } from "@/lib/local-events";
import { type ClaimOutcome, claimEventAction } from "@/server/ownership-actions";

type Refusal = Exclude<ClaimOutcome, "claimed" | "already_owned">;

type Candidate = { id: string; name: string; secret: string };

/**
 * Adds the events one after another, so that each answer is about its own event and the
 * claims do not wait on each other's locks; answers the refusals by event.
 */
async function claimInTurn(events: Candidate[]): Promise<Map<string, Refusal>> {
	const [first, ...rest] = events;

	if (first === undefined) {
		return new Map();
	}

	const outcome = await claimEventAction(first.id, first.secret);
	const refusals = await claimInTurn(rest);

	if (outcome !== "claimed" && outcome !== "already_owned") {
		refusals.set(first.id, outcome);
	}

	return refusals;
}

/**
 * The events this browser organizes that are not in the account, each with a button to add it,
 * and a button to add them all. Only this browser knows them, from local storage.
 */
export function ClaimEvents({ ownedIds }: { ownedIds: string[] }) {
	const t = useTranslations("Account.claim");
	const router = useRouter();
	const [refused, setRefused] = useState<ReadonlyMap<string, Refusal>>(new Map());
	const [pending, startTransition] = useTransition();

	const candidates: Candidate[] = [...useLocalEvents().values()]
		.toReversed()
		.flatMap((event) =>
			event.adminSecret === undefined || ownedIds.includes(event.id)
				? []
				: [{ id: event.id, name: event.name, secret: event.adminSecret }],
		);

	if (candidates.length === 0) {
		return null;
	}

	function add(chosen: Candidate[]) {
		startTransition(async () => {
			setRefused(await claimInTurn(chosen));
			router.refresh();
		});
	}

	return (
		<section aria-labelledby="account-claim" className="flex flex-col gap-3">
			<h2 id="account-claim" className="text-xl">
				{t("heading")}
			</h2>
			<p className="max-w-(--cv-measure)">{t("intro")}</p>
			<ul className="flex flex-col divide-y divide-line border-y border-line">
				{candidates.map((event) => {
					const refusal = refused.get(event.id);

					return (
						<li key={event.id} className="flex flex-col gap-1 py-3">
							<span className="flex flex-wrap items-center justify-between gap-3">
								<span className="font-semibold break-words">{event.name}</span>
								<Button
									type="button"
									variant="outline"
									disabled={pending}
									onClick={() => add([event])}
								>
									{t("add")}
								</Button>
							</span>
							<span className="text-sm font-semibold text-action-active">
								{refusal === undefined ? "" : t(`problem.${refusal}`)}
							</span>
						</li>
					);
				})}
			</ul>
			{candidates.length > 1 ? (
				<Button type="button" disabled={pending} onClick={() => add(candidates)} className="w-fit">
					{t("addAll")}
				</Button>
			) : null}
		</section>
	);
}
