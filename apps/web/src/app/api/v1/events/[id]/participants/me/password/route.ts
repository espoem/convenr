import { noContent, readJson, routeMethods, securedEndpoint } from "@/server/api/http";
import { type PasswordFields, refusalResponse } from "@/server/api/mapping";
import { removePasswordRequestSchema, setPasswordRequestSchema } from "@/server/api/schemas";
import { changePassword, type CurrentPassword } from "@/server/participants";

type Params = { id: string };

const fields: PasswordFields = { current: "/currentPassword", new: "/newPassword" };

export const PUT = securedEndpoint<Params>("participant", async (request, { id }, token) => {
	const body = await readJson(request, setPasswordRequestSchema);

	if (!body.ok) {
		return body.response;
	}

	const { newPassword, currentPassword } = body.value;

	const current: CurrentPassword =
		currentPassword === undefined ? { kind: "none" } : { kind: "given", password: currentPassword };

	const changed = await changePassword(id, token, current, newPassword);

	return changed.ok ? noContent() : refusalResponse(changed, fields);
});

export const DELETE = securedEndpoint<Params>("participant", async (request, { id }, token) => {
	const body = await readJson(request, removePasswordRequestSchema);

	if (!body.ok) {
		return body.response;
	}

	const changed = await changePassword(
		id,
		token,
		{ kind: "given", password: body.value.currentPassword },
		null,
	);

	return changed.ok ? noContent() : refusalResponse(changed, fields);
});

const methods = routeMethods(["PUT", "DELETE"]);

export const OPTIONS = methods.preflight;
export const GET = methods.notAllowed;
export const HEAD = methods.notAllowed;
export const POST = methods.notAllowed;
export const PATCH = methods.notAllowed;
