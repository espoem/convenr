import { auth } from "@/server/auth";

// Better Auth's routes (ADR 0009 item 6). They answer not found while accounts are off.
async function handle(request: Request): Promise<Response> {
	const instance = auth();

	if (instance === undefined) {
		return new Response(null, { status: 404 });
	}

	const answer = await instance.handler(request);
	// A redirect's headers cannot change, so the answer is copied first.
	const response = new Response(answer.body, answer);

	// Sign-in links and sessions are secrets; no cache keeps an answer about them.
	response.headers.set("Cache-Control", "no-store");

	return response;
}

export { handle as GET, handle as POST };
