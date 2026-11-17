"use client";

import { useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { controlClass, Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { changePasswordAction, joinAction, leaveAction } from "@/server/participant-actions";

export type Joined = { name: string; token: string; hasPassword: boolean };

type JoinBandProps = {
  eventId: string;
  joined: Joined | null;
  onJoined: (name: string, token: string, hasPassword: boolean) => void;
  /** The browser forgets its token; with `left` the participant was also deleted (P9). */
  onForget: (left: boolean) => void;
  onPasswordChange: (hasPassword: boolean) => void;
  /** A lockout's end, formatted for the page (P7). */
  formatTime: (instant: string) => string;
};

type Problem = { key: string; time?: string };

function strong(text: ReactNode) {
  return <strong>{text}</strong>;
}

/** Spec rules P4 to P9. Above the tabs; one line once the browser holds a token (I1). */
export function JoinBand(props: JoinBandProps) {
  return (
    <section
      aria-labelledby="join"
      className="-mx-4 border-y border-line bg-surface px-4 py-5 sm:-mx-6 sm:px-6"
    >
      {props.joined === null ? (
        <JoinForm {...props} />
      ) : (
        <JoinedLine {...props} joined={props.joined} />
      )}
    </section>
  );
}

function JoinForm({ eventId, onJoined, formatTime }: JoinBandProps) {
  const t = useTranslations("Join");
  const id = useId();
  const password = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "");
    const given = String(form.get("password") ?? "");

    startTransition(async () => {
      try {
        const joined = await joinAction(eventId, name, given === "" ? null : given);

        if (joined.ok) {
          setProblem(null);
          onJoined(joined.name, joined.token, given !== "");

          return;
        }

        if (joined.problem === "password-required" || joined.problem === "wrong-password") {
          password.current?.focus();
        }

        setProblem(
          joined.problem === "locked"
            ? { key: "locked", time: formatTime(joined.retryAt) }
            : { key: joined.problem },
        );
      } catch {
        setProblem({ key: "failed" });
      }
    });
  }

  const nameProblem = problem?.key === "invalid-name" || problem?.key === "full";
  const passwordProblem = problem !== null && !nameProblem && problem.key !== "failed";

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <h2 id="join" className="text-xl">
        {t("heading")}
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        <Field id={`${id}-name`} label={t("name")} className="flex-[2_1_14rem]">
          <input
            id={`${id}-name`}
            name="name"
            autoComplete="name"
            required
            aria-invalid={nameProblem || undefined}
            aria-describedby={`${id}-problem`}
            className={controlClass}
          />
        </Field>
        <Field id={`${id}-password`} label={t("password")} className="flex-[2_1_14rem]">
          <input
            ref={password}
            id={`${id}-password`}
            name="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={passwordProblem || undefined}
            aria-describedby={`${id}-problem`}
            className={controlClass}
          />
        </Field>
        <Button type="submit" disabled={pending} className="flex-[1_1_8rem]">
          {t("submit")}
        </Button>
      </div>
      <p
        id={`${id}-problem`}
        aria-live="polite"
        className="text-sm font-semibold text-action-active"
      >
        {problem === null ? "" : t(`problem.${problem.key}`, { time: problem.time ?? "" })}
      </p>
      <p className="max-w-[65ch] text-sm text-ink-muted">{t("note")}</p>
    </form>
  );
}

function JoinedLine({
  eventId,
  joined,
  onForget,
  onPasswordChange,
  formatTime,
}: JoinBandProps & { joined: Joined }) {
  const t = useTranslations("Join");
  const id = useId();
  const [panel, setPanel] = useState<"none" | "password" | "leave">("none");
  const [message, setMessage] = useState<{ text: string; problem: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function changePassword(fields: HTMLFormElement, remove: boolean) {
    const form = new FormData(fields);
    const current = String(form.get("current") ?? "");
    const next = String(form.get("next") ?? "");

    startTransition(async () => {
      try {
        const changed = await changePasswordAction(
          eventId,
          joined.token,
          current === "" ? null : current,
          remove || next === "" ? null : next,
        );

        if (changed.ok) {
          onPasswordChange(!remove && next !== "");
          setPanel("none");
          setMessage({ text: t(remove ? "passwordRemoved" : "passwordSaved"), problem: false });

          return;
        }

        const key = changed.problem === "locked" ? "locked" : changed.problem;

        setMessage({
          text: t(`problem.${key}`, {
            time: "retryAt" in changed ? formatTime(changed.retryAt) : "",
          }),
          problem: true,
        });
      } catch {
        setMessage({ text: t("problem.failed"), problem: true });
      }
    });
  }

  function leave() {
    startTransition(async () => {
      try {
        const left = await leaveAction(eventId, joined.token);

        onForget(left.ok);
      } catch {
        setMessage({ text: t("problem.failed"), problem: true });
      }
    });
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h2 id="join" className="font-sans text-base font-normal tracking-normal">
          {t.rich("joinedAs", { name: joined.name, strong })}
        </h2>
        <div className="flex flex-wrap gap-x-4">
          <button
            type="button"
            onClick={() => onForget(false)}
            className="min-h-11 text-action underline underline-offset-4"
          >
            {t("notYou", { name: joined.name })}
          </button>
          <button
            type="button"
            aria-expanded={panel === "password"}
            aria-controls={`${id}-panel`}
            onClick={() => setPanel(panel === "password" ? "none" : "password")}
            className="min-h-11 text-action underline underline-offset-4"
          >
            {joined.hasPassword ? t("changePassword") : t("setPassword")}
          </button>
          <button
            type="button"
            aria-expanded={panel === "leave"}
            aria-controls={`${id}-panel`}
            onClick={() => setPanel(panel === "leave" ? "none" : "leave")}
            className="min-h-11 text-action underline underline-offset-4"
          >
            {t("leave")}
          </button>
        </div>
      </div>

      <div id={`${id}-panel`}>
        {panel === "password" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              changePassword(event.currentTarget, false);
            }}
            className="mt-3 flex flex-wrap items-start gap-3"
          >
            {joined.hasPassword ? (
              <Field id={`${id}-current`} label={t("currentPassword")} className="flex-[1_1_12rem]">
                <input
                  id={`${id}-current`}
                  name="current"
                  type="password"
                  autoComplete="current-password"
                  className={controlClass}
                />
              </Field>
            ) : null}
            <Field
              id={`${id}-next`}
              label={t("newPassword")}
              hint={t("passwordHint")}
              className="flex-[1_1_12rem]"
            >
              <input
                id={`${id}-next`}
                name="next"
                type="password"
                autoComplete="new-password"
                aria-describedby={`${id}-next-message`}
                className={controlClass}
              />
            </Field>
            <div className="flex basis-full flex-wrap gap-2">
              <Button type="submit" variant="outline" disabled={pending}>
                {t("savePassword")}
              </Button>
              {joined.hasPassword ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending}
                  onClick={(event) => {
                    const form = event.currentTarget.form;

                    if (form !== null) {
                      changePassword(form, true);
                    }
                  }}
                >
                  {t("removePassword")}
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}

        {panel === "leave" ? (
          <div role="alert" className="mt-3 flex max-w-[65ch] flex-col gap-3">
            <p>{t("leaveConfirm", { name: joined.name })}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="destructive" disabled={pending} onClick={leave}>
                {t("leaveYes")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setPanel("none")}>
                {t("leaveNo")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <p
        aria-live="polite"
        className={cn(
          "text-sm empty:mt-0 mt-2",
          message?.problem === true && "font-semibold text-action-active",
        )}
      >
        {message?.text ?? ""}
      </p>
    </div>
  );
}
