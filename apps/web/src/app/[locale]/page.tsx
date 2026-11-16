import { useTranslations } from "next-intl";

import { LocaleSwitch } from "@/components/locale-switch";

export default function StartPage() {
  const t = useTranslations("Start");
  return (
    <main>
      <LocaleSwitch />
      <h1>{t("heading")}</h1>
      <p>{t("lead")}</p>
      <p>{t("status")}</p>
    </main>
  );
}
