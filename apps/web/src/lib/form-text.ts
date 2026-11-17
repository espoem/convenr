/** The text of a form field; a missing field or a file field reads as "". */
export function formText(form: FormData, name: string): string {
	const value = form.get(name);

	return value instanceof File ? "" : (value ?? "");
}
