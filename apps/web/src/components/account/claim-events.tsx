"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { PageRegion } from "@/components/page-region";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { useLocalEvents } from "@/lib/local-events";
import {
	type ClaimOutcome,
	claimEventAction,
	linkParticipantAction,
	type LinkOutcome,
} from "@/server/ownership-actions";

/** What adding an event to the account does: own it with the secret, or link the participant. */
type Addition = { kind: "organizer"; secret: string } | { kind: "participant"; name: string };

type Candidate = { id: string; name: string; additions: Addition[] };

type Refusal = Exclude<ClaimOutcome, "claimed" | "already_owned"> | Exclude<LinkOutcome, "linked">;

async function added(id: string, addition: Addition): Promise<Refusal | undefined> {
	if (addition.kind === "organizer") {
		const outcome = await claimEventAction(id, addition.secret);

		return outcome === "claimed" || outcome === "already_owned" ? undefined : outcome;
	}

	const outcome = await linkParticipantAction(id);

	return outcome === "linked" ? undefined : outcome;
}

/** Adds the events one after another and answers the refusals by event. */
async function addInTurn(events: Candidate[]): Promise<Map<string, Refusal[]>> {
	const [first, ...rest] = events;

	if (first === undefined) {
		return new Map();
	}

	const outcomes = await Promise.all(
		first.additions.map(async (addition) => added(first.id, addition)),
	);

	const refusals = await addInTurn(rest);
	const mine = outcomes.filter((outcome) => outcome !== undefined);

	if (mine.length > 0) {
		refusals.set(first.id, mine);
	}

	return refusals;
}

/**
 * The events this browser organizes or joined that are not in the account, each with a button
 * to add it, and a button to add them all. Only this browser knows them, from local storage.
 */
export function ClaimEvents({ ownedIds, joinedIds }: { ownedIds: string[]; joinedIds: string[] }) {
	const t = useTranslations("Account.claim");
	const roles = useTranslations("MyEvents");
	const router = useRouter();
	const [refused, setRefused] = useState<ReadonlyMap<string, Refusal[]>>(new Map());
	const [pending, startTransition] = useTransition();

	const candidates: Candidate[] = [...useLocalEvents().values()].toReversed().flatMap((event) => {
		const additions: Addition[] = [];

		if (event.adminSecret !== undefined && !ownedIds.includes(event.id)) {
			additions.push({ kind: "organizer", secret: event.adminSecret });
		}

		if (event.participant !== undefined && !joinedIds.includes(event.id)) {
			additions.push({ kind: "participant", name: event.participant.name });
		}

		return additions.length === 0 ? [] : [{ id: event.id, name: event.name, additions }];
	});

	if (candidates.length === 0) {
		return null;
	}

	function add(chosen: Candidate[]) {
		startTransition(async () => {
			setRefused(await addInTurn(chosen));
			router.refresh();
		});
	}

	return (
		<PageRegion as="section" width="column" aria-labelledby="account-claim" className="gap-3">
			<h2 id="account-claim" className="text-xl">
				{t("heading")}
			</h2>
			<PageRegion width="measure">
				<p>{t("intro")}</p>
			</PageRegion>
			<ul className="flex flex-col divide-y divide-line border-y border-line">
				{candidates.map((event) => (
					<li key={event.id} className="flex flex-col gap-1 py-3">
						<span className="flex flex-wrap items-center justify-between gap-3">
							<span className="flex min-w-0 flex-col">
								<span className="font-semibold [overflow-wrap:anywhere]">{event.name}</span>
								<span className="text-sm text-ink-muted">
									{event.additions
										.map((addition) =>
											addition.kind === "organizer"
												? roles("organizer")
												: roles("participant", { name: addition.name }),
										)
										.join(" · ")}
								</span>
							</span>
							<Button
								type="button"
								variant="outline"
								disabled={pending}
								onClick={() => add([event])}
							>
								{t("add")}
							</Button>
						</span>
						<span className="text-sm font-semibold text-action-active empty:sr-only">
							{(refused.get(event.id) ?? []).map((refusal) => t(`problem.${refusal}`)).join(" ")}
						</span>
					</li>
				))}
			</ul>
			{candidates.length > 1 ? (
				<Button type="button" disabled={pending} onClick={() => add(candidates)} className="w-fit">
					{t("addAll")}
				</Button>
			) : null}
		</PageRegion>
	);
}
