# convenr

Find a time that works for a whole group. Free, without ads or trackers, and usable without an account by the organizer and by everyone who responds.

An organizer creates an event as a grid of days and times or as a poll of a few hand-picked times, and shares its link. Everyone marks when they can, or can if need be, and the organizer picks the final time, which people add to their calendars. The pages are in Czech and English, and a public API with TypeScript and Python SDKs does the same. The plan is in the [roadmap](docs/roadmap.md), the rules are in the [specifications](docs/spec/), and the technology decisions are in the [ADRs](docs/adr/).

The four guides below run on a clone of this repository: [local development](#local-development), [local deployment](#local-deployment), [local API test](#local-api-test) and [local SDK usage](#local-sdk-usage).

## Requirements

- [mise](https://mise.jdx.dev/), which installs every other tool at the version the repository pins.
- Docker or Podman, for the database and for running the container image.
- `git` and `curl`.

### Browser support

The app supports the last four versions of Chrome (desktop and Android), Edge and Firefox, and Safari (macOS and iOS) from 16.3 on, as the `browserslist` of `apps/web/package.json` says. Tailwind CSS 4 styles Safari 16.3 only partly; its own floor is Safari 16.4. When a browserslist data update changes the list, `mise run check` fails until `mise run polyfills` rewrites the file. `core-js` supplies the standardized JavaScript features that these browsers lack, such as `Map.groupBy`, and a browser without `Temporal` loads `temporal-polyfill`. `apps/web/e2e/older-browser.spec.ts` loads the pages with `Temporal` and `Map.groupBy` removed.

## Local development

```sh
git clone https://github.com/espoem/convenr.git
cd convenr
mise trust
mise install
mise run install
```

`mise install` installs the tools pinned in `.mise.toml`: Node.js and nub for the application, docker-compose, Python and uv for the Python SDK, hk for the Git hooks, Redocly CLI and oasdiff for the OpenAPI document, jq for the API guide, the Vercel CLI for the deployment from CI, and jactionlint, shellcheck and zizmor for the workflows. `mise run install` installs the dependencies from the lockfile and a pre-commit hook that formats and lints the staged files. `mise tasks` lists every task.

Run the development server against a database in a container:

```sh
cp .env.example .env
mise run db:up
mise run dev
```

The application is then at <http://localhost:3000>. The database listens on `127.0.0.1:5432` (`DB_PORT` changes the host port) with user, password and database `convenr`, which is fine on your own machine only. The server applies pending migrations when it starts; `mise run db:migrate` applies them without starting it.

Or run the production build, the same server the end-to-end tests use:

```sh
mise run build
DATABASE_URL='postgres://convenr:convenr@127.0.0.1:5432/convenr' PORT=3000 node apps/web/scripts/start-standalone.mts
```

The `purge`, `usage` and `db:migrate` tasks read `DATABASE_URL` and `RETENTION_DAYS` from `.env` or from the environment. The development and production servers read only the environment of the shell that starts them.

### Check a change

A change is done when these three exit with code 0:

```sh
mise run check            # format, lint, theme, type check, unit and database tests, OpenAPI and SDK checks, build
mise run e2e              # end-to-end tests against the production build
mise run sdk:acceptance   # both SDKs and the API guide against the production build
```

The end-to-end tests need the test browser once: run `nubx playwright install chromium` in `apps/web`. They start two servers on the build, one on `E2E_PORT` (default 3100) and one on the next port, and run two browsers at a time; `E2E_WORKERS` changes that. A trace is recorded only for a retry in CI; add `-- --trace on` to record traces locally. Set `DATABASE_URL` to run them against a database other than `convenr`.

### Regenerate what is generated

| After you change                | Run                    | It rewrites                                                           |
| ------------------------------- | ---------------------- | --------------------------------------------------------------------- |
| the tokens in `DESIGN.md`       | `mise run theme`       | `apps/web/src/app/tokens.css`                                         |
| the `browserslist`              | `mise run polyfills`   | `apps/web/src/polyfills.generated.ts`                                 |
| the API's schemas or operations | `mise run openapi`     | `apps/web/openapi.json`                                               |
| `apps/web/openapi.json`         | `mise run sdk`         | `packages/sdk-ts/src/generated` and `packages/sdk-python/src/convenr` |
| the Drizzle schema              | `mise run db:generate` | a new SQL migration in `apps/web/drizzle`                             |

`mise run check` fails when one of these files does not match its source, and when the OpenAPI document breaks clients of the one on `main`.

## Local deployment

An instance is one container image and one PostgreSQL database. `compose.yaml` runs both:

```sh
git clone https://github.com/espoem/convenr.git
cd convenr
mise trust
mise install
mise run up      # builds the image, starts the application and PostgreSQL
mise run down    # stops them; the database volume is kept
```

The application is then at <http://localhost:3000> (`WEB_PORT` changes the port), and `GET /api/health` reports whether it reaches the database. `scripts/compose.sh` uses Podman when it is installed and Docker otherwise; set `CONTAINER_ENGINE=docker` or `CONTAINER_ENGINE=podman` to choose. With Podman on macOS or Windows, run `podman machine start` first. Change `POSTGRES_PASSWORD` before using the setup anywhere but your own machine.

### Settings

The image reads these settings from its environment. With compose, put them in a `compose.override.yaml` next to `compose.yaml`, which compose reads too:

```yaml
services:
  web:
    environment:
      RETENTION_DAYS: "30"
```

| Variable                | Required      | Meaning                                                                                                                         |
| ----------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | yes           | `postgres://user:password@host:5432/database`                                                                                   |
| `PORT`                  | no            | Port to listen on. Default `3000`.                                                                                              |
| `HOSTNAME`              | no            | Address to bind. Default `0.0.0.0`.                                                                                             |
| `RETENTION_DAYS`        | no            | Days after an event's last date (or last change, for days of the week) until it is deleted. Default `90`; `never` keeps events. |
| `LIVE_UPDATES`          | no            | How open pages learn of changes: `push` (default) streams them from the server, `poll` checks at an interval.                   |
| `LIVE_POLL_SECONDS`     | no            | Seconds between checks with `poll`, or after a stream failed. Default `15`.                                                     |
| `LIVE_STREAM_SECONDS`   | no            | Seconds after which the server closes a stream and the page opens a new one. Default `300`.                                     |
| `LIVE_IDLE_MINUTES`     | no            | Minutes without input after which a page stops its updates until the next input. Default `30`.                                  |
| `DATABASE_LISTEN_URL`   | no            | A direct database address for `push` when `DATABASE_URL` goes through a transaction pooler. Default `DATABASE_URL`.             |
| `SMTP_URL`              | no            | The mail server, `smtps://user:password@host:465` or `smtp://user:password@host:587`. Accounts are off until it is set.         |
| `MAIL_FROM`             | with accounts | The sender of the emails, such as `convenr <hello@example.org>`.                                                                |
| `AUTH_SECRET`           | with accounts | At least 32 random characters that sign session cookies and key the email limits. Keep it secret and stable.                    |
| `PUBLIC_URL`            | with accounts | The address visitors reach the instance at, such as `https://convenr.example.org`. Links in emails and passkeys use it.         |
| `GOOGLE_CLIENT_ID`      | no            | The OAuth client for sign-in with Google. Set it together with `GOOGLE_CLIENT_SECRET`.                                          |
| `GOOGLE_CLIENT_SECRET`  | no            | The secret of that client.                                                                                                      |
| `GITHUB_CLIENT_ID`      | no            | The OAuth app for sign-in with GitHub. Set it together with `GITHUB_CLIENT_SECRET`.                                             |
| `GITHUB_CLIENT_SECRET`  | no            | The secret of that app.                                                                                                         |
| `MAIL_HOURLY_LIMIT`     | no            | Emails the instance sends per hour at most. Default `300`.                                                                      |
| `NOTIFY_DIGEST_MINUTES` | no            | Least minutes between two emails about new responses to one event. Default `60`.                                                |
| `REMINDER_HOURS`        | no            | Hours before an event's final time that its reminder is sent. Default `24`.                                                     |
| `MAINTENANCE_SECRET`    | no            | At least 32 random characters. When set, `POST /api/maintenance` with this bearer token runs the maintenance pass.              |
| `OPERATOR_NAME`         | no            | Who runs the instance, named as the data controller on the privacy page. Set it together with `PRIVACY_CONTACT`.                |
| `PRIVACY_CONTACT`       | no            | The email address for questions about personal data.                                                                            |

Accounts are optional. Set `SMTP_URL`, `MAIL_FROM`, `AUTH_SECRET` and `PUBLIC_URL` together to turn them on; with only some of them, the server does not start. Passkeys need `PUBLIC_URL` to name a host, not an IP address.

Sign-in with Google or GitHub is off until accounts are on and both settings of the provider are set. Register an OAuth application at the provider with the redirect address `PUBLIC_URL` followed by `/api/auth/callback/google` or `/api/auth/callback/github`. convenr asks for the email address only and stores the provider's identifier of the account, but no token, name or picture.

The privacy page at `/privacy`, and the footer link to it, appear once `OPERATOR_NAME` and `PRIVACY_CONTACT` are both set. Its text describes the instance at convenr.party, including its processors (Vercel, Neon, Lettermint) and the Czech data protection authority. Check every line against your own hosting before you set the two settings, and change the text in `apps/web/messages/` where it differs.

### Back up and restore

Write a backup of the database to a file:

```sh
scripts/compose.sh exec -T db pg_dump -U convenr -Fc convenr > convenr.dump
```

Restore it while the application is stopped, so that no request writes in between:

```sh
scripts/compose.sh stop web
scripts/compose.sh exec -T db pg_restore -U convenr -d convenr --clean --if-exists --no-owner < convenr.dump
scripts/compose.sh start web
```

A backup holds events that the instance deletes later. Delete backups within 35 days, as the [roadmap](docs/roadmap.md) promises for deleted events (D3).

### Update

Back up the database first: the server applies new migrations when it starts, and there is no command that reverts them.

```sh
git pull
mise install
mise run up
```

### Run it elsewhere

Build the image with `docker build -f Containerfile -t convenr .` (or `podman build`), provide a PostgreSQL 18 database and pass the settings above. Put a reverse proxy that terminates TLS in front of it and point a health check at `/api/health`. The image contains a plain Node.js server and uses no platform-specific API, so any host that runs containers works.

The server deletes expired events every hour. To delete them from outside, for example from a scheduler, run `node apps/web/scripts/purge.mts` in the image with the same settings, or `mise run purge` in a checkout. The server also keeps daily usage counts without names, contents or identifiers: `node apps/web/scripts/usage.mts` in the image (or `mise run usage`) prints them for the last 30 days; add a first and a last day, such as `2027-03-01 2027-03-31`, for another range.

On Vercel, where no server process lasts, the server neither migrates nor purges. CI applies migrations with `node apps/web/scripts/migrate.mts` before it deploys, and the scheduled `Maintenance` workflow calls `POST /api/maintenance` every hour with `MAINTENANCE_SECRET`, set both in the Vercel project and as a secret of the GitHub environment `production` ([ADR 0005](docs/adr/0005-vercel-deployment.md), [ADR 0010](docs/adr/0010-maintenance-route.md)). The Vercel project sets `LIVE_UPDATES=poll`, `LIVE_POLL_SECONDS=15` and `LIVE_IDLE_MINUTES=10`, because a function cannot hold a stream cheaply ([ADR 0006](docs/adr/0006-live-updates.md)).

## Local API test

This guide calls a local instance with `curl` and reads the answers with `jq`, from creating an event to its best windows and its final time. Start the instance as in [local deployment](#local-deployment) and run the commands in one shell, in order. Every endpoint, field and problem code is described at <http://localhost:3000/en/api>, and the OpenAPI document is at `/api/v1/openapi.json`.

```sh
API="${CONVENR_URL:-http://localhost:3000}/api/v1"
DAY=$(node -p 'Temporal.Now.plainDateISO().add({ days: 7 }).toString()')
```

`CONVENR_URL` points the guide at another instance. Create an event on one day a week from now, from 11:00 to 14:00 in Prague, in slots of 30 minutes:

```sh
CREATED=$(jq -n --arg day "$DAY" '{
  name: "Team lunch",
  referenceZone: "Europe/Prague",
  schedule: { mode: "dates", dates: [$day], dailyStart: "11:00", dailyEnd: "14:00", slotMinutes: 30 }
}' | curl -sS --fail-with-body --json @- "$API/events")
EVENT=$(echo "$CREATED" | jq -r .event.id)
ADMIN=$(echo "$CREATED" | jq -r .adminSecret)
SLOTS=$(echo "$CREATED" | jq -c .event.schedule.slots)
echo "$SLOTS" | jq -c '.[0:2]'
```

The answer holds the event with its slots, each a start in UTC, and the admin secret, which starts with `cva_`. The secret is returned only here: keep it, because changing, finalizing and deleting the event need it. Anyone with the event's id can read it and join.

Two people join. Each join returns a participant token, which starts with `cvp_` and is the only way to change that participant's availability:

```sh
ADA=$(curl -sS --fail-with-body --json '{ "name": "Ada" }' "$API/events/$EVENT/participants" | jq -r .participantToken)
BOB=$(curl -sS --fail-with-body --json '{ "name": "Bob" }' "$API/events/$EVENT/participants" | jq -r .participantToken)
```

Ada can come from 11:00 to 13:00. Bob can come from 12:00 to 14:00, and from 12:00 to 12:30 only if need be. A save replaces the participant's whole availability, and `ifNeedBe` lists the slots of `availability` that are only if need be:

```sh
jq -n --argjson slots "$SLOTS" '{ availability: $slots[0:4] }' |
  curl -sS --fail-with-body -X PUT --json @- -H "Authorization: Bearer $ADA" \
    "$API/events/$EVENT/participants/me/availability" | jq -c '{ name, availability: (.availability | length) }'
jq -n --argjson slots "$SLOTS" '{ availability: $slots[2:6], ifNeedBe: $slots[2:3] }' |
  curl -sS --fail-with-body -X PUT --json @- -H "Authorization: Bearer $BOB" \
    "$API/events/$EVENT/participants/me/availability" | jq -c '{ name, ifNeedBe }'
```

Ask for the best windows in which both can come. `minPeople` and `minMinutes` filter them; the first window is the best:

```sh
curl -sS --fail-with-body "$API/events/$EVENT/windows?minPeople=2" | jq '.windows[0]'
```

The organizer picks that window as the final time with the admin secret. After that, anyone can download it as a calendar file:

```sh
WINDOW=$(curl -sS --fail-with-body "$API/events/$EVENT/windows?minPeople=2" | jq -c '.windows[0].slots')
jq -n --argjson slots "$WINDOW" '{ slots: $slots }' |
  curl -sS --fail-with-body -X PUT --json @- -H "Authorization: Bearer $ADMIN" "$API/events/$EVENT/final" | jq .final
curl -sS --fail-with-body "$API/events/$EVENT/final.ics" | grep -E '^(DTSTART|DTEND|SUMMARY)'
```

A refused request answers with a problem: a JSON body with the HTTP `status` and a stable `code`. Handle a code you do not know as a general failure. A wrong token, a participant token where the admin secret belongs, a secret in the address and a body that breaks the schema:

```sh
curl -sS -H "Authorization: Bearer cvp_wrong" "$API/events/$EVENT/participants/me" | jq -c '{ status, code }'
curl -sS -X DELETE -H "Authorization: Bearer $ADA" "$API/events/$EVENT" | jq -c '{ status, code }'
curl -sS "$API/events/$EVENT/participants/me?token=$ADA" | jq -c '{ status, code }'
curl -sS --json '{ "name": "" }' "$API/events/$EVENT/participants" | jq -c '{ status, code, errors }'
```

The organizer deletes the event, after which it is gone for everyone:

```sh
curl -sS --fail-with-body -X DELETE -H "Authorization: Bearer $ADMIN" "$API/events/$EVENT"
curl -sS "$API/events/$EVENT" | jq -c '{ status, code }'
```

`mise run sdk:acceptance` runs these commands against the production build, so they keep working.

## Local SDK usage

Both SDKs are generated from the OpenAPI document and live in this repository. Start an instance as in [local deployment](#local-deployment) and install the dependencies with `mise run install`. Each example creates an event, lets two people answer and prints the best window in which both can come. `CONVENR_URL` points them at another instance.

The TypeScript SDK in `packages/sdk-ts`; build it first:

```sh
nub run --filter @convenr/sdk build
cd packages/sdk-ts
node --input-type=module <<'EOF'
import { createClient, createEvent, getWindows, join, saveAvailability } from "./dist/index.js";

const instance = process.env.CONVENR_URL ?? "http://localhost:3000";
const client = createClient({ baseUrl: `${instance}/api/v1` });
const day = Temporal.Now.plainDateISO().add({ days: 7 }).toString();

const { data: created } = await createEvent({
  client,
  throwOnError: true,
  body: {
    name: "Team lunch",
    referenceZone: "Europe/Prague",
    schedule: { mode: "dates", dates: [day], dailyStart: "11:00", dailyEnd: "14:00", slotMinutes: 30 },
  },
});
const { id, schedule } = created.event;

for (const [name, from, to] of [["Ada", 0, 4], ["Bob", 2, 6]]) {
  const { data: joined } = await join({ client, throwOnError: true, path: { id }, body: { name } });

  await saveAvailability({
    client,
    throwOnError: true,
    auth: joined.participantToken,
    path: { id },
    body: { availability: schedule.slots.slice(from, to) },
  });
}

const { data } = await getWindows({ client, throwOnError: true, path: { id }, query: { minPeople: 2 } });

console.log(data.windows[0]);
EOF
```

The Python SDK in `packages/sdk-python`; uv runs it in the SDK's locked environment:

```sh
cd packages/sdk-python
uv run --locked python - <<'EOF'
import datetime
import os

from convenr import AuthenticatedClient, Client
from convenr.api.events import create_event, get_windows
from convenr.api.participants import join, save_availability
from convenr.models import (
    AvailabilityRequest,
    CreateEventRequest,
    DatedSlotInput,
    DatesScheduleInput,
    DatesScheduleInputSlotMinutes,
    JoinRequest,
)

api = os.environ.get("CONVENR_URL", "http://localhost:3000") + "/api/v1"
client = Client(base_url=api)
day = datetime.date.today() + datetime.timedelta(days=7)

created = create_event.sync(
    client=client,
    body=CreateEventRequest(
        name="Team lunch",
        reference_zone="Europe/Prague",
        schedule=DatesScheduleInput(
            mode="dates",
            dates=[day],
            daily_start="11:00",
            daily_end="14:00",
            slot_minutes=DatesScheduleInputSlotMinutes(30),
        ),
    ),
)
event = created.event
slots = [DatedSlotInput(start=slot.start) for slot in event.schedule.slots]

for name, first, last in [("Ada", 0, 4), ("Bob", 2, 6)]:
    joined = join.sync(event.id, client=client, body=JoinRequest(name=name))
    participant = AuthenticatedClient(base_url=api, token=joined.participant_token)
    save_availability.sync(
        event.id, client=participant, body=AvailabilityRequest(availability=slots[first:last])
    )

best = get_windows.sync(event.id, client=client, min_people=2).windows[0]
print(best.minutes, [slot.start.isoformat() for slot in best.slots])
EOF
```

A call that needs a secret takes it as `auth` in TypeScript and as an `AuthenticatedClient` in Python. A refused call returns a problem with its `code`; `throwOnError` makes the TypeScript SDK throw it instead. `packages/sdk-ts/README.md` and `packages/sdk-python/README.md` say more, and `mise run sdk:acceptance` runs both SDKs' acceptance tests.

## Repository layout

```text
apps/web/      Next.js application
packages/      the TypeScript and Python SDKs and their generator
docs/          roadmap, specifications, ADRs
.agents/       project skills for coding agents
AGENTS.md      project rules for coding agents
DESIGN.md      design tokens and component rules
compose.yaml   application and PostgreSQL
.mise.toml     tool versions and tasks
```

## License

[AGPL-3.0-only](LICENSE). The SDKs in `packages/sdk-ts` and `packages/sdk-python` are under MIT. The skill installed in `.agents/skills/impeccable` is under Apache-2.0.
