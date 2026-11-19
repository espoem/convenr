/**
 * The text of a control that turns bold when pressed or selected. It takes the width of its
 * bold form from the start, so pressing it does not move the controls beside it.
 */
export function SteadyLabel({ text }: { text: string }) {
	return (
		<span className="cv-steady-label" data-label={text}>
			{text}
		</span>
	);
}
