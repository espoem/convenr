"use client";

import { useEffect, useState } from "react";
import { z } from "zod/mini";

import { PROVIDER_MARKS } from "@/components/provider-mark";
import { Button } from "@/components/ui/button";
import type { Provider } from "@/domain/provider-address";
import type { Locale } from "@/i18n/routing";
import type { ProviderPurpose } from "@/server/providers";

// Strict CSP forbids `new Function`, which Zod's JIT compiler otherwise probes (ADR 0003).
z.config({ jitless: true });

function isAllowedTarget(url: string): boolean {
	if (url.startsWith("/") && !url.startsWith("//")) {
		return true;
	}

	try {
		return new URL(url).protocol === "https:";
	} catch {
		return false;
	}
}

const targetSchema = z.object({ url: z.string().check(z.refine(isAllowedTarget)) });

/**
 * Signs in through a provider, or adds it to the account. With scripts, it posts in the
 * background and goes straight to the returned address so no intermediate page flashes; without
 * scripts, the plain form falls back to the forwarding page.
 */
export function ProviderButton({
	provider,
	purpose,
	locale,
	label,
	fullWidth = false,
}: {
	provider: Provider;
	purpose: ProviderPurpose;
	locale: Locale;
	label: string;
	fullWidth?: boolean;
}) {
	const Mark = PROVIDER_MARKS[provider];
	const [pending, setPending] = useState(false);

	useEffect(() => {
		// Re-enable the button when returning from a provider through the browser history cache.
		const reset = () => {
			setPending(false);
		};

		globalThis.addEventListener("pageshow", reset);

		return () => {
			globalThis.removeEventListener("pageshow", reset);
		};
	}, []);

	async function start(form: HTMLFormElement) {
		if (pending) {
			return;
		}

		setPending(true);

		try {
			const response = await fetch(form.action, {
				method: "POST",
				body: new FormData(form),
				headers: { Accept: "application/json" },
			});

			if (response.ok) {
				const parsed = targetSchema.safeParse(await response.json());

				if (parsed.success) {
					globalThis.location.assign(parsed.data.url);

					return;
				}
			}
		} catch {
			// Fall through to the failure redirect below.
		}

		setPending(false);
		globalThis.location.assign(
			`/${locale}/${purpose === "add" ? "account" : "sign-in"}?problem=provider_failed`,
		);
	}

	return (
		<form
			method="post"
			action={`/${locale}/sign-in/provider`}
			onSubmit={(event) => {
				event.preventDefault();
				void start(event.currentTarget);
			}}
			className={fullWidth ? "w-full" : undefined}
		>
			<input type="hidden" name="provider" value={provider} />
			<input type="hidden" name="purpose" value={purpose} />
			<Button
				type="submit"
				variant="outline"
				disabled={pending}
				className={fullWidth ? "w-full justify-start px-3.5" : "w-full sm:w-fit"}
			>
				<Mark />
				{label}
			</Button>
		</form>
	);
}
