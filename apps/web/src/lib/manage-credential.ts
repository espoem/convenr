import { z } from "zod";

/**
 * What the manage page sends to prove it may manage the event: the admin secret from the link or
 * from local storage, or nothing but the session of the account that owns the event.
 */
export const manageCredentialSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("secret"), secret: z.string().max(128) }),
	z.object({ kind: z.literal("owner") }),
]);

export type ManageCredential = z.infer<typeof manageCredentialSchema>;
