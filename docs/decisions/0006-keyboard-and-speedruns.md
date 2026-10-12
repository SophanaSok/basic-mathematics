# 0006: Keyboard-first use, speed-run rewards and the Daily board

## Decision

Three linked choices, decided by the owner on 2026-10-11.

**The keyboard layer.** Vim-flavoured single keys where they fit and plain mnemonic keys elsewhere.
- The cursor is the focus, so screen readers, the 3D map and the settings sheet follow it for free.
- Insert mode leaves typing alone; only Escape is taken there.
- An open dialog and an Arena run keep their own keys. A link the reader tabbed to keeps its native Enter.
- `h` and `s` act only on a selected card, never from the page, because a clue or solution changes what a card pays.
- `/` and `'` stay unbound so Firefox Quick Find keeps working; `/` is reserved for a go-to palette.
- The cheat sheet is a `<dialog>` built in code, not shell markup, so the shell lock stays untouched.
- The tip shows on the first Tab, not on load.
- The Keyboard shortcuts switch (the `keys` pref) defaults to on.

**Speed rewards live in the Arena only.** This follows the repo's achievement rule in `assets/game.js` and the master plan's guardrail to reward behavior that causes learning.
- A fastest clean run per mode: every answer right first time, ranked, played to the end. It syncs with a lowest-time merge law.
- Achievements: Under par, Personal best and Hands off the mouse.
- No XP for speed.
- The owner was offered, and declined, timing chapter practice sets, which would invite guessing.

**The leaderboard is a Daily board.**
- One board per calendar day, for the Daily mode, ranked by score then fastest clean time.
- Opt-in per account. The name is generated on the server from a one-way hash of the user and the day.
- Top 20 plus the caller's own row; hidden until three people have played.
- One row per user per day, first submission wins.
- No XP, currency or HUD rank hangs on it. A kill switch, `BM_CONFIG.board`, turns it off.

## Why

Keyboard use is the fastest way through a page of exercises and costs a screen-reader user nothing when the cursor is the focus. Speed in practice sets would reward guessing; the Arena already runs against a clock and a deck, so a clean fast run there rewards fluency. The board is a daily, opt-in, anonymous comparison with nothing at stake.

Two facts, stated plainly:
- The Daily shares a seed per day but draws from each learner's own deck, so the board compares pace and accuracy on the same day, not identical questions.
- Scores and times are client-reported until the event log (R2) syncs per-answer events. The server bounds-checks them, and a forged row buys only a name on a list.

## What this changes

- Cards K-10a to K-10g. K-10a to K-10d are the keyboard layer (the pure keymap, the DOM half, the pages, the switch and these words). K-10e is the Arena rewards. K-10f and K-10g are the board, database first, applied by the owner before the client merges.
- A `keys` pref in `bm.prefs.v1`, a switch in the settings sheet, and a keyboard section in `about.html`.

## What it requires that did not exist before

- `src/ui/keymap.ts` and `src/ui/keys.ts`, mounted by every entry.
- A per-mode fastest-clean-run record with a lowest-time merge law.
- A server-side Daily board: its table, the name hash, the bounds checks and the `BM_CONFIG.board` switch.

## Status

Decided by the owner, 2026-10-11: the keyboard layer as described, speed rewards in the Arena only, and the opt-in Daily board.
