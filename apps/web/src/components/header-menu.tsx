"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useRef } from "react";

/**
 * A menu button in the page header. It is a disclosure, so it opens and its entries work without
 * JavaScript; the script only closes it the way a menu closes: on Escape, on a click outside,
 * when focus leaves it, and after an entry is chosen.
 */
export function HeaderMenu({
	label,
	button,
	children,
}: {
	/** The accessible name of the button, which includes the current choice. */
	label: string;
	button: ReactNode;
	children: ReactNode;
}) {
	const ref = useRef<HTMLDetailsElement>(null);

	useEffect(() => {
		const details = ref.current;

		if (details === null) {
			return;
		}

		const summary = details.querySelector("summary");

		const close = () => {
			details.open = false;
		};

		const outside = (target: EventTarget | null) =>
			target instanceof Node && !details.contains(target);

		const onPointerDown = (event: PointerEvent) => {
			if (outside(event.target)) {
				close();
			}
		};

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && details.open) {
				close();
				summary?.focus();
			}
		};

		// Only focus that lands elsewhere closes it: Safari does not focus a clicked button, so
		// focus leaving to nowhere may be a click on an entry.
		const onFocusOut = (event: FocusEvent) => {
			if (outside(event.relatedTarget)) {
				close();
			}
		};

		const onClick = (event: MouseEvent) => {
			if (event.target instanceof Element && event.target.closest("a, button") !== null) {
				close();
			}
		};

		document.addEventListener("pointerdown", onPointerDown);
		details.addEventListener("keydown", onKeyDown);
		details.addEventListener("focusout", onFocusOut);
		details.addEventListener("click", onClick);

		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			details.removeEventListener("keydown", onKeyDown);
			details.removeEventListener("focusout", onFocusOut);
			details.removeEventListener("click", onClick);
		};
	}, []);

	return (
		<details ref={ref} className="group relative">
			<summary
				aria-label={label}
				className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md px-2.5 hover:bg-locked [&::-webkit-details-marker]:hidden"
			>
				{button}
				<CaretDownIcon
					aria-hidden
					className="size-3.5 transition-transform group-open:rotate-180"
				/>
			</summary>
			<div className="absolute top-full right-0 z-20 mt-1 flex min-w-44 flex-col rounded-md border border-earth bg-surface p-1">
				{children}
			</div>
		</details>
	);
}

/** The look of one entry in a header menu, for a link or a button. */
export const MENU_ENTRY =
	"flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-sm px-2.5 text-left whitespace-nowrap hover:bg-locked aria-[current=true]:font-semibold";
