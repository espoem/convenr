// The address a provider named for a sign-in that an email link has to finish. It waits in a
// short-lived cookie of the browser that signed in, so it is in no address and no log.
import { cookies } from "next/headers";
import { z } from "zod";

import type { ProviderAddress } from "@/domain/provider-address";

const NAME = "convenr.confirm-address";

const LIFETIME_SECONDS = 10 * 60;

/** What Better Auth's callback reports when nobody is signed in because of the address. */
const CONFIRM_ERRORS = new Set(["address_not_proved", "account_not_linked"]);

/** Whether a sign-in through a provider can be finished by confirming the address. */
export function asksToConfirm(error: string): boolean {
	return CONFIRM_ERRORS.has(error);
}

export async function keepAddressToConfirm(
	address: ProviderAddress,
	secure: boolean,
): Promise<void> {
	const store = await cookies();

	if (address.kind === "missing") {
		store.delete(NAME);
	} else {
		store.set(NAME, address.email, {
			httpOnly: true,
			sameSite: "lax",
			secure,
			path: "/",
			maxAge: LIFETIME_SECONDS,
		});
	}
}

/** The address to fill in, or an empty one. */
export async function addressToConfirm(): Promise<string> {
	const store = await cookies();

	return z.email().safeParse(store.get(NAME)?.value).data ?? "";
}

export async function forgetAddressToConfirm(): Promise<void> {
	const store = await cookies();

	store.delete(NAME);
}
