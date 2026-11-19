import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";

import { routing } from "./i18n/routing";

const localize = createMiddleware(routing);

/** The policy of ADR 0003 item 9: scripts only with this request's nonce, nothing from another host. */
function contentSecurityPolicy(nonce: string): string {
	const development = process.env.NODE_ENV === "development";

	return [
		"default-src 'self'",
		`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
		// React sets style attributes for positioning; they cannot carry a nonce.
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data:",
		"font-src 'self'",
		"connect-src 'self'",
		"object-src 'none'",
		"base-uri 'none'",
		"form-action 'self'",
		"frame-ancestors 'none'",
	].join("; ");
}

export default function proxy(request: NextRequest) {
	const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
	const policy = contentSecurityPolicy(nonce);

	// Next.js reads the nonce from the request's policy header and puts it on its scripts.
	request.headers.set("Content-Security-Policy", policy);

	const response = localize(request);

	response.headers.set("Content-Security-Policy", policy);
	// Other sites never learn an event's address; convenr's own forms keep their origin, which a
	// Server Action posted without JavaScript needs (ADR 0007).
	response.headers.set("Referrer-Policy", "same-origin");
	response.headers.set("X-Content-Type-Options", "nosniff");

	return response;
}

export const config = {
	// Every path except API routes, Next.js internals and files with an extension.
	matcher: "/((?!api|_next|.*\\..*).*)",
};
