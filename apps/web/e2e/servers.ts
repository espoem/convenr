// The end-to-end servers, shared by the Playwright configuration and the tests. The main server
// streams changes, as an instance does by default; the second checks for them instead.
export const PORT = Number(process.env["E2E_PORT"] ?? 3100);
export const BASE_URL = `http://127.0.0.1:${PORT}`;
export const POLL_PORT = PORT + 1;
export const POLL_BASE_URL = `http://127.0.0.1:${POLL_PORT}`;
export const POLL_SECONDS = 15;
