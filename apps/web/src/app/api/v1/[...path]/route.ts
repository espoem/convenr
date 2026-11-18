// Any other path under the API gets a problem response too, whatever the method, so a client
// never parses HTML.
import { endpoint, problem } from "@/server/api/http";

const notFound = endpoint(() => problem("not_found"));

export {
	notFound as DELETE,
	notFound as GET,
	notFound as HEAD,
	notFound as OPTIONS,
	notFound as PATCH,
	notFound as POST,
	notFound as PUT,
};
