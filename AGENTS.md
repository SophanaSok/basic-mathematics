# basic-mathematics — rules for agents

One file for every tool: OpenCode reads it directly, Claude Code through `CLAUDE.md`
(`@AGENTS.md`). Keep it under ~100 lines. Decisions go in `docs/decisions/`, plans in
`~/.claude/plans/` (the master plan is `i-want-you-to-snug-willow.md`).

## What this is
A free Basic Mathematics course site (Lang's book, chapter pages with graded
exercises, a 3D world and an account/sync layer) served from
`https://learn.groundupmath.org`. The domain is `groundupmath.org`; copy names and
paths from this file, never retype them.
- Stack: Vite + TypeScript, Vitest, Playwright, Three.js, KaTeX, Supabase.
- Run: `npm run dev`
- Test: `npm run check` (fast, ~2 min) · `npm run gate` (the deploy gate here, ~9 min, writes the receipt a merge needs) · `npm run check:all` (the same, serial, no receipt)

## Which model does what
The main session is the judge; subagents do the bounded work. Every task card has a
runnable done-when, and that is what makes a weaker implementer safe.

| Model | Role | Work |
|---|---|---|
| Opus (main session) | orchestrate, judge | briefs and task cards; threat-model design reviews for risky items; grader and verdict logic in `src/core/answer/`; second reviewer on risky cards; fix passes when a finding survives; merge decisions; `OPERATIONS.md` procedures |
| Sonnet (`implementer`, `reviewer`) | build, review | cards of ≤5 files and ~2h with a runnable done-when; tests from a spec; wording edits guarded by the us-english lock and golden file; ADR drafts; tooling upkeep; commit messages; first reviewer on every card, both reviewers on ordinary cards |
| Haiku (`runner`, Explore) | search, run, report | code search; running npm scripts and returning only failures; moving `DEFAULT_BASE` in `tools/lib/site.js` after question text changes; worktree and branch cleanup; collecting `git log` and PR state |
| Fable | owner's request or orchestrator's call | design judge work the owner asks for; a card that has failed twice on Opus; work that would greatly benefit (below) |

**Risky** = reads untrusted input or touches accounts, sync, money, leagues, currency
or gates. Risky items get a threat-model design review before implementation and an
Opus second reviewer.

Escalate by failure count, not mood: a second failure on the same card means split
the card or hand it to Opus, never a third retry on Sonnet.

The orchestrator may call Fable (`model: "fable"` on the Agent call) without asking
when a wrong call would be costly and no runnable check would catch it: a threat-model
design review on a risky item, settling conflicting designs, or a root cause Opus has
not found after a real attempt. Never for building or reviewing an ordinary card. Say
in one line which task and why before launching, and name each Fable use in the PR body.

## The loop (one card per session)
1. Brief the `implementer` with the card id, the files it may touch, the done-when
   command, and confirmed names and paths. It edits in a worktree on a topic branch,
   runs the done-when and `npm run check`, and never commits.
2. Read the diff. Commit on the topic branch and push it (non-main pushes are
   allowed; main, force and delete pushes are denied in `.claude/settings.local.json`).
   The `runner` then runs `npm run gate` in the worktree (once, foreground, ~9 min) in
   parallel with the reviews; Actions runs nothing on the pull request unless it is given
   the label `ci`.
3. Two independent `reviewer` runs, each given the diff and the brief, not the
   conversation. Reviewers run targeted tests only. On a risky card the second
   reviewer runs with `model: opus`.
4. Blockers and majors get a fix pass now, then the `runner` runs
   `npm run gate` again (the tree changed, so the receipt must too).
   Minor-only findings roll into the next card's brief.
5. Merge through a PR once the gate receipt exists for the pushed head (`npm run gate`
   writes `.git/gate/<tree>.json`; the merge guard in `~/.claude/hooks/gh-merge-guard.sh`,
   a PreToolUse hook in `~/.claude/settings.json`, refuses `gh pr merge` without one, when
   main has moved since, or when any check on GitHub failed or is still running). Ask for a
   full Actions run with `gh pr edit <n> --add-label ci` when the card is risky, touches
   `.github/workflows/`, `tools/check-ci.js`, `tools/check-browser.js`, `tools/gate.js` or
   Playwright, when the gate could not run here, or when the PR comes from a fork; then also
   wait for it in the foreground: `gh pr checks <n> --watch` or `gh run watch <id>
   --exit-status` exiting 0 as a tool result in this session, never a background command or
   a completion notice. Then remove the worktree and delete the local branch in the same
   session (GitHub deletes the remote branch on merge).

## Budget rules
- One implementer, two reviewers, a fix pass only when something survives. No critic
  loops, judge panels or four-reviewer fan-outs unless the owner asks.
- Say what a workflow will cost in agents before launching it.
- Do small edits in the main session rather than spawning an agent.
- Raw test output never enters the main context: the `runner` summarises it.
- Commit subject on one line, short body; the reasoning lives in `docs/decisions/`.

## Hard invariants
- Generators own their output (`data/gen/`): change the generator and re-run.
- Question text changes move the progress base (`DEFAULT_BASE` in
  `tools/lib/site.js`) in the same PR, pointing at the content commit.
- The form models (`public/models/forms/`, `src/data/form-models.ts`) are what `npm run gen:forms`
  writes from `tools/art/forms/`: edit the scripts, re-run, commit the outputs.
- `tutor.enabled` stays `false` until the owner completes the go-live checklist.
- Secrets live only in `.env` (gitignored). Never read, print or paste it.

## Commits
`feat:` `fix:` `docs:` `chore:` `test:` plus the card id when there is one.
