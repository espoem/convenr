import { routeMethods, staticEndpoint } from "@/server/api/http";
import { openApiDocument } from "@/server/api/openapi";

const document = openApiDocument("en");

export const GET = staticEndpoint(() => Response.json(document));

const methods = routeMethods(["GET"]);

export const OPTIONS = methods.preflight;
export const POST = methods.notAllowed;
export const PUT = methods.notAllowed;
export const PATCH = methods.notAllowed;
export const DELETE = methods.notAllowed;
