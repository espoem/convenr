import { z } from "zod";

/** The theme a visitor picks. "system" follows the device and is never stored. */
export const themeSchema = z.enum(["system", "light", "dark"]);

export type Theme = z.infer<typeof themeSchema>;

/** The first-party cookie that holds only the visitor's theme choice. */
export const THEME_COOKIE = "theme";
