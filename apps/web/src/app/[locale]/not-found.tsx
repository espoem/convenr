import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("NotFound");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center gap-4 px-4 sm:px-6">
      <h1 className="text-3xl">{t("heading")}</h1>
      <Link href="/" className="text-action underline underline-offset-4">
        {t("back")}
      </Link>
    </main>
  );
}
