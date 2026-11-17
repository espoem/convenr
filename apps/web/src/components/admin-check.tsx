"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { updateLocalEvent } from "@/lib/local-events";
import { checkAdminAction } from "@/server/event-actions";

type AdminCheckProps = { id: string; name: string; segment: string };

/**
 * Reads the admin secret from the address fragment, which never reaches the server in the
 * address (ADR 0003 item 2), and confirms it in a request body.
 */
export function AdminCheck({ id, name, segment }: AdminCheckProps) {
  const t = useTranslations("Manage");
  const [state, setState] = useState<"checking" | "valid" | "invalid">("checking");

  useEffect(() => {
    const secret = window.location.hash.slice(1);
    let current = true;

    void checkAdminAction(id, secret).then((valid) => {
      if (!current) {
        return;
      }

      setState(valid ? "valid" : "invalid");

      if (valid) {
        updateLocalEvent(id, (stored) => ({ ...stored, id, name, segment, adminSecret: secret }));
      }
    });

    return () => {
      current = false;
    };
  }, [id, name, segment]);

  return (
    <p aria-live="polite" className="max-w-[65ch] text-lg">
      {t(state)}
    </p>
  );
}
