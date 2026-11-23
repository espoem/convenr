import { test } from "@playwright/test";

import { accountsPage, signIn } from "./accounts";
import { cell, createEvent, expect, joinIn } from "./helpers";
import { attachmentText, emailTo, uniqueAddress } from "./mail";

// The acceptance test of accounts: a browser stays joined without JavaScript, an organizer adds
// an event to an account and keeps it, and a signed-in participant gets the final time by email
// with a calendar file.
test.skip(({ viewport }) => viewport?.width !== 390, "Defined once, for the phone viewport.");

test.setTimeout(120_000);

test("an organizer keeps an event and a signed-in participant gets its final time by email", async ({
	browser,
}) => {
	const first = Temporal.Now.plainDateISO("Europe/Prague").add({ days: 14 });
	const organizer = await accountsPage(browser);
	const { share, admin } = await createEvent(organizer, "Výroční schůze", first);

	// A visitor joins; without JavaScript the server's first response shows them joined.
	const visitor = await accountsPage(browser);

	await joinIn(visitor, share, "Jana");

	const scriptless = await browser.newContext({
		javaScriptEnabled: false,
		storageState: await visitor.context().storageState(),
	});

	const reloaded = await scriptless.newPage();

	await reloaded.goto(share);
	await expect(reloaded.getByText("Vyplňujete jako Jana")).toBeVisible();
	await expect(reloaded.getByRole("table")).toBeVisible();
	await scriptless.close();

	// The organizer signs in, adds the event to the account and keeps it.
	await signIn(organizer, uniqueAddress("organizer"));
	await organizer
		.getByRole("region", { name: "Events in this browser" })
		.getByRole("button", { name: "Add to account" })
		.click();
	await organizer
		.getByRole("region", { name: "Events I organize" })
		.getByRole("link", { name: "Manage" })
		.click();

	const keep = organizer.getByRole("button", { name: "Keep without a time limit" });

	await keep.click();
	await expect(keep).toHaveAttribute("aria-pressed", "true");
	await organizer.getByRole("link", { name: "Open the event" }).click();
	await expect(organizer.getByText("the organizer keeps the event")).toBeVisible();

	// A second visitor signs in, turns on final-time emails and joins as the account.
	const address = uniqueAddress("participant");
	const participant = await accountsPage(browser);

	await signIn(participant, address);
	await participant.getByLabel(/The final time of the events I joined/u).check();
	await participant.getByRole("button", { name: "Save emails" }).click();
	await expect(participant.getByText("Your choice of emails is saved.")).toBeVisible();
	await joinIn(participant, share, "Petr");

	// The organizer picks 17:00 to 18:00 on the first day.
	await organizer.goto(admin);
	await cell(organizer, first, "17:00").click();
	await cell(organizer, first, "17:30").click();

	const picker = organizer.getByRole("region", { name: "Konečný čas" });

	await picker.getByRole("button", { name: "Vybrat jako konečný čas" }).click();
	await expect(picker.getByText(/^Konečný čas je .*17:00–18:00\.$/u)).toBeVisible();

	// The calendar file of the email holds the window in UTC.
	const email = await emailTo(address, "The final time of Výroční schůze");
	const calendar = email.Attachments.find((attachment) => attachment.FileName.endsWith(".ics"));

	expect(calendar).toBeDefined();

	const file = (await attachmentText(email.ID, calendar?.PartID ?? "")).replaceAll("\r\n ", "");

	const utc = (time: string) =>
		first
			.toZonedDateTime({ timeZone: "Europe/Prague", plainTime: time })
			.toInstant()
			.toString()
			.replaceAll(/[-:]/gu, "");

	expect(file).toContain(`DTSTART:${utc("17:00")}`);
	expect(file).toContain(`DTEND:${utc("18:00")}`);

	await organizer.context().close();
	await visitor.context().close();
	await participant.context().close();
});
