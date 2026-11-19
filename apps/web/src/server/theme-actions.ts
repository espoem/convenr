"use server";
// Keeps the theme choice in a cookie so the server renders the chosen theme and the page does
// not flash. The menu posts a plain form, so the choice works without JavaScript.

import { cookies } from "next/headers";

import { THEME_COOKIE, themeSchema } from "@/lib/theme";

const YEAR_SECONDS = 365 * 24 * 60 * 60;

export async function chooseThemeAction(form: FormData): Promise<void> {
	const theme = themeSchema.catch("system").parse(form.get("theme"));

	const store = await cookies();

	if (theme === "system") {
		store.delete(THEME_COOKIE);

		return;
	}

	// Not Secure: the value is no secret, and a self-hosted instance may run over plain HTTP.
	store.set(THEME_COOKIE, theme, {
		path: "/",
		maxAge: YEAR_SECONDS,
		httpOnly: true,
		sameSite: "lax",
	});
}
