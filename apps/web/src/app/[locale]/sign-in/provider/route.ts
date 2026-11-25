// Starts a sign-in at a provider. The answer is a page that forwards, not a redirect: the Content
// Security Policy lets a form reach this site only, and browsers hold a redirect to it as well.
import { createTranslator } from "next-intl";
import { z } from "zod";

import { PROVIDER_NAMES, PROVIDERS, type Provider } from "@/domain/provider-address";
import { env } from "@/env";
import { catalog } from "@/i18n/catalogs";
import { type Locale, localeSchema } from "@/i18n/routing";
import { type Auth, auth } from "@/server/auth";

const formSchema = z.object({ provider: z.enum(PROVIDERS) });

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

/** The provider's address where the sign-in continues; the state's cookie goes with the answer. */
async function signInUrl(
	instance: Auth,
	locale: Locale,
	provider: Provider,
): Promise<string | undefined> {
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

	if (
		!form.success ||
		!accounts.providers.some(({ provider }) => provider === form.data.provider)
	) {
		return new Response(null, { status: 404 });
	}

	const { provider } = form.data;
	const url = await signInUrl(instance, locale, provider);

	return url === undefined
		? new Response(null, { status: 502 })
		: forwardingPage(locale, provider, url);
}
