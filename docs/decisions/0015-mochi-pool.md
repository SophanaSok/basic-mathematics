# 0015: Mochi's pool

## Decision

Decided by the owner on 2026-10-23.

**Caring for Mochi is the reward loop.** A Tamagotchi-style game around Mochi, the companion,
replaces the forms progression of 0007 and 0008. Clicking Mochi opens Mochi's pool: a larger
porthole with four needs shown as hearts, care acts, a shop, a wardrobe and a growth path. The
same pool sits inline on the progress page where "Your form" was.

- **Gentle drift, never punitive.** Four needs, each 0 to 5 hearts: Tummy (snacks), Play (a toy,
  the Arena, the Daily), Clean (a free act when the pool grows mossy), Spark (due reviews done on
  their day). Hearts drift down slowly over real time to a floor (Tummy 1 heart per 12 h to 1,
  Play 1 per 24 h to 1, Clean 1 per 24 h to 0, Spark 1 per 48 h to 1) and change only Mochi's
  pose and one caption. Nothing gets sick, stalls, dies or leaves; no reminders leave the page;
  no line blames the learner ("Mochi could use a snack", never "Mochi missed you").
- **Growth comes from good days.** A day scores one care point per need touched (at most 4) and
  only when the learner earned XP that day, so Mochi cannot grow without learning. Stages on the
  running total: Hatchling 0, Fry 8, Juvenile 24, Adult 56, Elder 120. A stage once reached never
  regresses. Stages show as growth morphs (gills, crest, tail) and scale, not new bodies; reaching
  one plays a `splash` once, skippable, and not under reduced motion.
- **The R3 economy lives in the pool.** 0011's facets are Mochi's currency, earned by the same
  deterministic ids (first strong on a section, medals, due reviews with the 25 a day cap, the
  worked-solution comparison, missions), never for twins, speed or the Daily board (0006), and
  never purchasable (0001). The shop sells snacks, toys, accessories for three sockets (head,
  back, tail) and pool decor at fixed facet prices, nothing time-limited, nothing random. The
  overdraft rule of 0011 Q4 stands: allowed after a merge, no new purchase while negative,
  nothing revoked. A new day grants one free pellet, so a learner with no facets can always feed.
- **One synced record, `bm.pet.v1`, its own `user_state` column `pet`.** Ledgers (`earned`,
  `spent`, `owned`, `grew`, `gift`) merge by union; `needs` and `wear` take the later `at`,
  bounded by `WEAR_AT_MAX`; `care` counters per day merge by max per leaf. There are no rollups,
  because a rollup on one device and the ids on another double-count: the record is bounded by
  deterministic rules over the merged key set only. Balance is derived, never stored.
  *Amended at X-1 (2026-10-23), after review:* the two ledgers are never pruned by time. The
  plan's windows (review earns and spends at 90 days) let the balance drift, since an earn could
  age out while the spend it paid for stayed, down to a lockout at a negative balance for good,
  against "nothing revoked"; so a balance is exact or it is nothing, and the ledgers are bounded
  by counts instead (ids worth nothing dropped, five review ids a day, a key cap on every map
  with the known keys never the ones cut). `care` and `gift` keep the newest 400 days. There is
  no snack bag either: feeding is a purchase in one act (a `feed:<day>:<item>:<device>:<k>`
  spend and the day's care counter), and the free daily pellet is a free feed recorded in
  `gift[day]`, so nothing bought on one device has to be found on another.
- **Click to enter.** The companion picture becomes a button on every layout, labelled "Mochi,
  your companion, <mood>. Open Mochi's pool". The pool is a modal dialog on chapter pages and the
  Arena (Escape and Close, focus returned) and an inline section on the progress page. It never
  opens by itself and is hidden under Study mode, print, calm and the `pet` kill switch. The
  sidebar stage is disposed while the dialog is open, so two avatars never live at once.
- **The forms go.** The five mecha models, the Blender pipeline under `tools/art/forms/`, the
  viewer, emotes, dialog, unlock toast, the level-popover portrait and the `form` bus event are
  removed. The map's marker becomes a procedural Mochi buoy. `bm.game.v1.form` is no longer a
  known merge field: the merge carries it through whole as an unknown field, so a stale `got`
  entry may resolve from one side. Harmless, the field is dead, and there are no real users.
- **Art stays scripted.** New clips `eat`, `play`, `nuzzle`, `splash`, growth morphs `GrowGills`,
  `GrowCrest`, `GrowTail`, socket bones `socket_head`, `socket_back`, `socket_tail` and small
  accessory GLBs come from the owner's Blender project through its deterministic build script
  and the existing site pack, repacked by `npm run gen:mochi` under the same caps (the GLB grows
  to about 1.11 MB of the 1.45 MB cap). Decor and algae are pixel-art sprites from
  `tools/gen-water.js`, layered between the water and Mochi.
- Kill switches `pet` (the pool and the button; earns keep accruing) and `shop` (0011).

## Why

The owner wants the game feel to come from looking after a creature with a face, not from a
rank-driven avatar. Research behind the shape: pet-nurturing learning games (My-Mini-Pet,
My-Pet v2) sustained effort and engagement, most for lower achievers; Finch's loop (goals earn
energy, energy grows the bird, a currency buys cosmetics, no penalty) is the closest
non-punitive analogue; dark-pattern enforcement on children's games targets guilt and purchase
pressure. So the needs are filled by learning, the floors keep a neglected Mochi merely
hungry-looking, growth requires learning days, and no money path exists.

## What this changes

- Supersedes 0007 and 0008 (the forms and their models), 0013's "the form keeps the progress
  page, the unlock toast and the level popover", and in 0011 Q5 (the shop lives in the pool, not
  beside "Your form") and the cosmetic slots (Mochi's head, back, tail and decor replace marker,
  trail, pennant and badge). 0011's wallet laws, amounts, guardrails and Q3/Q4 stand. Gates and
  streak freezes remain future R3 work; nothing here touches them.
- New: `src/learn/pet.ts` (pure: drift, care, growth, earns, balance, bag, prunes), `mergePet`
  in `src/sync/merge.ts` with a block in the 2000-case merge rule, the `pet` column and a
  `private.fresh_start` that names it, `src/ui/pet/` as the lazy chunk `bundle/pet.js` (loaded
  only on the click or on the progress page), `src/data/pet-items.ts` (the catalogue),
  `tools/game/pet.test.js`.
- Bus payloads that the earns need and that did not exist: a section on the event-log change,
  `due` and `set` on the Arena's `recorded` phase, new `compare` and `mission` events, a `pet`
  event.
- Removed: `public/models/forms/` (4.2 MB), `tools/art/forms/`, `tools/gen-forms.js`,
  `src/ui/forms*.ts`, `src/ui/form-*.ts`, `src/model/` (its `three.ts` type moves under
  `src/mochi/`), `src/world/forms.ts` and `form-scene.ts`, `src/core/forms.ts`,
  `src/data/forms.ts`, `form-models.ts`, `form-limits.ts`, the `form-models` rule.
- The plan with the card list and the full threat model:
  `~/.claude/plans/let-s-implement-a-full-serialized-whisper.md`.

## Threat model, stated plainly

- Fairness between devices: deterministic earn ids and union merges mean no cause pays twice
  and no merge loses a buy, a feed or a stage; later-wins fields can lose only hearts or an
  outfit choice. Property tests over two offline profiles hold the laws, with the prunes applied.
- A hostile client editing `bm.pet.v1` is accepted, as editing XP is today: facets buy only pet
  cosmetics, and the Daily board never reads the pet. The server stores what the browser writes,
  with no cap on the column, so the bounds are the client's prunes and key caps (X-1).
- Clock skew across devices: a care act stamps its `at` just after the stored one when that is
  later than now, so a device whose clock ran ahead cannot win every merge until that date and
  freeze a need (X-1, after review).
- Clock games: a future `at` reads as now and above `WEAR_AT_MAX` is ignored; moving the day
  gains at most four care points, and only on a day with XP.
- Children: no money path (a static rule keeps `pet` and facets out of every SQL write path and
  out of `assets/account.js` beyond the synced field list), no reminders, no sickness or death,
  wording pinned in the browser test. The pet follows a managed learner through `user_state`;
  nothing new leaves the account.
- Learner switch and reset: `pet` is in the synced field list, `clearLocal`, both Reset lists and
  `fresh_start`, so one device never shows one learner's Mochi to another.
- Learning is never blocked: the pool never opens by itself, closes on Escape, returns focus, and
  hides in Study mode, print and calm.

## Deferred

- Evolution branches by activity mix (a reviews-heavy Mochi, an Arena-heavy one).
- A night sleep schedule by local time.
- Mochi as the 3D map marker (the buoy is procedural).
- A pixelated Mochi pass; caustics; rivets (0014's list).
- Mini-games beyond Play; a parent's view of the pet; the achievements re-aim (R3-8); gates and
  streak freezes (R3).

## Status

Decided 2026-10-23. This record is card X-0; the removal cards R-1a to R-2 and the pet cards
X-1 to X-12 follow in the plan's order. The `pet` migration is applied live only after the
client that tolerates its absence is deployed.
