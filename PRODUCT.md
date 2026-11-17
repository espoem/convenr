# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is the organizer of a small group of 3 to 100 people: a club, a committee, an after-school activity or a group of friends. They create an event, usually on a phone, and post its link to the group chat. Participants open the link on a phone, without an app or an account, and mark when they are available in about a minute. Anyone with the link can see where the group overlaps.

## Product Purpose

convenr helps a group find a time that works for most of its members. An event is done when the organizer can read the common window off the heat map and tell the group.

## Positioning

Free, no ads, no trackers, and usable without an account by both organizer and participants. It works well on a phone, converts time zones correctly, and is available in Czech and English from the first release. Every event shows the date it will be deleted. The source is open under AGPL-3.0.

## Operating Context

- The link travels through group chats, so it is opened on phones, often in an in-app browser.
- Participants paint availability on a grid by touch, mouse or keyboard.
- The organizer keeps a secret admin link; the service cannot recover it.
- A participant identifies inside one event by a display name and an optional password.

## Capabilities and Constraints

- Phase rules live in `docs/spec/phase-1.md`; the terms in `GLOSSARY.md`.
- Days are a date range, specific dates or weekdays. Slots are 15, 30 or 60 minutes.
- Dated events are shown in the viewer's time zone; weekday events in the event's reference zone.
- At most 100 participants per event.
- No third-party scripts, fonts or analytics.
- Out of scope: booking pages, payments, SMS, enterprise single sign-on.

## Brand Commitments

- The name is convenr, written in lower case.
- Czech and English, with the same content in both.

## Evidence on Hand

No users, testimonials or usage data exist yet. Do not invent them.

## Product Principles

1. Anonymous first: creating and responding never need an account.
2. Privacy is the product: nothing is collected that the event does not need.
3. Phone first: the grid is painted by touch, and nothing depends on hover.
4. Time zones are correct by construction.
5. Accounts, when they arrive, add convenience and never gate the core.

## Accessibility & Inclusion

WCAG 2.2 AA. The grid works with a keyboard (spec rule I4), and a screen reader can read the count of every slot (V3). Color never carries a count alone.
