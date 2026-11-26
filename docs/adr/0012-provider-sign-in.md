# ADR 0012: Sign-in through providers

Status: accepted, 2026-11-25. It replaces the second consequence of [ADR 0009](0009-accounts-with-better-auth.md), which names the generic OAuth plugin for all four providers; the rest of ADR 0009 holds.

## Context

Step 3 of Phase 5 adds sign-in with Google and GitHub, and later Seznam and Facebook. A provider names an account of its own and usually an email address. The address is not always proof that the person holds it: Google says that it is authoritative only for `@gmail.com` addresses and for hosted domains, GitHub marks each address as verified or not but never checks it again, so the mark can belong to a former holder, and Seznam and Facebook give no such mark. In Better Auth 1.7.27:

- A first sign-in with an unproved address creates the account with `emailVerified: false`.
- `requireEmailVerification` creates the account and the provider link first and sends a link afterwards. Following that link only sets the flag, so a stranger who started the sign-in keeps their provider attached to the account.
- A provider is joined to an account with the same address without a session, unless `disableImplicitLinking` is set.
- Provider tokens, the name and the picture are stored.
- The callback looks the address up before it creates an account, so its answer differs for an address that has an account.
- Errors are logged together with their details, which can hold the state or the provider's answer.

A form that posts to us and is redirected to a provider is blocked by `form-action 'self'` in Chromium and WebKit. Allowing the provider's origin still fails in Chromium when the provider redirects to another host.

## Decision

1. **No account before its address is proved.** A hook refuses to create an account whose address is not proved, whatever the method. The email link proves an address, and so does a provider that is authoritative for it.
2. **One place decides the proof.** `provider-address.ts` decides whether the address in a provider's answer is proved. An address that is not proved is replaced, before Better Auth sees it, by a placeholder under the reserved domain `.invalid`. Better Auth therefore never looks the unproved address up, and the answer is the same whether or not the address has an account.
3. **Joining only from a session.** Implicit linking is off. Linking from a session accepts any address, because the account's own address does not change.
4. **Built-in providers for Google and GitHub.** Better Auth maintains their endpoints and checks. Seznam will use the generic plugin.
5. **Nothing but the key is kept.** Hooks empty the tokens, scopes, name and picture on every write.
6. **Direct navigation with scripts, forwarding page without.** With JavaScript enabled, the button posts to our route via `fetch` asking for JSON and navigates directly to the returned address so no intermediate page flashes. Without JavaScript, the plain form submission receives a page that forwards by `Refresh`. `form-action` stays `'self'` in both cases.
7. **Only the callback is public.** Better Auth's HTTP endpoints that start, link, list, unlink or read providers are disabled. Our routes and actions call the same functions on the server, after their own checks.
8. **The log names only the event.** Better Auth's log lines go out without their details, and an unexpected error by its class name. GitHub's refusal of a code is the exception: Better Auth logs the error GitHub names, which holds no token or address.
9. **Tests at the network's edge.** The tests run the real provider code and answer its requests in place of Google and GitHub. The application has no setting for a test provider.

## Consequences

- A person whose provider does not prove their address signs in with the email link once. Opened in the browser that signed in at the provider, the link adds the provider as well; the identity waits there in a cookie signed with `AUTH_SECRET`, and joins only the account at the address the link went to, so a stranger cannot attach their provider to an address they typed. Opened elsewhere, the link only signs in, and the person adds the provider from the account page.
- The placeholder must stay out of every account. The refusal of item 1 guarantees it, because a placeholder is never proved.
- An upgrade of Better Auth needs a look at the callback, the link path and the disabled endpoints.
- Rollback: without a provider's two settings the provider is off. Its rows in `auth_accounts` then do nothing, and the email link keeps working.
