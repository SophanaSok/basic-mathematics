/* The connector's messages, without HTTP: reading, routing by need, and a handle that never throws. */
import { describe, expect, it } from "vitest";
import type { Curriculum } from "../core/curriculum.ts";
import { handle, needs, parseMessage, PROTOCOL_VERSIONS, type Context, type JsonRpcRequest } from "./protocol.ts";

const ctx: Context = {
  course: { index: [], curriculum: { title: "T", parts: [] } as unknown as Curriculum },
  today: "2026-11-09", progress: null, progressError: null
};
const req = (method: string, params?: Record<string, unknown>): JsonRpcRequest => ({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) });

describe("parseMessage", () => {
  it("reads a request and echoes the id's type", () => {
    expect(parseMessage({ jsonrpc: "2.0", id: "a", method: "ping" })).toEqual({ request: { jsonrpc: "2.0", id: "a", method: "ping" } });
    expect(parseMessage({ jsonrpc: "2.0", id: 0, method: "ping", params: {} })).toEqual({ request: { jsonrpc: "2.0", id: 0, method: "ping", params: {} } });
  });
  it("treats a message without an id as a notification, whatever its method", () => {
    expect(parseMessage({ jsonrpc: "2.0", method: "notifications/initialized" })).toEqual({ notification: true });
    expect(parseMessage({ jsonrpc: "2.0", method: "ping" })).toEqual({ notification: true });
  });
  it("refuses what is not a request, with id null", () => {
    for (const b of [[], [{}], null, 1, "x", {}, { jsonrpc: "2.0", id: 1 }, { jsonrpc: "2.0", id: NaN, method: "m" }, { jsonrpc: "2.0", id: Infinity, method: "m" }]) {
      expect(parseMessage(b)).toMatchObject({ error: { id: null, error: { code: -32600 } } });
    }
  });
});

describe("needs", () => {
  it("maps methods to what the database must do", () => {
    expect(needs(req("initialize"))).toBeNull();
    expect(needs(req("tools/list"))).toBeNull();
    expect(needs(req("nothing"))).toBeNull();
    expect(needs(req("tools/call", { name: "get_progress" }))).toBe(true);
    expect(needs(req("tools/call", { name: "get_clue" }))).toBe(false);
    expect(needs(req("tools/call"))).toBe(false);
  });
});

describe("handle", () => {
  it("never throws, whatever the params", () => {
    const junk: unknown[] = [null, 5, "x", [], {}, { name: {} }, { name: "get_exercise", arguments: { ref: { toString() { throw new Error("x"); } } } }];
    for (const method of ["initialize", "tools/call", "prompts/get", "tools/list", "x"]) {
      for (const params of junk) {
        const r = handle({ jsonrpc: "2.0", id: 1, method, params: params as never }, ctx);
        expect(r.jsonrpc).toBe("2.0");
        expect(r.id).toBe(1);
      }
    }
  });
  it("answers get_progress with the worker's sentence when no progress was read", () => {
    const r = handle(req("tools/call", { name: "get_progress" }), { ...ctx, progressError: "later" }) as any;
    expect(r.result).toEqual({ content: [{ type: "text", text: "later" }], isError: true });
  });
  it("offers the newest version first", () => {
    expect(PROTOCOL_VERSIONS[0]).toBe("2025-06-18");
  });
});
