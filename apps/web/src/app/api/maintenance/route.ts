// A schedule outside the server starts the maintenance pass here (ADR 0010). The route exists
// only on an instance that sets `MAINTENANCE_SECRET`, and answers nothing but the count.
import { env } from "@/env";
import { problem, unauthorized } from "@/server/api/http";
import { maintain } from "@/server/maintain";
import { hashSecret, matchesSecret } from "@/server/secrets";

// The pass deletes and counts in a few statements; a minute leaves room for a slow database.
export const maxDuration = 60;

export async function POST(request: Request) {
	const secret = env().MAINTENANCE_SECRET;

	if (secret === undefined) {
		return problem("not_found");
	}

	const given = /^Bearer +(\S+) *$/iu.exec(request.headers.get("authorization") ?? "")?.[1];

	if (given === undefined || !matchesSecret(hashSecret(secret), given)) {
		return unauthorized();
	}

	return Response.json(await maintain());
}
