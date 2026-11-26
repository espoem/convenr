import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type PageWidth = "column" | "form" | "measure";

const REGION_WIDTH: Record<PageWidth, string> = {
	column: "w-full",
	form: "w-full max-w-(--cv-form)",
	measure: "w-full max-w-(--cv-measure)",
};

const FIT_WIDTH: Record<PageWidth, string> = {
	column: "",
	form: "max-w-(--cv-form)",
	measure: "max-w-(--cv-measure)",
};

/** Width constraint class for a documented page region. */
export function widthClass(width: PageWidth, options?: { fit?: boolean }): string {
	return options?.fit === true ? FIT_WIDTH[width] : REGION_WIDTH[width];
}

function regionClass(width: PageWidth, className?: string) {
	return cn("flex min-w-0 flex-col", widthClass(width), className);
}

/** Main page landmark constrained to one of the documented region widths. */
export function PageMain({
	width = "column",
	className,
	children,
}: {
	width?: PageWidth;
	className?: string;
	children: ReactNode;
}) {
	return <main className={regionClass(width, className)}>{children}</main>;
}

type PageRegionProps =
	| {
			as?: "div" | "header";
			width?: PageWidth;
			id?: string;
			role?: "alert" | "status";
			className?: string;
			children: ReactNode;
	  }
	| {
			as: "section";
			"aria-labelledby": string;
			width?: PageWidth;
			id?: string;
			className?: string;
			children: ReactNode;
	  };

/** Page region or titled section constrained to one of the documented region widths. */
export function PageRegion({
	as = "div",
	width = "column",
	className,
	children,
	...rest
}: PageRegionProps) {
	const Tag = as;

	return (
		<Tag className={regionClass(width, className)} {...rest}>
			{children}
		</Tag>
	);
}
