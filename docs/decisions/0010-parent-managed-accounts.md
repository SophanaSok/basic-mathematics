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

The owner answered the design's six questions on 2026-10-16, choosing the recommended option on
each. Each answer is now a rule:

- **Q1 (a). Consent is a profile under the signed-in parent's account** with a recorded,
  versioned consent confirmation (`consent_v`, `consent_at`). Counsel confirms before the
  age-policy page ships that this meets COPPA for data used only to run the course; a stronger
  method, if required, is added at `learner_add` without changing a row.
- **Q2 (a). At most 8 managed learners per account** (`LEARNERS_MAX`).
- **Q3 (a). A managed learner is never on the Daily board.** `submit_daily` keys on the account,
  the Arena hides the board for a managed learner, and the board switch shows only for the self
  learner.
- **Q4 (a). Deleting a learner or the account, and exporting, need a sign-in within the last 10
  minutes**, enforced on the server through the token's sign-in timestamp
  (`private.fresh_auth()`), verified on the live project before the check is enabled and added
  through an access-token hook if absent, never failing open.
- **Q5 (a). A managed learner may be 13 or older.** The under-13 flag is a protection, not the
  only reason for a managed learner; it is set at creation or later, never cleared.
- **Q6 (a). One subscription covers every learner the paying account guards.** Billing's design
  (R5 item 26) reads `learners.guardian`.

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

- Six cards, in order: PA-1 the SQL (risky: Sonnet build, Sonnet and Opus review, pgTAP with
  three accounts), the owner applies the migration and checks the token's sign-in timestamp
  live, then PA-2 sync, PA-3 the account page, PA-4 the pages that show who is playing and hide
  the board, PA-5 wording and this note's final text, PA-6 the `learners` kill switch and the
  step-up on `delete_my_account` (client first, then the SQL: rule 5).
- `OPERATIONS.md` section 6 gains `learners: "off"` and its server stop (revoke execute on
  `learner_add`), planned until PA-6 ships the flag.
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

Decided, 2026-10-16: the owner approved the recommended answers on Q1 to Q6.

Built, 2026-10-18: PA-1 to PA-10 are merged (#187 bca26f1, #188 cd95d24, #189 baca969, #190 ad8925e,
#191 cc6b8b1, #192 82a2852, #193 8f1439b, #194 285eac6, #196 8c7ec6c, #199 2b6cd6d, #200 b14d498). Both migrations were applied and verified
live on 2026-10-18 (steps in `OPERATIONS.md`, "The learners (PA-1)" and "The account-delete
step-up, and first-factor sign-ins only (PA-6a)") and the `amr` check passed. PA-5 is this note and
the wording in `about.html`, `supabase/README.md` and `OPERATIONS.md`; PA-6 is the `learners: "off"`
kill switch and the step-up on `delete_my_account()`, with `fresh_auth` counting first-factor
sign-ins only; PA-7 gives a browser playing as a learner a way back to the parent's own progress
while the switch is off; PA-8 is "Keep this device on <name>" (`bm.sync.v1.keep`: the account page
collapses to "Playing as <name>" behind "I'm the parent"; a convenience, not a boundary; it ends on
any switch away from that learner); PA-9 draws the "Mark as under 13" control for
`learner_mark_under13`, which PA-3 had left undrawn; PA-10 is the consent re-ask of §5 (a learner
marked under an older `consent_v` shows "Consent to confirm" and cannot be switched to until the
statement is confirmed again; dormant while `CONSENT_V` is 1). Open:

- PA-11, in progress: the readiness work before anyone bumps the consent version (the kept view
  re-asks, an out-of-date message when the page and the server disagree, the `OPERATIONS.md` step).
- Counsel's answer on Q1 is still due before the age-policy page ships.

Two departures from the design, pinned by the build:

- The active learner lives in `bm.sync.v1` (`learner`, with `acct` and `learnerName`), not in
  `bm.device.v1`, whose uid is the learner id the device was stamped for.
- The step-up retry is manual: after a stale sign-in the parent signs in again and presses the
  button again; nothing is retried on their behalf.
- An accepted residual from PA-1's review (design T4): the "own state" policy is `for all`, so a
  stale session can still reset or overwrite a managed learner's `user_state`; only the learner
  row is behind the step-up. Guarding it would put the step-up on every sync.

The plans live outside the repository, in `~/.claude/plans/`, named here by file only:
`parent-accounts-design.md` (the design and threat model), `pa2-threat-model.md` and
`pa5-learner-words.md`. The cards between them are `pa3-learner-page.md` and
`pa4-learner-shown.md`.
