# 0003: Placement check

## Decision

The placement check (0001's diagnostic) gives one course band: Pre-algebra, Algebra 1, Geometry or Algebra 2. It is never a predicted test score, never a percent, and never "Beyond Algebra 2". It is taken once per browser without an account and once per account after sign-in (0001). Return visits show the result and the study plan. "Take it again" is the second attempt: it opens the Prep page, which lets everyone through until billing ships.

The owner answered the design's five questions on 2026-10-07, choosing the recommended option on each. Each answer is now a rule:

- **DG1 (a). "Reset all progress" keeps the placement result.** A reset never reopens the free check, on any device, including a reset made from a tab that never pulled the result. Only clearing the browser's data, or signing out, opens a new one. For a signed-in learner the only way to remove the account's copy is Delete my account. The button reads "Reset all progress (keeps placement-check results)", its confirmation says "Progress cleared. Placement-check results were kept.", and the privacy page says the same.
- **DG2 (a). A right value in the wrong form does not count toward clearing a course.** It is scored as not right and explained on the review screen, as 0002's Q6 says. When the band's own block would have cleared with those answers counted, the result is marked "close": "Some {band} answers had the right value written another way. You'll see which ones below." A finished take is never re-scored. A retype request and an empty box cost nothing and use up no question.
- **DG3 (a). US course order, with the Geometry hold.** Geometry comes before Algebra 2. A learner who said they have not finished Geometry is never placed past Geometry by clearing the Geometry block, which is all coordinate work and sets. "Not sure" is not held: it starts at Pre-algebra and has climbed two blocks to reach Geometry. A cleared Algebra 2 is still credited ("you showed this already"), and a held Geometry's plan starts with the Geometry sections the check did not ask.
- **DG4 (a). The top-bar "Sign in" chip is navigation, not an invitation.** It stays on diagnostic.html and prep.html. No page copy asks anyone to sign in, create an account or save a result. Launch (D-14) still waits for the account page's line that an account holder is 13 or older or the account is made by a parent (D-17). Nothing is built for (b).
- **DG5 (a). After billing, any finished take uses up the free check,** rushed or not, and "Start over" on an unfinished run stays free and unlimited. Recorded now for the billing release (R5 item 26); nothing is built for it in Tier 1.

## Why

A reset that cleared the result would be a free re-take button for anyone, and after billing re-takes are the one paid feature the check has. The cost is known and accepted: a parent who resets a shared browser for a younger sibling still sees the first child's result, and the family's route is to clear site data or sign out. Once review scheduling (item 15) lands, it must read a prior only from takes finished after the latest reset; the design names that as item 15's job.

The grader decision (0002, Q6) already scores a wrong-form answer as not correct in exam mode and the placement check and explains it on review. Choosing the same here means the check and the rest of the site cannot disagree by accident. The "close" mark and the answer list tell the learner what happened. Under the new grader (T6) more fraction answers become wrong-form; the format line on every question and the "close" mark cover that.

0001 asks for one course band. The Geometry block has only coordinate and set items, which many Algebra 1 finishers can clear without having taken Geometry. In the design's toy variant about two thirds of them would be told "Start with: Algebra 2" without the hold and about one fifth with it. The price is a few more real Geometry finishers who under-report placed too low: exact band .934 to .915 in the base model. The walk still asks Algebra 2, so nothing a learner showed is lost.

The chip is the same label on every page, was there before 0001, and leads to the account page, which D-17 makes say who an account is for. Because this reads the owner's own line (0001: Tier 1 pages do not invite under-13 learners to sign up), it was asked, not assumed.

Until billing, re-takes are open to everyone, so neither DG5 rule costs anything now. Exempting rushed takes would hand a free re-take to anyone who answers fast on purpose. Capping "Start over" needs unfinished runs to sync to the account, and today they stay on the device. The billing release settles it together with the entitlement check.

## What this changes

- The design's 17 cards can start: D-1 to D-18, with D-15 retired (US English U5b, 2a580e3, already did it). The design is `~/.claude/plans/diagnostic-design.md`; its section 13 gives the order:
  - D-1, then D-2. D-3 any time, then D-4 (the owner applies the migration live), then D-5 with D-6 in the same deploy. D-7 after D-2. D-8 any time, then D-9, then D-10; D-9 also waits on D-1, D-2, D-5 and D-7. D-16 after D-1, then D-11 after D-2 and D-16, then D-12 after D-10 and D-11, then D-18 after D-7 and D-12. D-13 after D-12 and D-18. D-17 any time, before D-14. D-14 last, once D-17 has put the age line on account.html.
  - Risky cards (D-3, D-5, D-7, D-9) get a second review on a different model family.
  - D-9 is three cards, after its threat-model review (2026-10-09) found it far over one card and untested until D-13: D-9a the pure run shell (`readRun`, the validator for a damaged stored run; `newRun`, `deal`, `withTake`, `takeId`, `runOf`), D-9b taking the check, D-9c the gate, `?again` and D-9's own browser cases. The grader is at version 3, so D-9 handles every `unread` reason and `form` from the start.
- DG1 lands in D-4 (the `user_state.diag` column and the written exception to the reset rule), D-5 (key wiring, keeping the result through sync after a reset, the confirmation text) and D-6 (privacy text and the button label).
- DG2 lands in D-1 (scoring, the "close" flag, `DIAG_FORM_RIGHT = false`) and D-10 (the "close" wording). The check ships on the current grader and needs no change when T6 lands.
- DG3 lands in D-1 (the placement rule with the hold) and D-10 (the held-Geometry row on the result page).
- DG4 adds no card. The shell card the design kept in reserve (section 9) is not built.
- DG5 adds nothing now. The billing release starts from it: `?again` checks the entitlement, a finished take counts, Start over stays free.

## What it requires that did not exist before

- The owner applies the `diag` migration to the live project before D-5 merges (a manual gate), and approves the wording in D-6 (privacy text), D-10 (result and Prep page) and D-17 (the account page's age line).
- Two new pages, `diagnostic.html` and `prep.html`, and one synced key, `bm.diag.v1`, all in the design.

## Status

Decided by the owner, 2026-10-07, on the decisions page: the recommended option on all five questions, with no notes. The design (round 4) records the same defaults in its owner-questions section.
