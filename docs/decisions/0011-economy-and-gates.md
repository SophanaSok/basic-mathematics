# 0011: Economy and gates (R3) — proposed

## Decision (proposed)

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

## Owner questions

- **Q1 Supersede 0007's "no currency, no shop".** (a) Yes, with 0001's guardrail kept; (b) no
  currency: R3 ships gates, freezes and achievements only. Recommended: (a).
- **Q2 Boss gates change `assets/encounter.js`'s promise that bosses are never locked.** (a) Sealed
  presentation only, always fightable; (b) gate regions only, leave bosses unsealed. Recommended: (a).
- **Q3 Daily cap on review facets.** (a) 25; (b) none; (c) 50. Recommended: (a).
- **Q4 Overdraft after a merge.** (a) Allowed, nothing revoked, no new purchase while negative;
  (b) revoke the later purchase. Recommended: (a).
- **Q5 Where the shop lives.** (a) The progress page beside "Your form"; (b) the hub. Recommended: (a).
- **Q6 Streak at-risk line.** (a) In-app only (the master plan's default); (b) an email digest too
  (needs email delivery, not available). Recommended: (a).

## What this changes (once decided)

Nine cards, R3-0 (this note, final) to R3-9 (wording), listed in the design with their files and
done-whens; one migration (three columns) applied by the owner's session after the client that
tolerates their absence is live (rule 5); `OPERATIONS.md` section 6 gains three kill switches.

## Status

Proposed, 2026-10-18. Waits on the owner's answers to Q1 to Q6 before any card is briefed.
