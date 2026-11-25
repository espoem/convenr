import { PROVIDER_MARKS } from "@/components/provider-mark";
import { Button } from "@/components/ui/button";
import type { Provider } from "@/domain/provider-address";
import type { Locale } from "@/i18n/routing";

/**
 * Starts a sign-in at a provider. A plain form, so it works without scripts; the page it posts to
 * forwards to the provider.
 */
export function ProviderButton({
	provider,
	locale,
	label,
}: {
	provider: Provider;
	locale: Locale;
	label: string;
}) {
	const Mark = PROVIDER_MARKS[provider];

	return (
		<form method="post" action={`/${locale}/sign-in/provider`}>
			<input type="hidden" name="provider" value={provider} />
			<Button type="submit" variant="outline" className="w-full sm:w-fit">
				<Mark />
				{label}
			</Button>
		</form>
	);
}
