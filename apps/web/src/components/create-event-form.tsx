"use client";

import { useTranslations } from "next-intl";

import { EventForm, type EventFormOptions, type FormOutcome } from "@/components/event-form";
import { useRouter } from "@/i18n/navigation";
import { updateLocalEvent } from "@/lib/local-events";
import { createEventAction } from "@/server/event-actions";
import type { NewEvent } from "@/server/events";

/** The create form: stores the admin secret in this browser and shows the links. */
export function CreateEventForm({ options }: { options: EventFormOptions }) {
	const t = useTranslations("Create");
	const router = useRouter();

	async function create(input: NewEvent): Promise<FormOutcome> {
		try {
			const created = await createEventAction(input);

			if (!created.ok) {
				return { status: "invalid", problems: created.problems };
			}

			updateLocalEvent(created.id, (current) => ({
				...current,
				id: created.id,
				name: input.name.trim(),
				segment: created.segment,
				adminSecret: created.adminSecret,
			}));
			router.push(`/e/${created.segment}/created`);

			return { status: "done" };
		} catch {
			return { status: "failed" };
		}
	}

	return (
		<EventForm
			options={options}
			submitLabel={t("submit")}
			pendingLabel={t("creating")}
			onSubmit={create}
		/>
	);
}
