"use client";
// The browser side of passkeys (ADR 0009). Sign-in by email link needs no script; it posts a
// form to a Server Action.

import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ basePath: "/api/auth", plugins: [passkeyClient()] });
