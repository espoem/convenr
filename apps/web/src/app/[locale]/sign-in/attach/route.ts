// Where a sign-in link from the confirm page returns: it adds the provider this browser signed in
// with to the account the link signed in to, then shows the account page.
import { localeSchema } from "@/i18n/routing";
import { attachPendingProvider } from "@/server/attach-provider";
import { noticeProvider } from "@/server/auth";
import { followsLink, forgetPendingSignIn, pendingSignIn } from "@/server/pending-sign-in";
import { offeredProviders } from "@/server/providers";
import { currentVisitor } from "@/server/session";

function toAccount(locale: string, query = ""): Response {
	return new Response(null, {
		status: 303,
		headers: { Location: `/${locale}/account${query}`, "Cache-Control": "no-store" },
	});
}

export async function GET(
	request: Request,
	context: RouteContext<"/[locale]/sign-in/attach">,
): Promise<Response> {
	const locale = localeSchema.parse((await context.params).locale);
	const visitor = await currentVisitor();

	if (visitor.kind === "accounts_off") {
		return new Response(null, { status: 404 });
	}

	const pending = await pendingSignIn();
	const key = new URL(request.url).searchParams.get("key") ?? "";

	// Only the link that was sent finishes the sign-in, so a visit from anywhere else leaves it.
	if (visitor.kind !== "signed_in" || pending === undefined || !followsLink(pending, key)) {
		return toAccount(locale);
	}

	// The pending sign-in is used once, whatever happens next.
	await forgetPendingSignIn();

	if (!offeredProviders().includes(pending.provider)) {
		return toAccount(locale);
	}

	const outcome = await attachPendingProvider(pending, visitor);

	switch (outcome.kind) {
		case "attached":
			await noticeProvider(visitor.accountId, pending.provider);

			return toAccount(locale, "?done=provider");
		case "in_other_account":
			return toAccount(locale, "?problem=provider_in_other_account");
		case "skipped":
			return toAccount(locale);
	}
}
