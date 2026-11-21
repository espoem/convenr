// The family of a browser, such as Firefox on Android, read from its user agent. A session
// keeps only this, never the full user agent, which can tell one device from another.

const BROWSERS: [RegExp, string][] = [
	[/\bEdg(?:e|A|iOS)?\//u, "Edge"],
	[/\b(?:OPR|Opera)\//u, "Opera"],
	[/\bSamsungBrowser\//u, "Samsung Internet"],
	[/\b(?:Firefox|FxiOS)\//u, "Firefox"],
	[/\b(?:Chrome|CriOS|Chromium)\//u, "Chrome"],
	[/\bSafari\//u, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
	[/\bAndroid\b/u, "Android"],
	[/\b(?:iPhone|iPad|iPod)\b/u, "iOS"],
	[/\bMac OS X\b|\bMacintosh\b/u, "macOS"],
	[/\bWindows\b/u, "Windows"],
	[/\bCrOS\b/u, "ChromeOS"],
	[/\bLinux\b/u, "Linux"],
];

function firstMatch(text: string, patterns: [RegExp, string][]): string | undefined {
	return patterns.find(([pattern]) => pattern.test(text))?.[1];
}

/** "Firefox, Android", which reads in any language; one of the two alone; or `null`. */
export function browserFamily(userAgent: string | null | undefined): string | null {
	if (userAgent === null || userAgent === undefined) {
		return null;
	}

	const browser = firstMatch(userAgent, BROWSERS);
	const system = firstMatch(userAgent, SYSTEMS);

	if (browser !== undefined && system !== undefined) {
		return `${browser}, ${system}`;
	}

	return browser ?? system ?? null;
}
