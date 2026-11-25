import { env } from "@/env";
import { auth } from "@/server/auth";
import { asksToConfirm, keepAddressToConfirm } from "@/server/confirm-address";
import { withProviderAddress } from "@/server/providers";

/** The error a redirect of Better Auth's callback names, or an empty one. */
function errorOf(answer: Response, origin: string): string {
	const location = answer.headers.get("location");

	return location === null ? "" : (new URL(location, origin).searchParams.get("error") ?? "");
}

// Better Auth's routes (ADR 0009 item 6). They answer not found while accounts are off.
async function handle(request: Request): Promise<Response> {
	const { accounts } = env();
	const instance = auth();

	if (accounts.kind === "off" || instance === undefined) {
		return new Response(null, { status: 404 });
	}

	const { result: answer, address } = await withProviderAddress(() => instance.handler(request));
	const { origin, protocol } = accounts.publicUrl;

	if (asksToConfirm(errorOf(answer, origin))) {
		await keepAddressToConfirm(address, protocol === "https:");
	}

	// A redirect's headers cannot change, so the answer is copied first.
	const response = new Response(answer.body, answer);

	// Sign-in links and sessions are secrets; no cache keeps an answer about them.
	response.headers.set("Cache-Control", "no-store");

	return response;
}

export { handle as GET, handle as POST };
