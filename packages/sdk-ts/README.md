# @convenr/sdk

A TypeScript client for the [convenr](https://convenr.party) API, generated with `@hey-api/openapi-ts` from the API's OpenAPI document. The reference of every endpoint, problem code and field is at `/{locale}/api` on an instance.

```ts
import { createClient, createEvent, join } from "@convenr/sdk";

const client = createClient({ baseUrl: "https://convenr.party/api/v1" });

const { data } = await createEvent({
  client,
  throwOnError: true,
  body: {
    name: "Team lunch",
    referenceZone: "Europe/Prague",
    schedule: {
      mode: "dates",
      dates: ["2027-04-05"],
      dailyStart: "11:00",
      dailyEnd: "14:00",
      slotMinutes: 30,
    },
  },
});

// The admin secret is returned only here. Pass a secret as `auth` on a call that needs one.
const { adminSecret, event } = data;

await join({ client, throwOnError: true, path: { id: event.id }, body: { name: "Ada" } });
```

A response may gain fields and problem codes within version 1. The client keeps them, so handle a `code` you do not know as a general failure.

The code in `src/generated` is written by `mise run sdk` from `apps/web/openapi.json`; do not edit it by hand.

This SDK is MIT licensed, while the convenr server is AGPL-3.0-only. `THIRD_PARTY_NOTICES.md` carries the notice of the generator whose runtime the generated code includes.
