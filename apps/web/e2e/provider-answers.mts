// Loaded into the main end-to-end server before it starts: answers its requests to Google and
// GitHub, so a sign-in runs the app's real code without the network. The code a test returns to
// the callback names the person, and the tokens repeat it.
import { z } from "zod";

const personSchema = z.object({ id: z.string(), email: z.string(), verified: z.boolean() });

function personOf(code: string) {
	return personSchema.parse(JSON.parse(Buffer.from(code, "base64url").toString()));
}

function base64url(json: string): string {
	return Buffer.from(json).toString("base64url");
}

/** The token request's code, which Better Auth sends as a form. */
async function codeIn(request: Request): Promise<string> {
	return new URLSearchParams(await request.text()).get("code") ?? "";
}

function bearerOf(request: Request): string {
	return (request.headers.get("authorization") ?? "").replace("Bearer ", "");
}

async function googleToken(request: Request): Promise<Response> {
	const code = await codeIn(request);
	const { id, email, verified } = personOf(code);
	const claims = { sub: id, email, email_verified: verified, name: "Jana Nováková" };

	return Response.json({
		access_token: code,
		id_token: `${base64url('{"alg":"none"}')}.${base64url(JSON.stringify(claims))}.`,
		expires_in: 3600,
		token_type: "Bearer",
	});
}

async function githubToken(request: Request): Promise<Response> {
	return Response.json({ access_token: await codeIn(request), token_type: "bearer" });
}

const passOn = globalThis.fetch;

async function answer(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const request = new Request(input, init);
	const url = new URL(request.url);

	switch (url.host + url.pathname) {
		case "oauth2.googleapis.com/token":
			return googleToken(request);
		case "github.com/login/oauth/access_token":
			return githubToken(request);
		case "api.github.com/user":
			return Response.json({ id: Number(personOf(bearerOf(request)).id), name: "Jana" });
		case "api.github.com/user/emails": {
			const { email, verified } = personOf(bearerOf(request));

			return Response.json([{ email, primary: true, verified }]);
		}

		default:
			return passOn(input, init);
	}
}

globalThis.fetch = answer;
