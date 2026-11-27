import { defineRule, type ESTree } from "@oxlint/plugins";

// Disallows external asset URLs (ADR 0003): third-party scripts, fonts and stylesheets hurt privacy and Web Vitals.
const EXTERNAL_URL = /^(?:https?:)?\/\//iu;

function attributeRawValue(value: ESTree.JSXAttributeValue | null): string | undefined {
	if (value === null) {
		return undefined;
	}

	if (value.type === "Literal") {
		return value.value;
	}

	if (value.type === "JSXExpressionContainer") {
		if (value.expression.type === "Literal") {
			return String(value.expression.value);
		}

		if (value.expression.type === "TemplateLiteral") {
			return value.expression.quasis[0]?.value.raw;
		}
	}

	return undefined;
}

function isCheckedAttribute(node: ESTree.JSXAttribute): boolean {
	if (node.name.type !== "JSXIdentifier") {
		return false;
	}

	if (node.name.name === "src") {
		return true;
	}

	if (node.name.name !== "href") {
		return false;
	}

	return (
		node.parent.type === "JSXOpeningElement" &&
		node.parent.name.type === "JSXIdentifier" &&
		node.parent.name.name === "link"
	);
}

/** Keeps fonts, stylesheets, scripts and media served from this application only. */
export const noExternalAssetsRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow third-party URLs in JSX asset `src` attributes and `<link href>` tags.",
		},
		messages: {
			externalAsset: "Load assets from this application instead of an external host (ADR 0003).",
		},
	},
	createOnce(context) {
		return {
			JSXAttribute(node) {
				if (!isCheckedAttribute(node)) {
					return;
				}

				const raw = attributeRawValue(node.value);

				if (raw !== undefined && EXTERNAL_URL.test(raw.trim())) {
					context.report({ node, messageId: "externalAsset" });
				}
			},
		};
	},
});
