import { defineRule, type ESTree } from "@oxlint/plugins";

/**
 * Words that point into numbered project docs: a phase name, a rule id or number, or a numbered
 * part of the spec. ADRs are not matched: an accepted ADR does not change.
 */
const SPEC_REFERENCE =
	/\b[Pp]hase \d\b|\b[A-Z]\d{1,2}\b|\b[Rr]ules? \d+\b|\b[Ss]pec(?:ification)? (?:rule|section|\d+)\b/u;

/** A problem code that starts with a rule id: a capital letter, one or two digits, then a dot or underscore. */
const RULE_ID_CODE = /^[A-Z]\d{1,2}[._]/u;

const TEST_FUNCTIONS = new Set(["describe", "it", "test"]);

/** The name of the test function a call starts with, such as `it` in `it.each(…)(…)`. */
function testFunctionName(callee: ESTree.Node): string | undefined {
	if (callee.type === "Identifier") {
		return callee.name;
	}

	if (callee.type === "MemberExpression") {
		return testFunctionName(callee.object);
	}

	return callee.type === "CallExpression" ? testFunctionName(callee.callee) : undefined;
}

/** Keep code free of spec numbering, which goes stale when the spec is renumbered. */
export const noSpecReferencesRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Disallow phase names, rule ids and spec sections in comments, test titles and codes.",
		},
		messages: {
			reference:
				"Say why the code exists instead of citing the spec. The spec maps its rules to code and tests.",
			code: "Name the problem by what went wrong, such as `no_days`, not by the rule id.",
		},
	},
	createOnce(context) {
		return {
			Program() {
				for (const comment of context.sourceCode.getAllComments()) {
					if (SPEC_REFERENCE.test(comment.value)) {
						context.report({ loc: comment.loc, messageId: "reference" });
					}
				}
			},
			Literal(node) {
				// Numbers, booleans, null and regular expressions never print as a letter and a digit.
				if (RULE_ID_CODE.test(String(node.value))) {
					context.report({ node, messageId: "code" });
				}
			},
			CallExpression(node) {
				const name = testFunctionName(node.callee);
				const [title] = node.arguments;

				if (name === undefined || !TEST_FUNCTIONS.has(name) || title?.type !== "Literal") {
					return;
				}

				if (SPEC_REFERENCE.test(String(title.value))) {
					context.report({ node: title, messageId: "reference" });
				}
			},
		};
	},
});
