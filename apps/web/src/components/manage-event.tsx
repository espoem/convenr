"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { EventForm, type EventFormOptions, type FormOutcome } from "@/components/event-form";
import type { ServerGrid } from "@/components/event/board-view";
import type { BoardEvent } from "@/components/event/event-board";
import type { PollBoardEvent } from "@/components/event/poll-board";
import { FinalPicker } from "@/components/final-picker";
import { PollFinalPicker } from "@/components/poll-final-picker";
import type { StoredOption } from "@/components/poll-options-editor";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { EventVersion } from "@/lib/event-version";
import { type LocalEvent, updateLocalEvent, useLocalEvents } from "@/lib/local-events";
import type { ManageCredential } from "@/lib/manage-credential";
import {
	loadManageAction,
	removeEventAction,
	removeParticipantAction,
	updateEventAction,
} from "@/server/event-actions";
import type { NewEvent } from "@/server/events";
import type { Confirmation, ManagedEvent } from "@/server/manage";

/** What the final time is picked from: a grid, or a poll's options. */
export type ManagedBoard =
	| { kind: "grid"; board: BoardEvent; serverGrid: ServerGrid }
	| { kind: "poll"; board: PollBoardEvent };

type ManageEventProps = {
	id: string;
	options: EventFormOptions;
	board: ManagedBoard;
	/** A poll's options as stored, so that the form can show the kept ones. */
	storedOptions: StoredOption[];
	/** The version the page was rendered at. */
	version: EventVersion;
	formatLocale: string;
};

const AS_OWNER: ManageCredential = { kind: "owner" };

/**
 * The manage page. The admin secret comes from the address fragment,
 * which never reaches the server in an address (ADR 0003 item 2), or from local storage.
 * Without a secret that fits, the page asks as the owner, which works where the account that
 * owns the event is signed in.
 */
export function ManageEvent({
	id,
	options,
	board,
	storedOptions,
	version,
	formatLocale,
}: ManageEventProps) {
	const t = useTranslations("Manage");
	const router = useRouter();
	const storedSecret = useLocalEvents().get(id)?.adminSecret;

	// `null` until the first answer; then the credential used and the event, or `null` if refused.
	const [loaded, setLoaded] = useState<{
		credential: ManageCredential;
		event: ManagedEvent | null;
	} | null>(null);

	// The version the loaded fields belong to.
	const loadedAt = useRef(version);
	const [saved, setSaved] = useState(0);
	const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [failed, setFailed] = useState(false);
	const [pending, startTransition] = useTransition();

	const load = useCallback(
		async (credential: ManageCredential) => {
			const found = await loadManageAction(id, credential);

			if (found !== null) {
				updateLocalEvent(id, (current) => {
					const remembered: LocalEvent = {
						...current,
						id,
						name: found.name,
						segment: found.segment,
					};

					// The owner's browser remembers the event, but learns no secret it did not have.
					if (credential.kind === "secret") {
						remembered.adminSecret = credential.secret;
					}

					return remembered;
				});
			}

			return { credential, event: found };
		},
		[id],
	);

	useEffect(() => {
		const secret = window.location.hash.slice(1) || storedSecret;
		let current = true;

		const first = async () => {
			const bySecret = secret === undefined ? undefined : await load({ kind: "secret", secret });

			return bySecret?.event ? bySecret : load(AS_OWNER);
		};

		void first().then((answer) => {
			if (current) {
				setLoaded(answer);
			}
		});

		return () => {
			current = false;
		};
	}, [load, storedSecret]);

	// A new version, after a change anyone made, reloads the participants and the stored fields.
	useEffect(() => {
		if (loaded === null || loadedAt.current === version) {
			return;
		}

		let current = true;

		loadedAt.current = version;
		void load(loaded.credential).then((answer) => {
			if (current) {
				setLoaded(answer);
			}
		});

		return () => {
			current = false;
		};
	}, [load, loaded, version]);

	if (loaded === null) {
		return <p aria-live="polite">{t("checking")}</p>;
	}

	const { credential, event } = loaded;

	if (event === null) {
		return (
			<p role="alert" className="max-w-(--cv-measure) text-lg">
				{t("invalid")}
			</p>
		);
	}

	async function save(input: NewEvent, confirmation: Confirmation): Promise<FormOutcome> {
		try {
			const result = await updateEventAction(id, credential, input, confirmation);

			switch (result.status) {
				case "saved":
					setLoaded(await load(credential));
					setSaved((count) => count + 1);
					router.replace(`/e/${result.segment}/manage`);
					router.refresh();

					return { status: "done" };
				case "denied":
					setLoaded({ credential, event: null });

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
			() => removeParticipantAction(id, credential, participantId),
			async () => {
				setRemoving(null);
				setLoaded(await load(credential));
			},
		);
	}

	function deleteEvent() {
		act(
			() => removeEventAction(id, credential),
			() => {
				// Returning nothing removes the record from this browser.
				updateLocalEvent(id, () => {});
				router.push("/");
			},
		);
	}

	return (
		<div className="flex flex-col gap-12">
			{board.kind === "grid" ? (
				<FinalPicker
					event={board.board}
					serverGrid={board.serverGrid}
					formatLocale={formatLocale}
					credential={credential}
					onDenied={() => setLoaded({ credential, event: null })}
				/>
			) : (
				<PollFinalPicker
					event={board.board}
					formatLocale={formatLocale}
					credential={credential}
					onDenied={() => setLoaded({ credential, event: null })}
				/>
			)}

			<section aria-labelledby="edit" className="flex flex-col gap-6">
				<h2 id="edit" className="text-2xl">
					{t("edit")}
				</h2>
				<EventForm
					key={saved}
					options={options}
					initial={event}
					storedOptions={storedOptions}
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
					<ul className="flex max-w-(--cv-form) flex-col divide-y divide-line border-y border-line">
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
