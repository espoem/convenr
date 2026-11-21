// The signed-in account of the current request, read through Better Auth (ADR 0009).
import { headers } from "next/headers";

import { auth } from "./auth";

/** Who signed in: accounts off, nobody, or an account with its address and session. */
export type Visitor =
	| { kind: "accounts_off" }
	| { kind: "anonymous" }
	| {
			kind: "signed_in";
			accountId: string;
			email: string;
			sessionId: string;
			sessionCreatedAt: Temporal.Instant;
	  };

/** A time from the Better Auth tables, whose adapter works in `Date` values, as an instant (ADR 0002). */
export function instantOf(time: Date): Temporal.Instant {
	return Temporal.Instant.fromEpochMilliseconds(time.getTime());
}

export async function currentVisitor(): Promise<Visitor> {
	const instance = auth();

	if (instance === undefined) {
		return { kind: "accounts_off" };
	}

	const found = await instance.api.getSession({ headers: await headers() });

	return found === null
		? { kind: "anonymous" }
		: {
				kind: "signed_in",
				accountId: found.user.id,
				email: found.user.email,
				sessionId: found.session.id,
				sessionCreatedAt: instantOf(found.session.createdAt),
			};
}
