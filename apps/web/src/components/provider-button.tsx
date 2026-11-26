import { PROVIDER_MARKS } from "@/components/provider-mark";
import { Button } from "@/components/ui/button";
import type { Provider } from "@/domain/provider-address";
import type { Locale } from "@/i18n/routing";
import type { ProviderPurpose } from "@/server/providers";

/**
 * Signs in through a provider, or adds it to the account. A plain form, so it works without
 * scripts; the page it posts to forwards to the provider.
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

	return (
		<form
			method="post"
			action={`/${locale}/sign-in/provider`}
			className={fullWidth ? "w-full" : undefined}
		>
			<input type="hidden" name="provider" value={provider} />
			<input type="hidden" name="purpose" value={purpose} />
			<Button
				type="submit"
				variant="outline"
				className={fullWidth ? "w-full justify-start px-3.5" : "w-full sm:w-fit"}
			>
				<Mark />
				{label}
			</Button>
		</form>
	);
}
