import { eslintCompatPlugin } from "@oxlint/plugins";

import { noSpecReferencesRule } from "./no-spec-references.ts";

/** Rules for this repository that no general plugin covers. */
const convenrPlugin = eslintCompatPlugin({
	meta: { name: "convenr" },
	rules: { "no-spec-references": noSpecReferencesRule },
});

export default convenrPlugin;
