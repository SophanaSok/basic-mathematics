# 0011: Economy and gates (R3)

## Decision

R3 of the master plan adds an earned currency ("facets"), a shop of procedural cosmetics, streak
freezes, boss and region gates, and achievements re-aimed at learning behaviours. The design, with
its threat model and cards, is `~/.claude/plans/r3-design.md`. What it settles:

- Everything in R3 is **client-derived state synced through `user_state`**, like XP and medals:
  three new columns, `wallet`, `gates` and `locker`, each its own synced key. The server stores what
  the browser writes. The threat model is therefore about fairness between devices and about never
  blocking learning, not about money: facets buy only cosmetics, and 0001's guardrail stands
  (**never purchasable**).
- `bm.wallet.v1` is a **ledger keyed by deterministic earn ids** (`strong:<section>`,
  `medal:<chapter>:<set>:<medal>`, `review:<day>:<section>` with a daily cap, `compare:<exercise>`,
  `mission:<figure>`), merged by union, so two devices never pay the same cause twice and a merge
  never loses an earn or a purchase. An overdraft after a merge is allowed; nothing is revoked; no
  new purchase while the balance is negative. No earn for twins, for speed, or from the Daily board
  (0006).
- `bm.gates.v1` is a **monotonic open set**: a gate once open never closes; a closed gate seals
  presentation only (the boss card, the region's arch and cosmetics); every exercise, link, XP,
  medal and review works underneath; a boss can always be fought. A legacy predicate opens, at the
  first load after the deploy, everything an existing learner could already reach.
- Streak freezes live in the wallet (bought with facets, or banked free by doing the day's due
  reviews), auto-bridge up to two days, and the at-risk line is in-app only.
- Kill switches `shop`, `gates`, `streakReminders`; bus events `wallet`, `gate`, `cosmetic`,
  `streak`.

This note **supersedes the sentence in 0007** that R2's forms come with "no new progression
system, no currency, no shop": that was R2's scope; the master plan's R3 (approved 2026-10-04)
adds them, with the guardrail above.

## The owner's answers (2026-10-18)

The owner took the recommended answer on every question, so each is now a rule:

- **Q1** 0007's "no currency, no shop" is superseded: R3 adds facets and a shop, and 0001's
  guardrail stands (facets are never purchasable).
- **Q2** A boss gate seals presentation only; a boss is always fightable. `assets/encounter.js`'s
  header is rewritten by the card that seals it.
- **Q3** Review facets are capped at 25 a day.
- **Q4** An overdraft after a merge is allowed; nothing is revoked; no new purchase while the
  balance is negative.
- **Q5** The shop and locker live on the progress page beside "Your form".
- **Q6** The streak at-risk line is in-app only.

## What this changes

Nine cards, R3-0 (this note, final) to R3-9 (wording), listed in the design with their files and
done-whens; one migration (three columns) applied by the owner's session after the client that
tolerates their absence is live (rule 5); `OPERATIONS.md` section 6 gains three kill switches.

## Status

Decided, 2026-10-18: the owner approved the recommended answers on Q1 to Q6. The first card,
R3-1 `wallet-core` (the ledger, its merge laws and their property tests), can be briefed from
the design.
