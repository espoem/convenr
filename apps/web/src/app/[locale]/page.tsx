import { useTranslations } from "next-intl";

import { LocaleSwitch } from "@/components/locale-switch";

export default function StartPage() {
  const t = useTranslations("Start");
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-10 px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <span className="font-heading text-xl font-semibold text-action">convenr</span>
        <LocaleSwitch />
      </header>
      <main className="flex flex-col gap-4">
        <h1 className="text-3xl sm:text-4xl">{t("heading")}</h1>
        <p className="max-w-[65ch] text-lg">{t("lead")}</p>
        <p className="max-w-[65ch] text-ink-muted">{t("status")}</p>
      </main>
    </div>
  );
}
