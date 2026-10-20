# 0012: The companion

## Decision

Decided by the owner on 2026-10-19.

**The form is the learner's companion** (superseded by 0013: Mochi has the slot now, the rest of this record stands). On every chapter page (chapters, the interlude, the packs) it stands in the sidebar as a 2D still and answers what happens.
- The still comes from the form's pose sheet, `public/models/forms/form-N-poses.webp`: six stills (rest, curious, delighted, steady, sleepy, waiting), rendered by the Blender pipeline from clip frames and three hand-keyed render-time poses. No Three.js and no model chunk load on chapter pages.
- A pure mood model, `src/learn/mood.ts`, picks the mood: content, curious, delighted, steady, waiting, sleepy.
- Triggers: a first-try correct answer, a second miss on one exercise, today's goal met, a boss down, a chapter done, a level, a new form. A heart lost and a Regroup read steady. A due review on arrival reads waiting. Three or more days away reads sleepy.
- Captions are sparse: one per 2.6 s, and an answer's own line is said at once. A line from what follows within 4 s of a verdict waits for a quiet moment if it is one of the waiting kinds (a due review, a return, a new form, a chapter done, a Regroup, the day's goal, a level, a boss; one slot, the latest wins) and is dropped otherwise. A line holds 6 s, the waiting kinds 12 s, then the form is at rest. A line said during work is announced to the live region at low priority; the intro's and an arrival's lines are shown only, so the page's own first words keep the live region. An intro line shows once (`bm.run.v1.seen.companion`). A new stage gets a flourish.
- On the progress page the "Your form" panel shows the arrival line, and the model greets once a day when motion is allowed (`bm.run.v1.seen.greeted`): a bow when the mood is sleepy, a wave when it is content or waiting, nothing in any other mood and never during the evolution scene. A due review wins over days away, so a learner back after a week with a review due gets the due line and a wave.
- Never punitive: nothing decays, there is no streak talk (R3 owns the streak), no sound of its own, and no new store beyond two `seen` flags.
- Off: the Companion switch in the settings sheet (`prefs.companion`, unset means on), Study mode, and the `companion: "off"` kill switch in `assets/config.js`.
- Hidden in print, under the settings sheet, and while a narrow screen's field has focus; in forced-colors mode the still is hidden and the name and caption stay. The still is a `role=img` labelled with the form's name and its mood ("Pip, your form, delighted"); the captions said during work reach a screen reader through the live region at low priority (dropped first under load), the intro's and the arrival's do not. Nothing the companion says is the only way to learn something: the due review is on the progress page, the rest is encouragement.

## Why

The owner chose the game feel through a character present while the learner works, over polishing the 3D map, which one page shows for a few seconds. Most of the companion already existed: the stages, the sync, the models and the emotes. The audience (0001: homeschool families, learners under 13, adults facing placement tests) wants warm and brief, and easy to switch off.

## What this changes

- Cards C-1 to C-6: the mood model (C-1, `src/learn/mood.ts`), the pose sheets and their render kind (C-2a), their caps and rule (C-2b), the sidebar companion and its browser checks (C-3a, C-3b: `src/ui/companion.ts`, `tools/game/companion.test.js`), the preference, the kill switch and the sheet's switch (C-4a, C-4b), the progress page (C-5), and this record and the wording (C-6).
- The `pages` suite takes one exception for the sheets, which are images on chapter pages.
- New caps in `src/data/form-limits.ts`: `POSES_BYTES_MAX` 120 KB a sheet, at 1536x320.

## Threat model, stated plainly

- No network, no account path, no SQL.
- The sheet is a static public file.
- The two `seen` flags are device-local. The preference never syncs. A damaged store reads as on.
- Nothing the companion says comes from untrusted input; section titles come from the curriculum data.

## Deferred

- The Plain and Explore navigation modes (Part 2 of the owner's plan file, `~/.claude/plans/pasted-content-id-69bc-you-are-recursive-flask.md`, which also holds this feature's run log).
- A Part-hue sprite set.
- The Arena presence (done in 0013).
- A level-popover portrait.
- The `stuck` bus event.

The owner's defaults, taken with the approval: the poses come from existing clip frames first (three needed hand-keyed render-time poses after the eye test); the voice is short, warm and plain; the stage names Pip, Sprig, Wayfinder, Surveyor and Luminary stay; the companion is on by default.


## Status

Decided 2026-10-19. C-1 to C-5 shipped 2026-10-19; C-6 is this record.

Superseded in part by 0013 (2026-10-19): Mochi takes the companion slot; the form keeps the progress page, the unlock toast and the level popover.
