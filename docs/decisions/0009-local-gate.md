# 0009: The deploy gate runs on the dev box; Actions runs on request

## Decision

Decided by the owner on 2026-10-16 (plan `let-s-re-evaluate-gh-actions`; PRs #180, #181, #182).

**The browser checks run here, before a merge, not on GitHub Actions.** `npm run gate`
(`tools/gate.js`) runs what CI's `build` and `browser` jobs ran: `npm run check`, the migrations
check against `origin/main`, the build and its checks, then every part of
`tools/check-browser.js --parts` side by side, the WebGL checks when a 3D path changed, and the
pgTAP suite when a Supabase path changed. It needs a clean tree that contains `origin/main`, and
it writes a receipt, `.git/gate/<tree sha>.json`, saying which tree passed. A `--part` run writes
none.

**A merge needs the receipt.** The merge guard (`~/.claude/hooks/gh-merge-guard.sh`, a
PreToolUse hook outside the repository) refuses `gh pr merge` unless a passing receipt exists for
the pull request's head tree, the head contains `origin/main`, and every check GitHub reports
has passed. A pull request that changes only Markdown or `docs/` needs no receipt.

**Actions runs on request.** A pull request starts no run until it is given the label `ci`
(`gh pr edit <n> --add-label ci`; remove and add again to re-run), and then runs everything with
a Cloudflare preview. A push to main runs `build`, `pages-source` and the deploys, about 4
minutes, and accepts the skipped `browser` job on a push alone. Run workflow still runs
everything. `tools/check-ci.js` holds the shape (`label`, `gate`): the deploys wait for `build`,
the browser parts where they ran, and never follow a cancellation; `build` keeps `npm run check`,
`npm run build` and `npm run check:dist`.

## Why

Every card cost two or three full runs: 11 jobs, about 45 job-minutes and 11 to 12 minutes of
wall time each (runs 38859933138 and 38857637066, read with `gh run view` on 2026-10-16).
`gh run list` on 2026-10-16 showed 190 runs since 2026-10-12 for 75 merges (`git log --merges`),
about 1,900 job-minutes a day. The repository is public, so none of it is billed (the timing
API reports zero billable time), but the account's Actions budget of $0 with "Stop usage" on
still stopped every run once (OPERATIONS.md, the minutes row), and GitHub's free plan gives a
private repository 2,000 minutes a month, about a day at that rate. Each session also waited in
the foreground for a run that re-checked what this machine checks faster: the gate takes about 9
minutes here with the six parts at once, `axe` the floor at about 7.

The 9 failed runs in those four days, by failing job: `browser` parts four times, `npm run
check`, `npm run build` and `check:dist` once each, all of them checks `npm run check:all` runs
locally, and `actions/deploy-pages` twice, which no test covers. The first gate run with the SQL
stage found a defect the SQL workflow had not shown since the fresh-start migration merged
(#182).

## What this costs (accepted by the owner)

- A merge made outside the guard (the web button, a plain terminal) deploys after `build` alone.
  Main has no branch protection, by the earlier decision that a required check would hold a
  prose-only pull request forever.
- The receipt is a file the same user could write by hand. The guard never claimed to stop a
  deliberate act; it stops a merge the session merely believes is safe, and the tree key means an
  edit after the gate has no receipt.
- The gate tests `HEAD`, which must contain `origin/main`, where a pull-request run tested the
  merge commit. The guard re-checks the ancestry at merge time; a short window remains between
  that check and the merge.
- This box runs Node 26 against `.nvmrc`'s 24; the gate says so and does not block. The push to
  main builds and checks on 24 before anything deploys, but the browser checks never run on 24
  unless a run is asked for with the label.
- The gate replays what the parts do on a runner, not the runner's environment: no fresh
  Chromium install, no `npm ci` unless the package files changed (`npm ls` otherwise).
- The guard and the receipts live on this machine (`~/.claude/hooks`, the repository's `.git`).
  A fresh clone or another box has neither until the hook is installed and a gate has run there.
- Every other open pull request must merge main and run the gate again (about 9 minutes) after
  each merge, since the guard requires the head to contain `origin/main`.
- A pull request without the label gets no Cloudflare preview and no Actions check at all.
- Anyone with triage rights or above can add the label and start a full run with secrets (a
  fork's pull request still gets none; the `cloudflare` job refuses forks).

## Follow-ups

- `tools/sql-test.js` should tell the suite which path it ran (a GUC), so the suite asserts the
  path instead of reading it from `private.once`, and the schema path asserts the table is empty;
  the suite's header still describes only the migration path.
- Three places decide that a Markdown-and-`docs/`-only change is outside the build, and they must
  stay in step: `paths-ignore` on both events in `ci.yml` (`check-ci.js` holds it), and the
  guard's file test. A change to one is a change to all three.
