// The database the end-to-end server uses, shared by the Playwright configuration and the tests
// that look into the database directly.
export const DATABASE_URL =
	process.env["DATABASE_URL"] ?? "postgres://convenr:convenr@127.0.0.1:5432/convenr";
