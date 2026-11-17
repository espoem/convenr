"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { useMediaQuery } from "@/lib/use-media-query";

type SlotDetailProps = {
  heading: string;
  available: string[];
  unavailable: string[];
  /** Position beside the cell on wide screens; on narrow screens it is a bottom panel (V3). */
  x: number;
  y: number;
  onClose: () => void;
};

/** Spec rule V3: the slot's day and time, the count, and who can and cannot come. */
export function SlotDetail({ heading, available, unavailable, x, y, onClose }: SlotDetailProps) {
  const t = useTranslations("Event");
  const wide = useMediaQuery("(min-width: 40rem)");
  const total = available.length + unavailable.length;

  return (
    <aside
      aria-label={heading}
      aria-live="polite"
      style={wide ? { left: x, top: y } : undefined}
      className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-line bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-[0_-4px_16px_color-mix(in_oklch,var(--cv-ink),transparent_88%)] sm:absolute sm:right-auto sm:bottom-auto sm:w-72 sm:rounded-lg sm:border sm:pb-3 sm:shadow-[0_4px_16px_color-mix(in_oklch,var(--cv-ink),transparent_88%)]"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold tabular-nums">{heading}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("closeDetail")}
          className="-mt-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md sm:hidden"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>
      <p className="tabular-nums">{t("count", { available: available.length, total })}</p>
      <dl className="flex flex-col gap-1.5 text-sm">
        <div>
          <dt className="text-ink-muted">{t("canCome")}</dt>
          <dd>{available.length > 0 ? available.join(", ") : t("nobody")}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">{t("cannotCome")}</dt>
          <dd>{unavailable.length > 0 ? unavailable.join(", ") : t("nobody")}</dd>
        </div>
      </dl>
    </aside>
  );
}
