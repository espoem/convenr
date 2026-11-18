import { describe, expect, it } from "vitest";

import { SLUG_MAX_LENGTH, slugify } from "./slug";

describe("slug", () => {
	it.each([
		["Schůzka výboru 2027", "schuzka-vyboru-2027"],
		["Straße & Ørsted", "strasse-orsted"],
		["Łódź, Đakovo", "lodz-dakovo"],
		["ﬁnále", "finale"],
		["Встреча клуба", "vstrecha-kluba"],
		["Їжак і йогурт", "yizhak-i-yogurt"],
		["Συνάντηση", "synantisi"],
		["🎉 Party!!!", "party"],
	])("transliterates %j to %j", (name, slug) => {
		expect(slugify(name)).toBe(slug);
	});

	it.each(["会议", "Porada 会议", "اجتماع", "---", ""])(
		"gives no slug for %j, which has no complete ASCII form",
		(name) => {
			expect(slugify(name)).toBe("");
		},
	);

	it("cuts a long slug without leaving a hyphen at the end", () => {
		const slug = slugify(`${"a".repeat(SLUG_MAX_LENGTH - 1)} bcd`);

		expect(slug).toBe("a".repeat(SLUG_MAX_LENGTH - 1));
	});
});
