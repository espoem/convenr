// The end-to-end servers, shared by the Playwright configuration and the tests. The main server
// streams changes, as an instance does by default; the second checks for them instead.
export const PORT = Number(process.env["E2E_PORT"] ?? 3100);
export const BASE_URL = `http://127.0.0.1:${PORT}`;
export const POLL_PORT = PORT + 1;
export const POLL_BASE_URL = `http://127.0.0.1:${POLL_PORT}`;
export const POLL_SECONDS = 15;

// Mailpit receives the main server's email; tests read it through Mailpit's API.
export const SMTP_PORT = PORT + 2;
export const MAILPIT_URL = `http://127.0.0.1:${PORT + 3}`;

// The main server has accounts on. A passkey needs a host name, not an address, so signed-in
// tests open the main server as `localhost`, the address its links point to.
export const ACCOUNTS_BASE_URL = `http://localhost:${PORT}`;
