// Flags are images of national symbols, not interface colors: DESIGN.md exempts their colors
// from the tokens. Both are drawn in a 3:2 box so the language button keeps its width.

import { useId } from "react";

const SIZE = "h-4 w-6 shrink-0 rounded-[2px] ring-1 ring-line";

function CzechFlag() {
	return (
		<svg aria-hidden viewBox="0 0 900 600" className={SIZE}>
			<rect width="900" height="600" fill="#D7141A" />
			<rect width="900" height="300" fill="#FFFFFF" />
			<path d="M450 300 0 0v600z" fill="#11457E" />
		</svg>
	);
}

/** The flag of the United Kingdom, cropped from 2:1 to the 3:2 box around its center. */
function EnglishFlag() {
	// The flag can appear twice on a page, in the button and in the menu.
	const quarters = useId();

	return (
		<svg aria-hidden viewBox="7.5 0 45 30" className={SIZE}>
			<clipPath id={quarters}>
				<path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
			</clipPath>
			<path d="M0,0 v30 h60 v-30 z" fill="#012169" />
			<path d="M0,0 L60,30 M60,0 L0,30" stroke="#FFFFFF" strokeWidth="6" />
			<path
				d="M0,0 L60,30 M60,0 L0,30"
				clipPath={`url(#${quarters})`}
				stroke="#C8102E"
				strokeWidth="4"
			/>
			<path d="M30,0 v30 M0,15 h60" stroke="#FFFFFF" strokeWidth="10" />
			<path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
		</svg>
	);
}

export const FLAGS = { cs: CzechFlag, en: EnglishFlag } as const;
