// The one layout of every email, written in MJML through React so it holds up in the common
// clients (tables, inline styles). Colors, fonts and the radius come from DESIGN.md through the
// generated tokens; there is no image, no font or content from another host and no tracking.
import {
	Mjml,
	MjmlAll,
	MjmlAttributes,
	MjmlBody,
	MjmlButton,
	MjmlColumn,
	MjmlHead,
	MjmlPreview,
	MjmlSection,
	MjmlText,
	MjmlTitle,
} from "@faire/mjml-react";
import { render } from "@faire/mjml-react/utils/render";
import type { ReactNode } from "react";

import type { Locale } from "@/i18n/routing";

import { emailTokens } from "./tokens";

const { color, font, radius } = emailTokens;

/** A paragraph of an email. */
export function EmailText({ children }: { children: ReactNode }) {
	return <MjmlText>{children}</MjmlText>;
}

/** The small print at the end of an email: why it came, and a link such as the one that stops it. */
export function EmailFootnote({
	reason,
	label,
	url,
}: {
	reason: string;
	label: string;
	url: string;
}) {
	return (
		<MjmlText color={color["ink-muted"]} fontSize="14px" padding="16px 24px 8px">
			{reason}{" "}
			<a href={url} style={{ color: color.action }}>
				{label}
			</a>
		</MjmlText>
	);
}

/** The one action of an email, as a button that is also a plain link. */
export function EmailButton({ href, children }: { href: string; children: ReactNode }) {
	return (
		<MjmlButton
			href={href}
			align="left"
			backgroundColor={color.action}
			color={color["on-action"]}
			borderRadius={radius}
			fontWeight="600"
			innerPadding="12px 20px"
		>
			{children}
		</MjmlButton>
	);
}

type LayoutProps = {
	locale: Locale;
	subject: string;
	/** The line clients show next to the subject in the inbox. */
	preview: string;
	children: ReactNode;
};

function EmailLayout({ locale, subject, preview, children }: LayoutProps) {
	return (
		<Mjml lang={locale}>
			<MjmlHead>
				<MjmlTitle>{subject}</MjmlTitle>
				<MjmlPreview>{preview}</MjmlPreview>
				<MjmlAttributes>
					<MjmlAll fontFamily={font.body} />
					<MjmlText color={color.ink} fontSize="16px" lineHeight="1.5" padding="8px 24px" />
					<MjmlButton fontFamily={font.body} fontSize="16px" padding="8px 24px" />
				</MjmlAttributes>
			</MjmlHead>
			<MjmlBody backgroundColor={color.background} width={600}>
				<MjmlSection padding="24px 0 8px">
					<MjmlColumn>
						<MjmlText
							fontFamily={font.display}
							fontSize="20px"
							fontWeight="600"
							color={color.action}
						>
							convenr
						</MjmlText>
					</MjmlColumn>
				</MjmlSection>
				<MjmlSection
					backgroundColor={color.surface}
					border={`1px solid ${color.line}`}
					borderRadius={radius}
					padding="16px 0"
				>
					<MjmlColumn>{children}</MjmlColumn>
				</MjmlSection>
			</MjmlBody>
		</Mjml>
	);
}

/** The HTML part of an email; a template MJML refuses fails here rather than in an inbox. */
export async function renderEmailHtml(props: LayoutProps): Promise<string> {
	const { html } = await render(<EmailLayout {...props} />, { validationLevel: "strict" });

	return html;
}
