# 0001: Audience and tier

## Decision

The lead audience is homeschool families. The parent buys. Some learners will be under 13, so accounts are designed for that from the start (a design assumption, not a measured figure). High-schoolers preparing for the SAT or ACT, and adult or community-college students facing Accuplacer or ALEKS PPL, are named secondary audiences: they get explicit exam modes and skill tags, never the lead message.

The course assumes a learner ready to start algebra. The scope page says so and names the pre-algebra skills the gate-skill packs add.

**Free, with no account needed:** every chapter, every exercise with every clue and solution, the Arena, the eight gate-skill packs, the diagnostic taken once and the plan it gives. Also free: a parent account, linking a learner, an under-13 profile, and reading that learner's progress page. Without an account, one browser holds one learner; a family sharing one device needs an account per learner, or a browser profile each until parent-managed accounts ship.

**Prep, one paid tier,** sells only what the free course does not do: diagnostic re-takes, exam mode, parent reports (a weekly report, a shareable read-only progress link, a per-part completion record) and the AI tutor. About $9.99 to $14.99 a month, re-checked against the market before launch. The earned currency is never purchasable (master plan guardrail).

Until billing ships, exam mode and diagnostic re-takes are open to everyone, with no flag; the billing release adds the entitlement check.

## Why

The assessment (section 3) shows homeschool growing and buying digital subscriptions, and that parents expect reports, a transcript-ready record and, increasingly, accreditation. Every segment wants to know what to do next and how far along they are. SAT, ACT and placement tests are gates the same learner meets later, so they stay in scope as modes, not as the pitch. Free with no account means no child needs a parent's card to learn.

## What this changes

Master plan (`~/.claude/plans/i-want-you-to-snug-willow.md`, section 5):

- R2 item 14 (typed core, starting with the grader) comes first. Item 18 (hint pipeline) joins Tier 1.
- Items 15, 16, 17, 19 and 20, then R3 and R4, move to Tier 3. The diagnostic does not wait for the event log: it stores its result in its own synced key and seeds the existing per-section review boxes (`src/learn/recall.ts`); when item 15 arrives it reads that seed as its prior. Leagues wait for the age policy.
- R5 item 26 (billing) moves to Tier 2. Its entitlement gates all four Prep features. Item 27 (tutor) stays last, behind `tutor.enabled = false`. Item 28 keeps its age-policy line and gains a check that the tutor is never offered to a learner profile without a parent's consent.

Assessment (`~/.claude/plans/give-me-an-assessment-luminous-minsky.md`, section 4):

- Tier 1 is unchanged in content. Settled here so no item reopens it:
  - Skills carry one Common Core code from grade 6 through high school, a course band (pre-algebra, Algebra 1, Geometry, Algebra 2), and tags for SAT, ACT, Accuplacer QAS/AAF and ALEKS PPL.
  - The diagnostic's band is that course band, never a predicted test score. "Once" means once per browser without an account and once per account after sign-in; a result taken before sign-in merges like other progress; a learner who clears storage can take it again, and that is accepted. A second attempt shows the Prep page.
  - Exam mode: SAT style (44 questions, 70 minutes, two modules), ACT 2025 style (45 questions, 4 choices), placement style (about 30 questions, Accuplacer and ALEKS PPL mix). Reports show questions right and percent by domain, never a predicted SAT, ACT or placement score.
  - Chapter prose and exercises are rewritten once to US spelling and dollars; metric units stay. The locale toggle covers UI strings only. Generated hints are in US English.
  - The packs appear on the scope page beside the 76 Lang sections, and the study plan may point to them.
- Tier 2 gains parent-managed accounts beside item 9 (legal) and before item 11 (parent view), replacing item 9's "13+ and parents buy". Item 8 (email delivery) precedes billing. Item 11 ships with billing.
- Until parent-managed accounts ship, the account page says an account holder must be 13 or older or the account must be made by a parent, and Tier 1 pages do not invite under-13 learners to sign up.

## What it requires that did not exist before

- `docs/`; this note creates it.
- Pages: a parent page (link a learner, create a profile, reports, download and delete a learner's data); a scope-and-sequence page listing the 76 sections and the packs by skill and course band; a Prep page naming the four features and the price; consent at sign-up; terms, refund, privacy and age policy.
- The completion record says what it is: browser-graded work from a course whose answer keys are in the page source, not an accredited credit.
- Account shapes: parent; learner under a parent; adult learner, unchanged. An under-13 learner is a profile under the parent's account, switched to on the account page, with no email, password or sign-in identity of their own (today every sign-in path needs an email or a Google or GitHub account, `assets/account.js`). The parent can download and delete a linked learner's data; deleting the parent account deletes its profiles.
- Data: `supabase/schema.sql` links no two users today. Needed: a guardian link, row-level security so the parent reads the learner's rows, an entitlement on the paying parent that linked learners inherit, an under-13 flag, and `src/data/skills.ts`.
- Policies: COPPA handling for under-13 profiles; `about.html#progress`, the only privacy text today, rewritten to say what a parent sees.
- Flags for Prep and parent accounts in `assets/config.js`, each a row in OPERATIONS.md section 6, named by the release that adds them. Custom SMTP, Stripe, a paid Supabase plan and Edge Functions.

## Open questions

Each can wait past Tier 1.

- Accreditation, and whether to pursue it: owner, by the end of Tier 2.
- Final price and an annual option: owner, at the go-live checklist (R5 item 28).
- One subscription for several children: owner, before the parent-account design review (Tier 2).
- Verifiable parental consent, or only a profile under the parent's account: owner, before the age-policy page (Tier 2).
- Which transcript course names each Part and pack maps to (Algebra 1, Geometry, Algebra 2): owner, before the completion record is designed (Tier 2 item 11).
- What counts as completing a part on the record (which exercises, what score, whether assisted solves count, whether dates and time on task show): owner, same time.
- Whether an under-13 profile may use the tutor, and what the parent consents to about a child's typed answers reaching Anthropic: owner, before the age-policy page and again at R5 item 28.

## Status

Proposed, 2026-10-06. Decided by the owner: "homeschool without ignoring SAT/ACT or placement and course stays free with paid prep tier". Drafted from three angles, judged, and checked by three adversarial passes against the repo and both plans in the same session; the owner's review is this note's pull request.
