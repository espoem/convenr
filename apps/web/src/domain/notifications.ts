// The notifications an account can turn on, and what an email of the outbox is about.

/** New responses to an event the account owns, the final time where it joined, a reminder. */
export const NOTIFICATION_KINDS = ["responses", "final", "reminder"] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** What an account chose for one event: as on the account page, or on or off for this event. */
export type EventChoice = "account" | "on" | "off";

/** A final time as an email names it; instants travel as text because the outbox stores JSON. */
export type StoredFinal =
	| { kind: "open"; sequence: number }
	| { kind: "chosen"; start: string; end: string; sequence: number };

/**
 * What an email of the outbox says. A final-time email or a reminder names the final time it was
 * written for, so one that a later change overtook is not sent.
 */
export type OutboxMessage =
	| { kind: "responses"; names: string[] }
	| { kind: "final"; final: StoredFinal }
	| { kind: "reminder"; final: Extract<StoredFinal, { kind: "chosen" }> };

/** Attempts after the first one wait this long, so five attempts span more than a day. */
export const RETRY_DELAYS_MINUTES = [15, 60, 6 * 60, 24 * 60] as const;

/** All attempts of one email: the first and one after each delay. */
export const MAX_ATTEMPTS = RETRY_DELAYS_MINUTES.length + 1;
