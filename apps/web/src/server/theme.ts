import { cookies } from "next/headers";

import { THEME_COOKIE, type Theme, themeSchema } from "@/lib/theme";

/** The visitor's stored theme choice; a missing or unknown cookie means the device decides. */
export async function readTheme(): Promise<Theme> {
	return themeSchema.catch("system").parse((await cookies()).get(THEME_COOKIE)?.value);
}
