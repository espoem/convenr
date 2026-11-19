export * from "./generated/index.js";

// The generated index leaves out the client factory that a caller needs to name an instance.
export { createClient } from "./generated/client/index.js";

export type { Client } from "./generated/client/index.js";
