// Starts a sign-in at a provider, or adds one to the account. The answer is a page that forwards,
// not a redirect: the Content Security Policy lets a form reach this site only, and browsers hold
// a redirect to it as well.
import { createTranslator } from "next-intl";
import { headers } from "next/headers";
import { z } from "zod";

import { type Provider, PROVIDER_NAMES, providerSchema } from "@/domain/provider-address";
import { env } from "@/env";
import { catalog } from "@/i18n/catalogs";
import { type Locale, localeSchema } from "@/i18n/routing";
import { accountProviders } from "@/server/account-providers";
import { type Auth, auth } from "@/server/auth";
import { offeredProviders, PROVIDER_PURPOSES } from "@/server/providers";
import { currentVisitor, isFresh } from "@/server/session";

const formSchema = z.object({ provider: providerSchema, purpose: z.enum(PROVIDER_PURPOSES) });

type Form = z.infer<typeof formSchema>;

function escapeHtml(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

async function forwardingPage(locale: Locale, provider: Provider, url: string): Promise<Response> {
	const t = createTranslator({
		locale,
		messages: await catalog(locale),
		namespace: "SignIn.forward",
	});

	const text = escapeHtml(t("link", { provider: PROVIDER_NAMES[provider] }));
	const href = escapeHtml(url);

	return new Response(
		`<!doctype html>
<html lang="${locale}">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<title>${text}</title>
<p><a href="${href}">${text}</a></p>
</html>
`,
		{
			headers: {
				"Content-Type": "text/html; charset=utf-8",
				"Cache-Control": "no-store",
				Refresh: `0; url=${url}`,
			},
		},
	);
}

/** The page that says why a provider cannot be added now, or nothing when it can. */
async function refusal(provider: Provider): Promise<string | undefined> {
	const visitor = await currentVisitor();

	if (visitor.kind !== "signed_in") {
		return "/sign-in";
	}

	if (!isFresh(visitor)) {
		return "/account?problem=sign_in_again";
	}

	const added = await accountProviders(visitor.accountId);

	return added.some((each) => each.provider === provider) ? "/account" : undefined;
}

/** The provider's address where the visitor continues; the state's cookie goes with the answer. */
async function providerUrl(
	instance: Auth,
	locale: Locale,
	{ provider, purpose }: Form,
): Promise<string | undefined> {
	if (purpose === "add") {
		const { url } = await instance.api.linkSocialAccount({
			body: {
				provider,
				callbackURL: `/${locale}/account?done=provider`,
				errorCallbackURL: `/${locale}/account`,
				disableRedirect: true,
			},
			headers: await headers(),
		});

		return url;
	}

	const { url } = await instance.api.signInSocial({
		body: {
			provider,
			callbackURL: `/${locale}/account`,
			errorCallbackURL: `/${locale}/sign-in`,
			disableRedirect: true,
		},
	});

	return url;
}

export async function POST(
	request: Request,
	context: RouteContext<"/[locale]/sign-in/provider">,
): Promise<Response> {
	const { accounts } = env();
	const instance = auth();

	if (accounts.kind === "off" || instance === undefined) {
		return new Response(null, { status: 404 });
	}

	// Another site must not start a sign-in in the visitor's browser.
	if (request.headers.get("origin") !== accounts.publicUrl.origin) {
		return new Response(null, { status: 403 });
	}

	const { locale: segment } = await context.params;
	const locale = localeSchema.parse(segment);
	const form = formSchema.safeParse(Object.fromEntries(await request.formData()));

	if (!form.success || !offeredProviders().includes(form.data.provider)) {
		return new Response(null, { status: 404 });
	}

	const page = form.data.purpose === "add" ? await refusal(form.data.provider) : undefined;

	if (page !== undefined) {
		return new Response(null, { status: 303, headers: { Location: `/${locale}${page}` } });
	}

	const url = await providerUrl(instance, locale, form.data);

	return url === undefined
		? new Response(null, { status: 502 })
		: forwardingPage(locale, form.data.provider, url);
}
