"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, useTransition } from "react";

import { EventForm, type EventFormOptions, type FormOutcome } from "@/components/event-form";
import type { BoardEvent } from "@/components/event/event-board";
import { FinalPicker } from "@/components/final-picker";
import { Button } from "@/components/ui/button";
import type { GridView } from "@/domain/grid-labels";
import { useRouter } from "@/i18n/navigation";
import { updateLocalEvent, useLocalEvents } from "@/lib/local-events";
import {
	loadManageAction,
	removeEventAction,
	removeParticipantAction,
	updateEventAction,
} from "@/server/event-actions";
import type { NewEvent } from "@/server/events";
import type { Confirmation, ManagedEvent } from "@/server/manage";

type ManageEventProps = {
	id: string;
	options: EventFormOptions;
	board: BoardEvent;
	weekdayView: GridView | null;
	formatLocale: string;
};

/**
 * The manage page. The admin secret comes from the address fragment,
 * which never reaches the server in an address (ADR 0003 item 2), or from local storage.
 */
export function ManageEvent({ id, options, board, weekdayView, formatLocale }: ManageEventProps) {
	const t = useTranslations("Manage");
	const router = useRouter();
	const storedSecret = useLocalEvents().get(id)?.adminSecret;
	// `null` until the first answer; then the secret used and the event, or `null` if refused.
	const [loaded, setLoaded] = useState<{ secret: string; event: ManagedEvent | null } | null>(null);
	const [saved, setSaved] = useState(0);
	const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [failed, setFailed] = useState(false);
	const [pending, startTransition] = useTransition();

	const load = useCallback(
		async (held: string) => {
			const found = await loadManageAction(id, held);

			if (found !== null) {
				updateLocalEvent(id, (current) => ({
					...current,
					id,
					name: found.name,
					segment: found.segment,
					adminSecret: held,
				}));
			}

			return { secret: held, event: found };
		},
		[id],
	);

	useEffect(() => {
		const fromLink = window.location.hash.slice(1);
		let current = true;

		void load(fromLink === "" ? (storedSecret ?? "") : fromLink).then((answer) => {
			if (current) {
				setLoaded(answer);
			}
		});

		return () => {
			current = false;
		};
	}, [load, storedSecret]);

	if (loaded === null) {
		return <p aria-live="polite">{t("checking")}</p>;
	}

	const { secret, event } = loaded;

	if (event === null) {
		return (
			<p role="alert" className="max-w-(--cv-measure) text-lg">
				{t("invalid")}
			</p>
		);
	}

	async function save(input: NewEvent, confirmation: Confirmation): Promise<FormOutcome> {
		try {
			const result = await updateEventAction(id, secret, input, confirmation);

			switch (result.status) {
				case "saved":
					setLoaded(await load(secret));
					setSaved((count) => count + 1);
					router.replace(`/e/${result.segment}/manage`);
					router.refresh();

					return { status: "done" };
				case "denied":
					setLoaded({ secret, event: null });

					return { status: "done" };
				case "invalid":
					return { status: "invalid", problems: result.problems };
				case "confirm":
					return result;
			}
		} catch {
			return { status: "failed" };
		}
	}

	function act(action: () => Promise<boolean>, done: () => Promise<void> | void) {
		startTransition(async () => {
			try {
				const ok = await action();

				setFailed(!ok);

				if (ok) {
					await done();
				}
			} catch {
				setFailed(true);
			}
		});
	}

	function removeParticipant(participantId: string) {
		act(
			() => removeParticipantAction(id, secret, participantId),
			async () => {
				setRemoving(null);
				setLoaded(await load(secret));
			},
		);
	}

	function deleteEvent() {
		act(
			() => removeEventAction(id, secret),
			() => {
				// Returning nothing removes the record from this browser.
				updateLocalEvent(id, () => {});
				router.push("/");
			},
		);
	}

	return (
		<div className="flex flex-col gap-12">
			<FinalPicker
				event={board}
				weekdayView={weekdayView}
				formatLocale={formatLocale}
				secret={secret}
				onDenied={() => setLoaded({ secret, event: null })}
			/>

			<section aria-labelledby="edit" className="flex flex-col gap-6">
				<h2 id="edit" className="text-2xl">
					{t("edit")}
				</h2>
				<EventForm
					key={saved}
					options={options}
					initial={event}
					locked={event.locked}
					submitLabel={t("save")}
					pendingLabel={t("saving")}
					onSubmit={save}
				/>
				<p aria-live="polite" className="text-sm">
					{saved > 0 ? t("saved") : ""}
				</p>
			</section>

			<section aria-labelledby="people" className="flex flex-col gap-4">
				<h2 id="people" className="text-2xl">
					{t("participants", { count: event.participants.length })}
				</h2>
				{event.participants.length === 0 ? (
					<p className="text-ink-muted">{t("noParticipants")}</p>
				) : (
					<ul className="flex max-w-xl flex-col divide-y divide-line border-y border-line">
						{event.participants.map((person) => (
							<li
								key={person.id}
								className="flex flex-wrap items-center justify-between gap-2 py-2"
							>
								<span className="break-words">{person.name}</span>
								<Button
									type="button"
									variant="destructive"
									onClick={() => setRemoving(person)}
									aria-label={t("removeParticipantLabel", { name: person.name })}
								>
									{t("removeParticipant")}
								</Button>
							</li>
						))}
					</ul>
				)}
				{removing === null ? null : (
					<div role="alert" className="flex max-w-(--cv-measure) flex-col gap-3">
						<p>{t("removeParticipantConfirm", { name: removing.name })}</p>
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								variant="destructive"
								disabled={pending}
								onClick={() => removeParticipant(removing.id)}
							>
								{t("removeParticipantYes")}
							</Button>
							<Button type="button" variant="outline" onClick={() => setRemoving(null)}>
								{t("keep")}
							</Button>
						</div>
					</div>
				)}
			</section>

			<section aria-labelledby="delete" className="flex flex-col gap-4">
				<h2 id="delete" className="text-2xl">
					{t("deleteHeading")}
				</h2>
				{deleting ? (
					<div role="alert" className="flex max-w-(--cv-measure) flex-col gap-3">
						<p>{t("deleteConfirm", { name: event.name })}</p>
						<div className="flex flex-wrap gap-2">
							<Button type="button" variant="destructive" disabled={pending} onClick={deleteEvent}>
								{t("deleteYes")}
							</Button>
							<Button type="button" variant="outline" onClick={() => setDeleting(false)}>
								{t("keep")}
							</Button>
						</div>
					</div>
				) : (
					<>
						<p className="max-w-(--cv-measure)">{t("deleteLead")}</p>
						<Button
							type="button"
							variant="destructive"
							className="w-fit"
							onClick={() => setDeleting(true)}
						>
							{t("deleteEvent")}
						</Button>
					</>
				)}
			</section>

			<p aria-live="polite" className="text-sm font-semibold text-action-active">
				{failed ? t("failed") : ""}
			</p>
		</div>
	);
}
