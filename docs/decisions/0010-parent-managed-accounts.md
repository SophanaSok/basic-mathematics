# 0010: Parent-managed accounts

## Decision

A parent's account can hold **managed learners**: a learner under the parent's account with a
name the parent chose and an under-13 flag, and no email, password or sign-in of their own
(0001's account shapes). The design, with its threat model, is
`~/.claude/plans/parent-accounts-design.md`.

Progress is re-keyed on a **learner id**. Every account has a self learner whose id is its
account id, so no existing row moves and the deployed site keeps working through the
migration. `user_state`, `events` and `event_meta` reference `learners`; the policies say a
learner's rows belong to the learner's **guardian** (`guardian = auth.uid()`), and every
function that writes takes the learner it writes for and checks the same thing. Learners are
added, renamed, exported and deleted only through functions with bounds; deleting a learner or
the account, and exporting, need a sign-in within the last 10 minutes, checked on the server.

Switching learners is done on the account page: the browser flushes its unsent log, refuses
while anything is unsent, clears its synced keys, sets the active learner and pulls. Pages show
whose progress they are writing. A managed learner is never on the Daily board, is never shown
to another reader, and gets no tutor until R5's own consent.

Two other designs were weighed and rejected for now: a managed learner as its own auth user
signed in through an Edge Function with the service role (a minted session for another user, a
synthetic email, and a child who could set an email and leave the guardian link; it can be
added on top later), and learners as a map inside the account's own row (one row per family,
shared caps, broken merge laws).

The owner's answers to the design's six questions go here as rules once given:

- **Q1 Consent mechanism** for an under-13 learner. _Recommended (a): a profile under the
  signed-in parent's account with a recorded, versioned consent confirmation; counsel to
  confirm it meets COPPA for data used only to run the course._
- **Q2 Managed learners per account.** _Recommended (a): 8._
- **Q3 The Daily board for managed learners.** _Recommended (a): never._
- **Q4 Step-up for delete and export.** _Recommended (a): a sign-in within 10 minutes, enforced
  on the server through the token's sign-in timestamp, verified on the live project first._
- **Q5 Managed learners who are 13 or older.** _Recommended (a): allowed; the under-13 flag is
  a protection, not the only reason for a managed learner._
- **Q6 One subscription for several children** (0001's open question). _Recommended (a): the
  paying account's entitlement covers every learner it guards._

## Why

0001 promised free parent accounts and under-13 learners without a sign-in of their own, and
made accounts risky work: a threat-model design review before any card and an Opus second
reviewer. The chosen design needs no new privilege (no service role, no Edge Function, no
minted session), keeps the one boundary the project already relies on (row-level security on
`auth.uid()`), and is backward compatible at every step of the migration, which is what the
migrations README's rule 5 requires. The 2025 amendments to the COPPA Rule (effective
2025-06-23, compliance by 2026-04-22) added consent methods; the data model does not depend on
which one applies, so a stronger method can be added at the add-learner step later.

## What this changes

- Five cards, in order: PA-1 the SQL (risky: Sonnet build, Sonnet and Opus review, pgTAP with
  three accounts), the owner applies the migration and checks the token's sign-in timestamp
  live, then PA-2 sync, PA-3 the account page, PA-4 the pages that show who is playing and hide
  the board, PA-5 wording and this note's final text.
- `OPERATIONS.md` section 6 gains `learners: "off"` and its server stop (revoke execute on
  `learner_add`).
- `about.html#progress` and `supabase/README.md` "What is stored" say what a learner is and what
  a parent and the author see.
- The author's aggregate functions now count learners, not accounts.
- 0001's open questions on one subscription for several children and on consent are answered
  here (Q6, Q1); the age-policy page (Tier 2 item 9) cites Q1's answer.

## What it requires that did not exist before

- A `learners` table, a trigger on `auth.users`, the `learner_*` functions and
  `private.fresh_auth()`.
- A versioned consent text in the repo.
- The live check that Supabase's access token carries `amr` entries with timestamps that
  survive a refresh; otherwise a custom access token hook adds them before the step-up is
  enabled.

## Status

Proposed, 2026-10-16. Waits on the owner's answers to Q1 to Q6; counsel's answer on Q1 is due
before the age-policy page ships, not before PA-1.
