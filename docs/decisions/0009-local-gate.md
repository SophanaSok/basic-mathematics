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
wall time each. Between 2026-10-12 and 2026-10-16 that was 190 runs for 75 merges, about 1,900
job-minutes a day. The repository is public, so none of it is billed, but the account's Actions
budget of $0 with "Stop usage" on still stopped every run once, and a private repository's free
allowance would last about a day at that rate. Each session also waited in the foreground for a
run that re-checked what this machine checks faster: the gate takes about 9 minutes here with
the six parts at once, `axe` the floor at about 7.

Of the failures CI caught in those four days, every one was a check `npm run check:all` runs
locally; the two others were GitHub Pages deploy errors. The first gate run with the SQL stage
found a defect the SQL workflow had not shown since the fresh-start migration merged (#182).

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
- This box runs Node 26 against `.nvmrc`'s 24; the gate says so and does not block, because the
  push to main builds on 24 before anything deploys.
- The gate replays what the parts do on a runner, not the runner's environment: no fresh
  Chromium install, no `npm ci` unless the package files changed (`npm ls` otherwise).

## Follow-ups

- `tools/sql-test.js` should tell the suite which path it ran (a GUC), so the suite asserts the
  path instead of reading it from `private.once`, and the schema path asserts the table is empty.
- The three `.md`-only rules of the guard and `paths-ignore` must stay in step; `check-ci.js`
  holds the workflow half.
