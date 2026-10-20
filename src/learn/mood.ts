/* The companion's mood: how Mochi, the axolotl who keeps the learner company, answers what
   just happened, as steps (a mood from the sheet's nine, held for a time) and a sparse caption.
   The companion UI reads it: arrival() when a page opens, react() for each bus event the
   caller maps to a Recent, idleMood()/wake() for the quiet between events, and the throttle to
   keep captions rare. It never touches the page or anything saved, never speaks of the streak,
   and never scolds: Mochi is thoughtful when an answer misses and glad when it lands, a quiet
   learner gets a welcome and not a reproach, and even the boss is the one Mochi squares up to,
   never the learner. The learner reads it as a face; the captions are rare and short.

   react() returns reaction null to mean "leave the companion as it is"; REST means "relax now".
   The UI plays a reaction's steps in order (each holds its ms) and then settles to idle.

   Pure: everything comes in as plain data, so the tests can hand it any state. */

/* the one place to tune the timing (ms) */
export const FAST_MS = 5000;            // a first try faster than this is a surprise
export const SURPRISE_MS = 1500;
export const SAD_MS = 2000;
export const HOLD_MS = 6000;
export const LONG_HOLD_MS = 12000;
export const SHORT_MS = 3000;
export const THINK_AFTER_MS = 8000;     // a focused field with no input this long: thinking
export const SLEEPY_AFTER_MS = 60000;
export const SLEEP_AFTER_MS = 120000;
export const RUN_EXCITED = 3;           // correct answers in a row that turn happy into excited

export type Mood = "idle" | "happy" | "excited" | "sad" | "angry" | "surprised" | "thinking" | "sleepy" | "sleeping";

/** the order of the stills in Mochi's sheet (the columns of models/mochi/mochi-<variant>-poses.webp) */
export const MOODS: readonly Mood[] = ["idle", "happy", "excited", "sad", "angry", "surprised", "thinking", "sleepy", "sleeping"];

export interface Step { mood: Mood; ms: number }

export interface MoodInput {
  /** today, "YYYY-MM-DD" (BMSite.dayKey()) */
  day: string;
  /** the latest day with XP > 0, or null when there is none */
  lastActiveDay: string | null;
  todayXp: number;
  goal: number;
  /** the first due review section, pre-resolved by the caller */
  due: { ref: string; title: string; href: string } | null;
  /** the combo meter's pip cap */
  comboMax: number;
  /** the worn form's name, e.g. "Pip" */
  formName: string;
  /** Study mode: the companion is hidden; arrival() returns content with no line and react() returns null */
  calm: boolean;
}

/** the subset of bus events (src/core/store.ts StoreChange) the model reads; the caller maps the bus payloads to these */
export type Recent =
  | { type: "attempt"; key: string; correct: boolean; tryNo: number; elapsedMs: number | null }
  | { type: "solved"; fresh: boolean }
  | { type: "stuck"; key: string; signal: string; offer: string }
  | { type: "opened" }
  | { type: "ladder" }
  | { type: "twin" }
  | { type: "xp"; goalMet: boolean }
  | { type: "combo"; pips: number; why: string }
  | { type: "encounter"; cue: string; hearts: number; fresh: boolean; set: string; state: string }
  | { type: "chapterDone"; fresh: boolean }
  | { type: "level"; level: number }
  | { type: "achievement"; title: string }
  | { type: "form"; from: string; to: string }
  | { type: "arena"; phase: "start" | "answer" | "end"; correct?: boolean; pass?: boolean; timeout?: boolean };

export interface Reaction {
  /** played in order, each held for its ms; the last one's ms is how long the line stays */
  steps: readonly Step[];
  line: string | null;
  /** names the caption so the caller can dedupe */
  key: string | null;
  href: string | null;
}

/** wrong attempts per exercise key, this visit */
export interface MoodMemory {
  misses: Readonly<Record<string, number>>;
  /** exercise keys the companion has already nudged toward a clue, this visit */
  nudged: Readonly<Record<string, true>>;
  /** correct answers in a row this page; a miss resets it; never voiced */
  run: number;
  /** encounter sets already seen active, so Mochi squares up to a boss once */
  bosses: Readonly<Record<string, true>>;
}
export const EMPTY_MEMORY: MoodMemory = Object.freeze({ misses: Object.freeze({}), nudged: Object.freeze({}), run: 0, bosses: Object.freeze({}) });

/** at most one caption per SAY_GAP_MS, and none within QUIET_AFTER_VERDICT_MS of a graded answer (the exercise's own feedback speaks first) */
export const SAY_GAP_MS = 2600;
export const QUIET_AFTER_VERDICT_MS = 4000;

/** ms timestamps, 0 = never */
export interface Throttle { lastSaid: number; lastVerdict: number }
export const EMPTY_THROTTLE: Throttle = Object.freeze({ lastSaid: 0, lastVerdict: 0 });

export function noteVerdict(t: Throttle, now: number): Throttle {
  return { lastSaid: t.lastSaid, lastVerdict: now };
}
export function canSay(t: Throttle, now: number): boolean {
  /* a clock that went backwards counts as allowed */
  const gap = t.lastSaid === 0 || now < t.lastSaid || now - t.lastSaid >= SAY_GAP_MS;
  const quiet = t.lastVerdict === 0 || now < t.lastVerdict || now - t.lastVerdict >= QUIET_AFTER_VERDICT_MS;
  return gap && quiet;
}
export function said(t: Throttle, now: number): Throttle {
  return { lastSaid: now, lastVerdict: t.lastVerdict };
}

/** whole days from day a to day b, both "YYYY-MM-DD" */
export function daysBetween(a: string, b: string): number {
  const at = (s: string): number => {
    const p = s.split("-");
    return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  };
  return Math.round((at(b) - at(a)) / 86400000);
}

export function introLine(_formName: string): string {
  return "This is Mochi, your companion. It keeps you company while you work.";
}

/** lines that wait for a quiet moment hold longest */
const LONG_KEYS = ["due", "back", "form", "chapter", "regroup", "goal", "level", "boss", "stuck", "arena-end"];

function make(steps: readonly Step[], line: string | null, key: string | null, href: string | null): Reaction {
  return { steps, line, key, href };
}
const st = (mood: Mood, ms: number): Step => ({ mood, ms });
export const REST: readonly Step[] = Object.freeze([st("idle", 0)]);
const rest = (): Reaction => make(REST, null, null, null);

/** the mood while nothing is happening: asleep after a long quiet, thinking over a focused field */
export function idleMood(msSinceInput: number, fieldFocused: boolean): Mood {
  if (msSinceInput >= SLEEP_AFTER_MS) return "sleeping";
  if (msSinceInput >= SLEEPY_AFTER_MS) return "sleepy";
  if (fieldFocused && msSinceInput >= THINK_AFTER_MS) return "thinking";
  return "idle";
}

/** ms until the next threshold would change idleMood's answer, or null when none is left */
export function nextIdleAt(msSinceInput: number, fieldFocused: boolean): number | null {
  const marks = fieldFocused ? [THINK_AFTER_MS, SLEEPY_AFTER_MS, SLEEP_AFTER_MS] : [SLEEPY_AFTER_MS, SLEEP_AFTER_MS];
  for (const m of marks) if (msSinceInput < m) return m - msSinceInput;
  return null;
}

/** input after a nap: a start of surprise, then idle */
export function wake(prev: Mood): Reaction | null {
  return prev === "sleepy" || prev === "sleeping" ? make([st("surprised", SURPRISE_MS)], null, null, null) : null;
}

export function arrival(input: MoodInput): Reaction {
  if (input.calm) return rest();
  if (input.due) return make([st("thinking", LONG_HOLD_MS)], "I'd like to look at " + input.due.title + " again.", "due", input.due.href);
  if (input.lastActiveDay && daysBetween(input.lastActiveDay, input.day) >= 3) {
    return make([st("sleepy", LONG_HOLD_MS)], "Good to see you.", "back", null);
  }
  return rest();
}

type Out = { memory: MoodMemory; reaction: Reaction | null };

/** reaction null: leave the companion as it is; REST: relax it now */
export function react(memory: MoodMemory, recent: Recent, input: MoodInput): Out {
  const none: Out = { memory, reaction: null };
  if (input.calm) return none;
  const say = (steps: Step[], line: string | null, key: string | null, m: MoodMemory = memory): Out => {
    /* a line that waits for a quiet moment holds its last step for the long hold */
    if (key && LONG_KEYS.includes(key) && steps.length) {
      const last = steps[steps.length - 1];
      steps = steps.slice(0, -1).concat(st(last.mood, Math.max(last.ms, LONG_HOLD_MS)));
    }
    return { memory: m, reaction: make(steps, line, key, null) };
  };
  const keep = (over: Partial<MoodMemory>): MoodMemory => ({
    misses: over.misses ?? memory.misses, nudged: over.nudged ?? memory.nudged,
    run: over.run ?? memory.run, bosses: over.bosses ?? memory.bosses
  });
  /* a correct answer: the run grows; from RUN_EXCITED on, glad becomes excited */
  const gladOf = (m: MoodMemory): Mood => (m.run >= RUN_EXCITED ? "excited" : "happy");
  const missed = (): MoodMemory => (memory.run === 0 ? memory : keep({ run: 0 }));

  switch (recent.type) {
    case "attempt": {
      if (recent.correct) {
        const m = keep({ run: memory.run + 1 });
        const glad = gladOf(m);
        if (recent.tryNo === 1) {
          const fast = recent.elapsedMs !== null && recent.elapsedMs !== undefined && recent.elapsedMs < FAST_MS;
          const steps = fast ? [st("surprised", SURPRISE_MS), st(glad, HOLD_MS - SURPRISE_MS)] : [st(glad, HOLD_MS)];
          return say(steps, "First try.", "first-try", m);
        }
        return say([st(glad, HOLD_MS)], null, null, m);
      }
      const seen = Object.hasOwn(memory.misses, recent.key) ? memory.misses[recent.key] : 0;
      const n = seen + 1;
      const misses: Record<string, number> = Object.create(null);
      for (const k of Object.keys(memory.misses)) misses[k] = memory.misses[k];
      misses[recent.key] = n;
      const next = keep({ misses, run: 0 });
      if (n === 2) return say([st("sad", SAD_MS), st("thinking", HOLD_MS)], "Let's look again.", "again", next);
      return say([st("thinking", HOLD_MS)], null, null, next);
    }
    case "stuck": {
      /* only a learner sitting on a miss; the attempt path and the card cover the other signals */
      if (recent.signal !== "idle") return none;
      if (Object.hasOwn(memory.nudged, recent.key)) return none;
      /* "Let's look again." was already said for this exercise */
      if (Object.hasOwn(memory.misses, recent.key) && memory.misses[recent.key] >= 2) return none;
      const line = recent.offer === "clue" ? "There's a clue below." : recent.offer === "steps" ? "The worked steps are below." : null;
      if (!line) return none;
      const nudged: Record<string, true> = Object.create(null);
      for (const k of Object.keys(memory.nudged)) nudged[k] = true;
      nudged[recent.key] = true;
      return say([st("thinking", HOLD_MS)], line, "stuck", keep({ nudged }));
    }
    case "solved":
      /* the attempt's own reaction is already playing; cutting it short would be rude */
      return none;
    case "opened":
    case "ladder":
    case "twin":
      return say([st("thinking", SHORT_MS)], null, null);
    case "xp":
      return recent.goalMet ? say([st("happy", LONG_HOLD_MS)], "That's today's goal.", "goal") : none;
    case "combo":
      return recent.why === "max" || recent.pips >= input.comboMax ? say([st("excited", SHORT_MS)], null, null) : none;
    case "encounter": {
      if (!recent.fresh) return none;
      if (recent.cue === "down") return say([st("excited", LONG_HOLD_MS)], "Boss down.", "boss");
      if (recent.cue === "ward") return say([st("happy", SHORT_MS)], null, null);
      if (recent.cue === "heart") return say([st("angry", SAD_MS)], null, null);
      if (recent.hearts === 0) return say([st("thinking", LONG_HOLD_MS)], "Take a breath. The section is just above.", "regroup");
      if (recent.state === "active" && !Object.hasOwn(memory.bosses, recent.set)) {
        const bosses: Record<string, true> = Object.create(null);
        for (const k of Object.keys(memory.bosses)) bosses[k] = true;
        bosses[recent.set] = true;
        /* Mochi squares up to the boss, never to the learner */
        return say([st("angry", SURPRISE_MS)], null, null, keep({ bosses }));
      }
      return none;
    }
    case "chapterDone":
      return recent.fresh ? say([st("excited", LONG_HOLD_MS)], "Chapter done!", "chapter") : none;
    case "level":
      return say([st("excited", LONG_HOLD_MS)], "Level " + recent.level + ".", "level");
    case "achievement":
      return say([st("happy", SHORT_MS)], null, null);
    case "arena":
      /* a run has many answers: a mood for each, a word only at the end, and nothing about score, hearts or time */
      if (recent.phase === "end") return say([st("happy", LONG_HOLD_MS)], "Run done.", "arena-end");
      if (recent.phase === "answer" && recent.correct && !recent.pass && !recent.timeout) {
        const m = keep({ run: memory.run + 1 });
        return say([st(gladOf(m), SHORT_MS)], null, null, m);
      }
      return say([st("thinking", SHORT_MS)], null, null, recent.phase === "answer" ? missed() : memory);
    case "form":
      return say([st("excited", LONG_HOLD_MS)], recent.from + " became " + recent.to + "!", "form");
  }
  const _never: never = recent;
  return _never;
}
