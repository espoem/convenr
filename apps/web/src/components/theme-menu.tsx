import { CheckIcon, CircleHalfIcon, MoonIcon, SunIcon } from "@phosphor-icons/react/ssr";
import { getTranslations } from "next-intl/server";

import { HeaderMenu, MENU_ENTRY } from "@/components/header-menu";
import { type Theme, themeSchema } from "@/lib/theme";
import { readTheme } from "@/server/theme";
import { chooseThemeAction } from "@/server/theme-actions";

const ICONS = { system: CircleHalfIcon, light: SunIcon, dark: MoonIcon } as const;

/** The theme menu: System, Light and Dark, kept in a cookie by a plain form. */
export async function ThemeMenu() {
	const t = await getTranslations("ThemeMenu");

	const current = await readTheme();

	const CurrentIcon = ICONS[current];

	return (
		<HeaderMenu
			label={t("button", { theme: t(current) })}
			button={<CurrentIcon aria-hidden className="size-5" />}
		>
			<form action={chooseThemeAction} className="contents">
				{themeSchema.options.map((theme: Theme) => {
					const Icon = ICONS[theme];

					return (
						<button
							key={theme}
							type="submit"
							name="theme"
							value={theme}
							aria-current={theme === current ? "true" : undefined}
							className={MENU_ENTRY}
						>
							<Icon aria-hidden className="size-5" />
							<span className="flex-1">{t(theme)}</span>
							{theme === current ? <CheckIcon aria-hidden className="size-4" /> : null}
						</button>
					);
				})}
			</form>
		</HeaderMenu>
	);
}
