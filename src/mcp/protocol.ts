/* The connector's JSON-RPC and MCP messages (decision 0016), spec revision 2025-11-25 with the three
   older revisions a client may still speak. A message goes in, a response comes out; the worker
   owns HTTP, the key check and the database. This module sees only what `Context` hands it.

   The server is stateless: no session, no stream, no subscriptions. Six read-only tools and one
   prompt. Every tool function in tools.ts and overview.ts is total, and the arguments reach them
   as the client sent them, unchecked, so the two cannot disagree about what is valid. Nothing is
   thrown out of `handle`, and an internal failure says nothing about its cause.

   Pure: no `window`, no DOM, no storage, no fetch. */

import type { Curriculum } from "../core/curriculum.ts";
import { INSTRUCTIONS, PROMPT } from "./persona.ts";
import { overview } from "./overview.ts";
import { buildPlaces, checkAnswer, getClue, getExercise, listExercises, type Places } from "./tools.ts";
import type { ExerciseIndex, OverviewInput } from "./types.ts";

/** newest first */
export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;

export interface Course { index: ExerciseIndex; curriculum: Curriculum }

export type JsonRpcId = string | number;
export interface JsonRpcRequest { jsonrpc: "2.0"; id: JsonRpcId; method: string; params?: Record<string, unknown> }
export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId | null; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId | null; error: { code: number; message: string } };

export interface Context {
  course: Course;
  /** "YYYY-MM-DD"; the worker passes the UTC day */
  today: string;
  /** what the database sent for a get_progress call, assembled by the worker; null when none was read */
  progress: OverviewInput | null;
  /** the sentence get_progress answers when `progress` is null */
  progressError: string | null;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const failure = (id: JsonRpcId | null, code: number, message: string): JsonRpcResponse =>
  ({ jsonrpc: "2.0", id, error: { code, message } });

/** A JSON-RPC error response with id null, for a message that could not be read. */
export const rpcError = (code: number, message: string): JsonRpcResponse => failure(null, code, message);

export function parseMessage(body: unknown):
  { request: JsonRpcRequest } | { notification: true } | { error: JsonRpcResponse } {
  const bad = (message: string) => ({ error: failure(null, -32600, message) });
  if (Array.isArray(body)) return bad("Batches are not supported");
  if (!isObject(body) || body.jsonrpc !== "2.0" || typeof body.method !== "string") return bad("Invalid request");
  if ("params" in body && body.params !== undefined && !isObject(body.params)) return bad("Invalid request");
  if (!("id" in body)) return { notification: true };
  const id = body.id;
  if (typeof id !== "string" && !(typeof id === "number" && Number.isFinite(id))) return bad("Invalid request");
  const request: JsonRpcRequest = { jsonrpc: "2.0", id, method: body.method };
  if (isObject(body.params)) request.params = body.params;
  return { request };
}

/** What one request needs from the database: null = nothing but the key check, false = the key
    check and a metered call (tools that read no progress), true = the progress log. */
export function needs(msg: JsonRpcRequest): boolean | null {
  if (msg.method !== "tools/call") return null;
  return msg.params?.name === "get_progress";
}

const ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const NO_ARGS = { type: "object", properties: {}, additionalProperties: false } as const;
const REF = { type: "string", description: "An exercise reference exactly as list_exercises gives it: the chapter id, a slash, the exercise key, such as ch01/t1. Never make one up." } as const;

const TOOLS = [
  {
    name: "get_progress",
    title: "Where the learner stands",
    description: "Returns the learner's progress by section: a band for each (none, weak, building or strong), what is due for a check, and where they left off (chapterId and, when known, sectionId). Use it to suggest what to do next, then list_exercises with a chapter or section id to find a problem.",
    inputSchema: NO_ARGS,
    annotations: ANNOTATIONS
  },
  {
    name: "get_course_map",
    title: "The course map",
    description: "Returns the course's parts, chapters and sections, with each chapter's blurb and each section's title. Use it to find where a topic lives; its chapter and section ids are what list_exercises takes.",
    inputSchema: NO_ARGS,
    annotations: ANNOTATIONS
  },
  {
    name: "list_exercises",
    title: "The exercises of a place",
    description: "Returns the exercise references in one chapter or section: each one's section, kind, how many clues it has, and whether it is only on the page. A section also gives its summary and what it builds on; a chapter gives its blurb and its sections. Give it a chapter id such as ch01, or a section id from the course map such as ch01#addition. Use it to pick a problem, then get_exercise to see it.",
    inputSchema: { type: "object", properties: { place: { type: "string", description: "A chapter id (ch01) or a section id exactly as the course map and progress give it (ch01#addition)." } }, required: ["place"], additionalProperties: false },
    annotations: ANNOTATIONS
  },
  {
    name: "get_exercise",
    title: "An exercise",
    description: "Returns an exercise's question, its choices or blanks, and how many authored clues it has. It never returns the answer. Use it to put a problem in front of the learner.",
    inputSchema: { type: "object", properties: { ref: REF }, required: ["ref"], additionalProperties: false },
    annotations: ANNOTATIONS
  },
  {
    name: "get_clue",
    title: "A clue",
    description: "Returns one of an exercise's authored clues, from the first up. Use it only after the learner has made an attempt, and offer the next one only when they are still stuck.",
    inputSchema: {
      type: "object",
      properties: { ref: REF, rung: { type: "integer", minimum: 1, maximum: 3, description: "Which clue, counting from 1." } },
      required: ["ref", "rung"],
      additionalProperties: false
    },
    annotations: ANNOTATIONS
  },
  {
    name: "check_answer",
    title: "Check an answer",
    description: "Checks an answer with the course's own grader and says whether it is right, in another form, or not yet. Nothing is recorded: the learner enters the answer on the page to make it count.",
    inputSchema: {
      type: "object",
      properties: {
        ref: REF,
        answer: {
          description: "The learner's answer: a string, or one string per blank for an exercise with blanks.",
          anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }]
        }
      },
      required: ["ref", "answer"],
      additionalProperties: false
    },
    annotations: ANNOTATIONS
  }
] as const;

const TOOL_NAMES: readonly string[] = TOOLS.map(t => t.name);

interface MapSection { id: string; title: string }
interface MapChapter { id: string; label: string; title: string; blurb?: string; sections: MapSection[] }
interface CourseMap { parts: { id: string; name: string; beside: boolean; chapters: MapChapter[] }[] }

function buildMap(curriculum: Curriculum): CourseMap {
  const parts = Array.isArray(curriculum?.parts) ? curriculum.parts : [];
  return {
    parts: parts.map(part => ({
      id: part.id,
      name: part.name,
      beside: !!part.beside,
      chapters: (part.chapters || []).map(ch => {
        const out: MapChapter = { id: ch.id, label: String(ch.label), title: ch.title, sections: [] };
        if (ch.blurb) out.blurb = ch.blurb;
        out.sections = (ch.sections || []).map(s => {
          const ref = ch.id + "#" + s.id;
          const sec: MapSection = { id: ref, title: s.title };
          return sec;
        });
        return out;
      })
    }))
  };
}

const maps = new WeakMap<Course, CourseMap>();
function mapOf(course: Course): CourseMap {
  let m = maps.get(course);
  if (!m) { m = buildMap(course.curriculum); maps.set(course, m); }
  return m;
}

const placesCache = new WeakMap<Course, Places>();
function placesOf(course: Course): Places {
  let p = placesCache.get(course);
  if (!p) { p = buildPlaces(course.curriculum); placesCache.set(course, p); }
  return p;
}

/* one fixed sentence for each error code a tool function answers */
function errorText(error: unknown, answer: Record<string, unknown>): string {
  if (error === "unknown") return "No exercise has that reference. Use a reference exactly as list_exercises gives it, or ask the learner which exercise they mean.";
  if (error === "unknown-place") return "No chapter or section has that id. Use a chapter id or a section id exactly as the course map gives it, such as ch01 or ch01#addition.";
  if (error === "bad-answer") return "That answer is not in a form this exercise can check. Send one string, or one string per blank for an exercise with blanks, each a few words at most.";
  if (error === "no-clue") {
    const n = typeof answer.clues === "number" ? answer.clues : 0;
    return n === 0 ? "This exercise has no clues."
      : n === 1 ? "This exercise has one clue; ask for rung 1."
      : "This exercise has " + n + " clues; ask for a rung from 1 to " + n + ".";
  }
  return "That did not work.";
}

function toolResult(answer: unknown): unknown {
  if (isObject(answer) && "error" in answer) {
    return { content: [{ type: "text", text: errorText(answer.error, answer) }], isError: true };
  }
  return { content: [{ type: "text", text: JSON.stringify(answer) }], structuredContent: answer };
}

function callTool(msg: JsonRpcRequest, ctx: Context): JsonRpcResponse {
  const params = msg.params ?? {};
  const name = params.name;
  if (typeof name !== "string" || !TOOL_NAMES.includes(name)) return failure(msg.id, -32602, "Unknown tool");
  let args: Record<string, unknown> = {};
  if (params.arguments !== undefined) {
    if (!isObject(params.arguments)) {
      return { jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "The arguments must be an object. Send the tool's named arguments, or none." }], isError: true } };
    }
    args = params.arguments;
  }
  const { index, curriculum } = ctx.course;
  let answer: unknown;
  if (name === "get_progress") {
    if (ctx.progress === null) {
      return { jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: ctx.progressError ?? "Progress is not available right now." }], isError: true } };
    }
    answer = overview(ctx.progress, curriculum, ctx.today);
  } else if (name === "get_course_map") {
    answer = mapOf(ctx.course);
  } else if (name === "list_exercises") {
    answer = listExercises(index, placesOf(ctx.course), args.place);
  } else if (name === "get_exercise") {
    answer = getExercise(index, args.ref);
  } else if (name === "get_clue") {
    answer = getClue(index, args.ref, args.rung);
  } else {
    answer = checkAnswer(index, args.ref, args.answer);
  }
  return { jsonrpc: "2.0", id: msg.id, result: toolResult(answer) };
}

/** Answer one JSON-RPC request. Never throws. */
export function handle(msg: JsonRpcRequest, ctx: Context): JsonRpcResponse {
  try {
    const ok = (result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id: msg.id, result });
    const params = msg.params ?? {};
    switch (msg.method) {
      case "initialize": {
        const asked = params.protocolVersion;
        const version = PROTOCOL_VERSIONS.find(v => v === asked) ?? PROTOCOL_VERSIONS[0];
        return ok({
          protocolVersion: version,
          capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
          serverInfo: { name: "mochi", title: "Mochi, Basic Mathematics", version: "1" },
          instructions: INSTRUCTIONS
        });
      }
      case "ping":
        return ok({});
      case "tools/list":
        return ok({ tools: TOOLS });
      case "tools/call":
        return callTool(msg, ctx);
      case "prompts/list":
        return ok({ prompts: [{ name: PROMPT.name, title: "Mochi", description: PROMPT.description, arguments: [] }] });
      case "prompts/get":
        if (params.name !== PROMPT.name) return failure(msg.id, -32602, "Unknown prompt");
        return ok({ description: PROMPT.description, messages: [{ role: "user", content: { type: "text", text: PROMPT.text } }] });
      default:
        return failure(msg.id, -32601, "Method not found");
    }
  } catch {
    return failure(msg && (typeof msg.id === "string" || typeof msg.id === "number") ? msg.id : null, -32603, "Internal error");
  }
}
