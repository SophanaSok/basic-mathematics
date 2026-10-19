/* The companion's mood: how the learner's form (Pip, Sprig, Wayfinder, Surveyor, Luminary)
   answers what just happened, as a mood, a pose from the form's pose sheet and a sparse
   caption. The companion UI reads it: arrival() when a page opens, react() for each bus
   event the caller maps to a Recent, and the throttle to keep captions rare. It never
   touches the page or anything saved, never speaks of the streak, and never scolds: a quiet
   learner gets a welcome, not a reproach.

   react() returns reaction null to mean "leave the companion as it is"; a content/rest
   reaction means "relax" (the pose and mood go back to rest).

   Pure: everything comes in as plain data, so the tests can hand it any state. */

export type Mood = "content" | "curious" | "delighted" | "steady" | "waiting" | "sleepy";
export type Pose = "rest" | "curious" | "delighted" | "steady" | "sleepy" | "waiting";

/** the order of the stills in a form's pose sheet (tools/art/forms/render.py draws them in this order) */
export const POSES: readonly Pose[] = ["rest", "curious", "delighted", "steady", "sleepy", "waiting"];

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
  | { type: "attempt"; key: string; correct: boolean; tryNo: number }
  | { type: "solved"; fresh: boolean }
  | { type: "stuck"; key: string; signal: string; offer: string }
  | { type: "opened" }
  | { type: "ladder" }
  | { type: "twin" }
  | { type: "xp"; goalMet: boolean }
  | { type: "combo"; pips: number; why: string }
  | { type: "encounter"; cue: string; hearts: number; fresh: boolean }
  | { type: "chapterDone"; fresh: boolean }
  | { type: "level"; level: number }
  | { type: "achievement"; title: string }
  | { type: "form"; from: string; to: string };

export interface Reaction {
  mood: Mood;
  pose: Pose;
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
}
export const EMPTY_MEMORY: MoodMemory = Object.freeze({ misses: Object.freeze({}), nudged: Object.freeze({}) });

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

export function introLine(formName: string): string {
  return "This is " + formName + ", your form. It keeps you company while you work.";
}

function make(mood: Mood, pose: Pose, line: string | null, key: string | null, href: string | null): Reaction {
  return { mood, pose, line, key, href };
}
const REST = (): Reaction => make("content", "rest", null, null, null);

export function arrival(input: MoodInput): Reaction {
  if (input.calm) return REST();
  if (input.due) return make("waiting", "waiting", "I'd like to look at " + input.due.title + " again.", "due", input.due.href);
  if (input.lastActiveDay && daysBetween(input.lastActiveDay, input.day) >= 3) {
    return make("sleepy", "sleepy", "Good to see you.", "back", null);
  }
  return REST();
}

/** reaction null: leave the companion as it is; a content/rest reaction: relax it */
export function react(memory: MoodMemory, recent: Recent, input: MoodInput): { memory: MoodMemory; reaction: Reaction | null } {
  const none: { memory: MoodMemory; reaction: Reaction | null } = { memory, reaction: null };
  if (input.calm) return none;
  const joy = (line: string | null, key: string | null): { memory: MoodMemory; reaction: Reaction | null } =>
    ({ memory, reaction: make("delighted", "delighted", line, key, null) });
  const calmly = (line: string | null, key: string | null): { memory: MoodMemory; reaction: Reaction | null } =>
    ({ memory, reaction: make("steady", "steady", line, key, null) });
  const wonder = (): { memory: MoodMemory; reaction: Reaction | null } =>
    ({ memory, reaction: make("curious", "curious", null, null, null) });

  switch (recent.type) {
    case "attempt": {
      if (recent.correct) {
        if (recent.tryNo === 1) return joy("First try.", "first-try");
        return { memory, reaction: REST() };
      }
      const seen = Object.hasOwn(memory.misses, recent.key) ? memory.misses[recent.key] : 0;
      const n = seen + 1;
      const misses: Record<string, number> = Object.create(null);
      for (const k of Object.keys(memory.misses)) misses[k] = memory.misses[k];
      misses[recent.key] = n;
      const next: MoodMemory = { misses, nudged: memory.nudged };
      const again = n === 2;
      return { memory: next, reaction: make("curious", "curious", again ? "Let's look again." : null, again ? "again" : null, null) };
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
      return { memory: { misses: memory.misses, nudged }, reaction: make("curious", "curious", line, "stuck", null) };
    }
    case "solved":
      return recent.fresh ? { memory, reaction: REST() } : none;
    case "opened":
    case "ladder":
    case "twin":
      return wonder();
    case "xp":
      return recent.goalMet ? joy("That's today's goal.", "goal") : none;
    case "combo":
      return recent.why === "max" || recent.pips >= input.comboMax ? joy(null, null) : none;
    case "encounter":
      if (!recent.fresh) return none;
      if (recent.cue === "down") return joy("Boss down.", "boss");
      if (recent.cue === "ward") return joy(null, null);
      if (recent.cue === "heart") return calmly(null, null);
      if (recent.hearts === 0) return calmly("Take a breath. The section is just above.", "regroup");
      return none;
    case "chapterDone":
      return recent.fresh ? joy("Chapter done!", "chapter") : none;
    case "level":
      return joy("Level " + recent.level + ".", "level");
    case "achievement":
      return joy(null, null);
    case "form":
      return joy(recent.from + " became " + recent.to + "!", "form");
  }
  const _never: never = recent;
  return _never;
}
