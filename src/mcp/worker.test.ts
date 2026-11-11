/* The connector's worker: routing, the /mcp rules in their order, the PostgREST transport and the
   paging of mcp_context, against a fake database and a fake asset store. */
import { describe, expect, it, vi } from "vitest";
import type { Curriculum } from "../core/curriculum.ts";
import { INSTRUCTIONS, PROMPT } from "./persona.ts";
import type { OverviewInput, ExerciseEntry, ExerciseIndex } from "./types.ts";
import { PROTOCOL_VERSIONS, type Course } from "./protocol.ts";
import { CLIENT_SHAPES } from "./clients.fixture.ts";

/* the overview is spied on, so a test can see what the worker handed it */
const seen: OverviewInput[] = [];
const seenToday: string[] = [];
vi.mock("./overview.ts", async (orig) => {
  const real = await orig<typeof import("./overview.ts")>();
  return { ...real, overview: (input: OverviewInput, c: Curriculum, today: string) => { seen.push(input); seenToday.push(today); return real.overview(input, c, today); } };
});
const { createWorker, MCP_PATH } = await import("./worker.ts");
type Worker = ReturnType<typeof createWorker>;

const ORIGIN = "https://learn.groundupmath.org";
const SUPABASE = "https://abcdefgh.supabase.co";
const ANON = "anon.public.key";
const KEY = "0123456789abcdef".repeat(4);
const MARKER = "zq9marker";

function entry(p: Partial<ExerciseEntry> & { ref: string }): ExerciseEntry {
  return {
    chapter: "ch01", key: p.ref.split("/")[1], section: "integers", inline: false, kind: "text", type: "number", question: "Q?",
    choices: [], blanks: [], items: [], answer: "1", compare: null, tol: 0, clues: [], visual: false, line: 1, ...p
  };
}
const index: ExerciseIndex = [
  entry({ ref: "ch01/t", answer: "12", question: "Add 5 and 7.", clues: ["Count up.", "Seven more than five.", "Twelve"] }),
  entry({ ref: "ch01/c", kind: "choice", type: "exact", answer: "2", choices: ["a", "b", "c"] }),
  entry({ ref: "ch01/b", kind: "blank", type: "blank", answer: "", question: " ___ and ___ ", blanks: [{ answer: "5", type: "number" }, { answer: "2/3", type: "number" }] }),
  entry({ ref: "ch01/o", kind: "order", type: "order", answer: "0,1,2", items: ["x", "y", "z"] })
];
const curriculum = {
  title: "Fixture",
  parts: [
    { id: "p1", num: "1", name: "Basics", dir: "basics", chapters: [
      { id: "ch01", label: "1", title: "Numbers", file: "numbers.html", blurb: "Counting.", sections: [
        { id: "integers", title: "Integers", summary: "Whole numbers." },
        { id: "no-such-skill", title: "Nowhere", requires: ["ch01#integers"] }
      ] }
    ] },
    { id: "p2", num: "A", name: "Pack", dir: "pack", beside: true, chapters: [
      { id: "ch02", label: "A", title: "Pack A", file: "a.html", sections: [{ id: "one-unknown", title: "One unknown" }] }
    ] }
  ]
} as unknown as Curriculum;
const course: Course = { index, curriculum };

interface Call { url: string; method: string; headers: Record<string, string>; body: string; signal: unknown }
type Reply = { status?: number; body?: unknown; raw?: string } | Error;

function setup(connect: "off" | "preview" | "on" = "on", now = new Date("2026-11-09T12:00:00Z")) {
  const calls: Call[] = [];
  const queue: Reply[] = [];
  const fetchFake = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: String(init?.method), headers: { ...(init?.headers as Record<string, string>) }, body: String(init?.body), signal: init?.signal });
    const r = queue.shift();
    if (!r) throw new Error("unexpected fetch");
    if (r instanceof Error) throw r;
    return new Response(r.raw ?? JSON.stringify(r.body ?? null), { status: r.status ?? 200 });
  }) as typeof fetch;
  const assets: Request[] = [];
  const env = { ASSETS: { fetch: async (req: Request) => { assets.push(req); return new Response("asset", { status: 200 }); } } };
  const worker: Worker = createWorker({ course, supabaseUrl: SUPABASE, anonKey: ANON, connect, fetch: fetchFake, now: () => now });
  return { worker, env, calls, queue, assets };
}

const good = (extra: Record<string, unknown> = {}): Reply => ({ body: { ok: true, ...extra } });
const page = (events: unknown[], extra: Record<string, unknown> = {}): Reply =>
  ({ body: { ok: true, v: 1, last: null, events, truncated: false, before: null, ...extra } });

function post(body: unknown, headers: Record<string, string> = {}, path = MCP_PATH): Request {
  return new Request(ORIGIN + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}
const rpcMsg = (method: string, params?: unknown, id: string | number = 1) => ({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
const call = (name: string, args?: unknown) => rpcMsg("tools/call", { name, ...(args === undefined ? {} : { arguments: args }) });

async function run(s: ReturnType<typeof setup>, req: Request) {
  const res = await s.worker.fetch(req, s.env);
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* empty or not JSON */ }
  return { res, text, json };
}
/** a valid-key tools call: one key-check or metered answer in the queue */
async function rpcOk(method: string, params?: unknown, ...queued: Reply[]) {
  const s = setup();
  s.queue.push(...(queued.length ? queued : [good()]));
  const out = await run(s, post(rpcMsg(method, params)));
  return { s, ...out };
}
const toolText = (json: any): string => json.result.content[0].text;

describe("routing", () => {
  it("connect off hands every request to the assets with no fetch", async () => {
    const s = setup("off");
    for (const p of ["/mcp", "/oauth/token", "/oauth/register", "/.well-known/oauth-protected-resource", "/"]) {
      const { text } = await run(s, post({}, {}, p));
      expect(text).toBe("asset");
    }
    expect(s.assets).toHaveLength(5);
    expect(s.calls).toHaveLength(0);
  });
  it("preview and on both serve /mcp", async () => {
    for (const mode of ["preview", "on"] as const) {
      const s = setup(mode);
      s.queue.push(good());
      const { res } = await run(s, post(rpcMsg("ping")));
      expect(res.status).toBe(200);
    }
  });
  it("passes everything else to the assets", async () => {
    const s = setup();
    for (const p of ["/", "/ch01/integers.html", "/mcp/", "/oauth/other", "/oauth/token/", "/MCP"]) {
      const { text } = await run(s, new Request(ORIGIN + p));
      expect(text).toBe("asset");
    }
    expect(s.assets.map(a => new URL(a.url).pathname)).toEqual(["/", "/ch01/integers.html", "/mcp/", "/oauth/other", "/oauth/token/", "/MCP"]);
    expect(s.calls).toHaveLength(0);
  });
  it.each([
    ["/.well-known/oauth-authorization-server", "token_endpoint"],
    ["/.well-known/oauth-protected-resource", "authorization_servers"],
    ["/.well-known/oauth-protected-resource/mcp", "authorization_servers"]
  ])("serves %s", async (path, field) => {
    const s = setup();
    const get = await run(s, new Request("https://other.example" + path));
    expect(get.res.status).toBe(200);
    expect(get.json[field]).toBeDefined();
    expect(JSON.stringify(get.json)).toContain("https://other.example");
    const head = await run(s, new Request("https://other.example" + path, { method: "HEAD" }));
    expect(head.res.status).toBe(200);
    expect(head.text).toBe("");
    expect(head.res.headers.get("content-type")).toBe(get.res.headers.get("content-type"));
    expect(head.res.headers.get("cache-control")).toBe(get.res.headers.get("cache-control"));
    const opt = await run(s, new Request("https://other.example" + path, { method: "OPTIONS" }));
    expect(opt.res.status).toBe(204);
    expect(opt.res.headers.get("access-control-allow-origin")).toBe("*");
    const put = await run(s, new Request("https://other.example" + path, { method: "PUT", body: "x" }));
    expect(put.res.status).toBe(405);
    expect(put.res.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(s.calls).toHaveLength(0);
  });
  it("sends /oauth/register to the register handler", async () => {
    const s = setup();
    const { res } = await run(s, new Request(ORIGIN + "/oauth/register", { method: "GET" }));
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });
});

describe("/oauth/token and the transport", () => {
  const form = (o: Record<string, string>) => new Request(ORIGIN + "/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString()
  });
  const args = {
    grant_type: "authorization_code", client_id: "client-abcdefgh", code: "ab".repeat(32),
    code_verifier: "v".repeat(43), redirect_uri: "https://claude.ai/api/mcp/auth_callback"
  };
  it("reaches the real handler and sends the raw arguments to connect_redeem", async () => {
    const s = setup();
    s.queue.push({ body: { access: "a".repeat(64), refresh: "b".repeat(96), expires_in: 3600 } });
    const { res, json } = await run(s, form({ ...args, resource: ORIGIN + "/mcp" }));
    expect(res.status).toBe(200);
    expect(json.access_token).toBe("a".repeat(64));
    expect(s.calls).toHaveLength(1);
    const c = s.calls[0];
    expect(c.url).toBe(SUPABASE + "/rest/v1/rpc/connect_redeem");
    expect(c.method).toBe("POST");
    expect(c.headers).toEqual({ apikey: ANON, Authorization: "Bearer " + ANON, "Content-Type": "application/json", Accept: "application/json" });
    expect(JSON.parse(c.body)).toEqual({ p_code: args.code, p_verifier: args.code_verifier, p_client_id: args.client_id, p_redirect_uri: args.redirect_uri });
  });
  it("uses the request's origin as the issuer: a resource of another origin is refused", async () => {
    const s = setup();
    const { res, json } = await run(s, form({ ...args, resource: "https://evil.example/mcp" }));
    expect(res.status).toBe(400);
    expect(json.error).toBe("invalid_target");
    expect(s.calls).toHaveLength(0);
  });
  it("never retries a failed redeem", async () => {
    const s = setup();
    s.queue.push(new Error("network"), good());
    const { res } = await run(s, form(args));
    expect(res.status).toBe(503);
    expect(s.calls).toHaveLength(1);
  });
  it("sends a refresh to connect_refresh", async () => {
    const s = setup();
    s.queue.push({ body: { hint: "refused" } });
    await run(s, form({ grant_type: "refresh_token", client_id: args.client_id, refresh_token: "c".repeat(96) }));
    expect(s.calls[0].url).toBe(SUPABASE + "/rest/v1/rpc/connect_refresh");
  });
});

describe("/mcp: the rules, in order", () => {
  it("1. OPTIONS answers the preflight and touches nothing", async () => {
    const s = setup();
    const { res, text } = await run(s, new Request(ORIGIN + "/mcp", { method: "OPTIONS" }));
    expect(res.status).toBe(204);
    expect(text).toBe("");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(res.headers.get("access-control-allow-headers")).toBe("Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version");
    expect(res.headers.get("access-control-expose-headers")).toBe("WWW-Authenticate, Retry-After");
    expect(res.headers.get("access-control-max-age")).toBe("86400");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(s.calls).toHaveLength(0);
  });
  it.each(["GET", "HEAD", "DELETE", "PUT", "PATCH"])("2. %s is 405 with Allow, before any other rule", async (method) => {
    const s = setup();
    const { res } = await run(s, new Request(ORIGIN + "/mcp", { method, headers: { Origin: "https://evil.example" } }));
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST, OPTIONS");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(s.calls).toHaveLength(0);
  });
  it("2. never issues a session id and ignores one that is sent", async () => {
    const s = setup();
    s.queue.push(good());
    const { res } = await run(s, post(rpcMsg("ping"), { "Mcp-Session-Id": "abc" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("mcp-session-id")).toBeNull();
  });
  it("3. a foreign Origin is 403; the site's own and none pass", async () => {
    const s = setup();
    const bad = await run(s, post(rpcMsg("ping"), { Origin: "https://evil.example" }));
    expect(bad.res.status).toBe(403);
    expect(bad.json).toEqual({ error: "forbidden" });
    expect((await run(s, post(rpcMsg("ping"), { Origin: ORIGIN + "/" }))).res.status).toBe(403);
    expect(s.calls).toHaveLength(0);
    s.queue.push(good(), good());
    expect((await run(s, post(rpcMsg("ping"), { Origin: ORIGIN }))).res.status).toBe(200);
    expect((await run(s, post(rpcMsg("ping")))).res.status).toBe(200);
  });
  it("3 comes before the key check", async () => {
    const s = setup();
    const req = new Request(ORIGIN + "/mcp", { method: "POST", headers: { Origin: "https://evil.example" }, body: "{}" });
    expect((await run(s, req)).res.status).toBe(403);
  });
  it("4 before 8: an unsupported version without a key is 401, never 400", async () => {
    const s = setup();
    const r = await run(s, new Request(ORIGIN + "/mcp", { method: "POST", headers: { "MCP-Protocol-Version": "2020-01-01" }, body: "{}" }));
    expect(r.res.status).toBe(401);
    expect(r.res.headers.get("www-authenticate")).toContain("resource_metadata=");
    const bad = await run(s, post(rpcMsg("ping"), { Authorization: "Bearer nope", "MCP-Protocol-Version": "2020-01-01" }));
    expect(bad.res.status).toBe(401);
    expect(s.calls).toHaveLength(0);
  });
  it("5 before 6: no key with an oversize body is 401, not 413", async () => {
    const s = setup();
    const r = await run(s, new Request(ORIGIN + "/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(20000) }));
    expect(r.res.status).toBe(401);
  });
  it("6 counts bytes: a body of multibyte characters under 16,384 characters but over 16,384 bytes is 413", async () => {
    const s = setup();
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { pad: "é".repeat(9000) } });
    expect(body.length).toBeLessThan(16384);
    const r = await run(s, post(JSON.parse(body)));
    expect(r.res.status).toBe(413);
    expect(s.calls).toHaveLength(0);
  });
  it("8. an unsupported protocol version is 400 -32600 with a key; the four supported pass", async () => {
    const s = setup();
    const bad = await run(s, post(rpcMsg("ping"), { "MCP-Protocol-Version": "2020-01-01" }));
    expect(bad.res.status).toBe(400);
    expect(bad.json).toEqual({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Unsupported protocol version" } });
    expect(s.calls).toHaveLength(0);
    expect(PROTOCOL_VERSIONS).toHaveLength(4);
    for (const v of PROTOCOL_VERSIONS) {
      s.queue.push(good());
      expect((await run(s, post(rpcMsg("ping"), { "MCP-Protocol-Version": v }))).res.status).toBe(200);
    }
  });
  it("8. an unsupported version on a notification is 400 too, before the 202 and with no database call", async () => {
    const s = setup();
    const note = { jsonrpc: "2.0", method: "notifications/initialized" };
    const bad = await run(s, post(note, { "MCP-Protocol-Version": "2020-01-01" }));
    expect(bad.res.status).toBe(400);
    expect((await run(s, post(note))).res.status).toBe(202);
    expect(s.calls).toHaveLength(0);
  });
  it("8. an initialize sent as a notification (no id) with an unknown version header is 400; only a request is exempt", async () => {
    const s = setup();
    const { res, json } = await run(s, post({ jsonrpc: "2.0", method: "initialize", params: { protocolVersion: "2025-06-18" } }, { "MCP-Protocol-Version": "2099-01-01" }));
    expect(res.status).toBe(400);
    expect(json.error.code).toBe(-32600);
    expect(s.calls).toHaveLength(0);
  });
  it("8. an initialize is never refused on the version header", async () => {
    const s = setup();
    s.queue.push(good());
    const { res, json } = await run(s, post(rpcMsg("initialize", { protocolVersion: "2025-06-18" }), { "MCP-Protocol-Version": "2099-01-01" }));
    expect(res.status).toBe(200);
    expect(json.result.protocolVersion).toBe("2025-06-18");
  });
  it("5. no key is 401 naming the request's own origin, and no fetch is made", async () => {
    const s = setup();
    const req = new Request("https://preview.example/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rpcMsg("ping")) });
    const { res, json } = await run(s, req);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe('Bearer resource_metadata="https://preview.example/.well-known/oauth-protected-resource"');
    expect(json).toEqual({ error: "unauthorized" });
    expect(s.calls).toHaveLength(0);
  });
  it.each([
    ["Basic " + KEY], ["Bearer"], ["Bearer "], ["Bearer " + KEY.slice(1)], ["Bearer " + KEY + "0"], ["Bearer  " + KEY],
    ["Bearer " + KEY.toUpperCase()], ["Bearer " + KEY.slice(0, 63) + "g"], [KEY]
  ])("5. a malformed key (%s) is 401 invalid_token and no fetch is made", async (header) => {
    const s = setup();
    const { res } = await run(s, post(rpcMsg("ping"), { Authorization: header }));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(`Bearer error="invalid_token", resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource"`);
    expect(s.calls).toHaveLength(0);
  });
  it("5. the scheme is case-insensitive, and a key in the query string or body is never read", async () => {
    const s = setup();
    s.queue.push(good());
    expect((await run(s, post(rpcMsg("ping"), { Authorization: "bEaReR " + KEY }))).res.status).toBe(200);
    const bare = new Request(ORIGIN + "/mcp?access_token=" + KEY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...rpcMsg("ping"), key: KEY }) });
    expect((await run(s, bare)).res.status).toBe(401);
    expect(s.calls).toHaveLength(1);
  });
  it("6. an oversize body is 413 by header and by text, before the content type is read", async () => {
    const s = setup();
    const big = "x".repeat(16385);
    const byHeader = await run(s, post("{}", { "Content-Length": "16385" }));
    expect(byHeader.res.status).toBe(413);
    const byText = await run(s, post(big, { "Content-Type": "text/plain" }));
    expect(byText.res.status).toBe(413);
    expect(s.calls).toHaveLength(0);
    s.queue.push(good());
    const edge = JSON.stringify({ ...rpcMsg("ping"), pad: "x".repeat(16000) });
    expect((await run(s, post(edge))).res.status).toBe(200);
  });
  it("7. a content type that is not JSON is 415; parameters are allowed", async () => {
    const s = setup();
    for (const ct of ["text/plain", "application/x-www-form-urlencoded", ""]) {
      const { res } = await run(s, post(rpcMsg("ping"), { "Content-Type": ct }));
      expect(res.status).toBe(415);
    }
    expect(s.calls).toHaveLength(0);
    s.queue.push(good());
    expect((await run(s, post(rpcMsg("ping"), { "Content-Type": "Application/JSON; charset=utf-8" }))).res.status).toBe(200);
  });
  it("8. text that is not JSON is 400 -32700 with id null", async () => {
    const s = setup();
    const { res, json } = await run(s, post("{nope"));
    expect(res.status).toBe(400);
    expect(json).toEqual({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    expect(s.calls).toHaveLength(0);
  });
  it.each([
    ["a batch", [rpcMsg("ping")]],
    ["an empty batch", []],
    ["a string", '"ping"'],
    ["null", null],
    ["a wrong version", { jsonrpc: "1.0", id: 1, method: "ping" }],
    ["no method", { jsonrpc: "2.0", id: 1 }],
    ["a numeric method", { jsonrpc: "2.0", id: 1, method: 5 }],
    ["array params", { jsonrpc: "2.0", id: 1, method: "ping", params: [] }],
    ["a string params", { jsonrpc: "2.0", id: 1, method: "ping", params: "x" }],
    ["a null id", { jsonrpc: "2.0", id: null, method: "ping" }],
    ["an object id", { jsonrpc: "2.0", id: {}, method: "ping" }],
    ["a boolean id", { jsonrpc: "2.0", id: true, method: "ping" }]
  ])("8. %s is 400 -32600 with id null and no fetch", async (_n, body) => {
    const s = setup();
    const { res, json } = await run(s, post(body));
    expect(res.status).toBe(400);
    expect(json.id).toBeNull();
    expect(json.error.code).toBe(-32600);
    expect(s.calls).toHaveLength(0);
  });
  it("8. a batch says so", async () => {
    const { json } = await run(setup(), post([rpcMsg("ping")]));
    expect(json.error.message).toBe("Batches are not supported");
  });
  it.each([
    [{ jsonrpc: "2.0", method: "notifications/initialized" }],
    [{ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 3 } }],
    [{ jsonrpc: "2.0", method: "ping" }]
  ])("8. a notification is 202 with an empty body and no fetch", async (body) => {
    const s = setup();
    const { res, text } = await run(s, post(body));
    expect(res.status).toBe(202);
    expect(text).toBe("");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(s.calls).toHaveLength(0);
  });
  it("10. a request is answered 200 with the headers, and the id comes back as sent", async () => {
    for (const id of ["abc", 7, 0, 1.5]) {
      const s = setup();
      s.queue.push(good());
      const { res, json } = await run(s, post(rpcMsg("ping", undefined, id)));
      expect(res.status).toBe(200);
      expect(json).toEqual({ jsonrpc: "2.0", id, result: {} });
      expect(res.headers.get("content-type")).toBe("application/json");
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("pragma")).toBe("no-cache");
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.headers.get("mcp-protocol-version")).toBe(PROTOCOL_VERSIONS[0]);
    }
  });
  it("11. every code carries no-store", async () => {
    const codes = new Set<number>();
    const s = setup();
    const reqs: Request[] = [
      new Request(ORIGIN + "/mcp", { method: "GET" }), post("{}", { Origin: "https://x.example" }), post("{}", { Authorization: "no" }),
      post("{nope"), post({}, { "Content-Type": "text/plain" }), post("x".repeat(17000))
    ];
    for (const r of reqs) {
      const { res } = await run(s, r);
      codes.add(res.status);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect([...codes].sort()).toEqual([400, 401, 403, 405, 413, 415]);
  });
  it("11. a throw is 500 server_error with no detail", async () => {
    const s = setup();
    s.queue.push({ body: { ok: true } });
    const bad = new Request(ORIGIN + "/mcp", { method: "POST", headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" }, body: JSON.stringify(rpcMsg("ping")) });
    Object.defineProperty(bad, "text", { value: () => { throw new Error(MARKER); } });
    const { res, text, json } = await run(s, bad);
    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "server_error" });
    expect(text).not.toContain(MARKER);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("/mcp: what the database says", () => {
  it("sends the key check as p_full null, a plain tool as false, progress as true", async () => {
    const cases: [string, unknown, Reply[], boolean | null][] = [
      ["initialize", { protocolVersion: PROTOCOL_VERSIONS[0] }, [good()], null],
      ["ping", undefined, [good()], null],
      ["tools/list", undefined, [good()], null],
      ["prompts/list", undefined, [good()], null],
      ["prompts/get", { name: "mochi" }, [good()], null],
      ["no/such", undefined, [good()], null],
      ["tools/call", { name: "get_course_map" }, [good()], false],
      ["tools/call", { name: "get_exercise", arguments: { ref: "ch01/t" } }, [good()], false],
      ["tools/call", { name: "no_such_tool" }, [good()], false],
      ["tools/call", { name: "get_progress" }, [page([])], true]
    ];
    for (const [method, params, queued, full] of cases) {
      const { s } = await rpcOk(method, params, ...queued);
      expect(s.calls).toHaveLength(1);
      expect(s.calls[0].url).toBe(SUPABASE + "/rest/v1/rpc/mcp_context");
      expect(JSON.parse(s.calls[0].body)).toEqual({ p_key: KEY, p_full: full });
    }
  });
  it("the transport sends the anon key as apikey and bearer, never Prefer, never the key in a URL", async () => {
    const { s } = await rpcOk("tools/call", { name: "get_progress" }, page([]));
    for (const c of s.calls) {
      expect(c.headers.apikey).toBe(ANON);
      expect(c.headers.Authorization).toBe("Bearer " + ANON);
      expect(Object.keys(c.headers).map(k => k.toLowerCase())).not.toContain("prefer");
      expect(c.url).not.toContain(KEY);
      expect(c.url).not.toContain("?");
    }
    expect(s.calls[0].body).toContain(KEY);
  });
  it("makes exactly one fetch for a single-page request", async () => {
    const { s } = await rpcOk("tools/call", { name: "get_progress" }, page([["a"]]));
    expect(s.calls).toHaveLength(1);
  });
  it("refused is 401 invalid_token", async () => {
    const { res, json } = await rpcOk("ping", undefined, { body: { hint: "refused" } });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(`Bearer error="invalid_token", resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource"`);
    expect(json).toEqual({ error: "unauthorized" });
  });
  it("limit is 429 with seconds to the next UTC midnight from the injected clock", async () => {
    for (const [now, secs] of [["2026-11-09T23:59:30Z", "30"], ["2026-11-09T00:00:00Z", "86400"], ["2026-12-31T23:59:59.500Z", "1"]]) {
      const s = setup("on", new Date(now));
      s.queue.push({ body: { hint: "limit" } });
      const { res, json } = await run(s, post(call("get_course_map")));
      expect(res.status).toBe(429);
      expect(res.headers.get("retry-after")).toBe(secs);
      expect(json.error).toEqual({ code: -32000, message: "Daily limit reached" });
      expect(json.id).toBeNull();
    }
  });
  it("retry is 503 with Retry-After 1", async () => {
    const { res, json } = await rpcOk("ping", undefined, { body: { hint: "retry" } });
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("1");
    expect(json.error.code).toBe(-32603);
  });
  it.each([
    ["a PostgREST 500", { status: 500, body: { message: "zq9db statement timeout", code: "57014" } }],
    ["a PostgREST 401", { status: 401, body: { message: "zq9db JWT" } }],
    ["a PostgREST 404", { status: 404, body: { message: "zq9db" } }],
    ["text that is not JSON", { status: 200, raw: "<html>zq9db</html>" }],
    ["a 500 that is not JSON", { status: 500, raw: "zq9db" }],
    ["null", { status: 200, body: null }],
    ["an array", { status: 200, body: ["zq9db"] }],
    ["a string", { status: 200, body: "zq9db" }],
    ["an odd hint", { status: 200, body: { hint: "zq9db" } }],
    ["no ok", { status: 200, body: { v: 1, events: [] } }],
    ["ok false", { status: 200, body: { ok: false, message: "zq9db" } }],
    ["a network failure", new Error("zq9db")]
  ] as [string, Reply][])("%s is 503 with Retry-After 5 and nothing of the answer", async (_n, reply) => {
    const { res, text, json } = await rpcOk("ping", undefined, reply);
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
    expect(json).toEqual({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "The course is not reachable right now" } });
    expect(text).not.toContain("zq9db");
  });
  it("never retries a failed call", async () => {
    const s = setup();
    s.queue.push({ status: 500 }, good());
    await run(s, post(rpcMsg("ping")));
    expect(s.calls).toHaveLength(1);
  });
  it("a request marker appears in no error response", async () => {
    const bodies: [unknown, Record<string, string>][] = [
      [{ ...rpcMsg(MARKER), params: { x: MARKER } }, {}],
      [call(MARKER, { ref: MARKER }), {}],
      [call("get_exercise", { ref: MARKER }), {}],
      [call("get_exercise", MARKER), {}],
      [rpcMsg("ping"), { "X-Test": MARKER, "MCP-Protocol-Version": MARKER }],
      [rpcMsg("ping"), { Origin: "https://" + MARKER + ".example" }],
      [rpcMsg("ping"), { Authorization: "Bearer " + MARKER }],
      [MARKER, {}],
      [[MARKER], {}],
      [{ jsonrpc: MARKER, id: MARKER, method: MARKER }, {}]
    ];
    for (const [body, headers] of bodies) {
      const s = setup();
      s.queue.push(good());
      const { text, res } = await run(s, post(body, headers));
      if (res.status !== 200) expect(text).not.toContain(MARKER);
      // even a 200 reflects no string it was not given: an unknown tool and method name nothing
      if (res.status === 200) expect(text).not.toContain(MARKER);
    }
  });
});

describe("/mcp: paging mcp_context", () => {
  const prog = (r: Reply[]) => rpcOk("tools/call", { name: "get_progress" }, ...r);
  it("follows p_before through three pages and puts older events first", async () => {
    seen.length = 0;
    const { s, json } = await prog([
      page([["e7"], ["e8"], ["e9"]], { truncated: true, before: 7, last: { id: "ch01", section: "integers" } }),
      page([["e4"], ["e5"], ["e6"]], { truncated: true, before: 4, last: null }),
      page([["e1"], ["e2"], ["e3"]], { truncated: false, before: 1, last: null })
    ]);
    expect(s.calls.map(c => JSON.parse(c.body))).toEqual([
      { p_key: KEY, p_full: true }, { p_key: KEY, p_full: true, p_before: 7 }, { p_key: KEY, p_full: true, p_before: 4 }
    ]);
    expect(seen).toHaveLength(1);
    expect((seen[0].events as unknown[][]).map(e => e[0])).toEqual(["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9"]);
    expect(seen[0].last).toEqual({ id: "ch01", section: "integers" });
    expect(seen[0].truncated).toBe(false);
    expect(json.result.structuredContent.totals.truncated).toBe(false);
  });
  it("stops after four pages and says the log was cut", async () => {
    seen.length = 0;
    const more = (n: number): Reply => page([["p" + n]], { truncated: true, before: 100 - n });
    const { s, json } = await prog([more(1), more(2), more(3), more(4), more(5)]);
    expect(s.calls).toHaveLength(4);
    expect((seen[0].events as unknown[][]).map(e => e[0])).toEqual(["p4", "p3", "p2", "p1"]);
    expect(seen[0].truncated).toBe(true);
    expect(json.result.structuredContent.totals.truncated).toBe(true);
  });
  it("says the log was cut when four full pages hold more rows than the overview folds", async () => {
    seen.length = 0;
    const big = (n: number, from: number): unknown[] => Array.from({ length: n }, (_, i) => ["r" + (from + i)]);
    // 3 pages of 6,000 reach 18,000, under ROWS_MAX, so a 4th is fetched: 24,000 rows, 4,000 more than overview() keeps
    const { s, json } = await prog([
      page(big(6000, 18000), { truncated: true, before: 18000 }),
      page(big(6000, 12000), { truncated: true, before: 12000 }),
      page(big(6000, 6000), { truncated: true, before: 6000 }),
      page(big(6000, 0), { truncated: false, before: 1 })
    ]);
    expect(s.calls).toHaveLength(4);
    expect((seen[0].events as unknown[]).length).toBe(24000);
    expect(seen[0].truncated).toBe(true);
    expect(json.result.structuredContent.totals.truncated).toBe(true);
  });
  it("fetches no further page once the rows reach ROWS_MAX", async () => {
    seen.length = 0;
    const big = (n: number, from: number): unknown[] => Array.from({ length: n }, (_, i) => ["r" + (from + i)]);
    const { s } = await prog([
      page(big(10000, 10000), { truncated: true, before: 10000 }),
      page(big(10000, 0), { truncated: true, before: 1 }),
      page([["never"]], { truncated: false, before: 0 })
    ]);
    expect(s.calls).toHaveLength(2);
    expect(seen[0].truncated).toBe(true);
  });
  it("stops, still marked cut, when a truncated page has no usable before", async () => {
    seen.length = 0;
    const { s } = await prog([page([["a"]], { truncated: true, before: null }), good()]);
    expect(s.calls).toHaveLength(1);
    expect(seen[0].truncated).toBe(true);
  });
  it("passes a string before through as sent", async () => {
    const { s } = await prog([page([["a"]], { truncated: true, before: "9007199254740993" }), page([["b"]])]);
    expect(JSON.parse(s.calls[1].body).p_before).toBe("9007199254740993");
  });
  it.each([
    ["refused", { body: { hint: "refused" } }, 401],
    ["limit", { body: { hint: "limit" } }, 429],
    ["retry", { body: { hint: "retry" } }, 503],
    ["a PostgREST 500", { status: 500, body: { message: "zq9db" } }, 503],
    ["a network failure", new Error("x"), 503]
  ] as [string, Reply, number][])("an inner page that answers %s fails the whole request", async (_n, reply, status) => {
    const { res, text } = await prog([page([["a"]], { truncated: true, before: 5 }), reply]);
    expect(res.status).toBe(status);
    expect(text).not.toContain("zq9db");
  });
  it("a format newer than 1 is an error result, not an overview", async () => {
    seen.length = 0;
    const { s, json, res } = await prog([page([["a"]], { v: 2 })]);
    expect(res.status).toBe(200);
    expect(json.result.isError).toBe(true);
    expect(toolText(json)).toBe("Progress is in a newer format than this connector reads. Check again after the site updates.");
    expect(json.result.structuredContent).toBeUndefined();
    expect(s.calls).toHaveLength(1);
    expect(seen).toHaveLength(0);
  });
  it("a newer format on an older page is the same error", async () => {
    const { json } = await prog([page([["a"]], { truncated: true, before: 5 }), page([["b"]], { v: 2 })]);
    expect(json.result.isError).toBe(true);
  });
  it("a page without a number v or an events array is 503", async () => {
    for (const bad of [{ v: undefined }, { v: "1" }, { events: "x" }, { events: undefined }]) {
      const { res, text } = await prog([page([], bad)]);
      expect(res.status).toBe(503);
    }
  });
  it("the text content is the structured content, serialized", async () => {
    const { json } = await prog([page([])]);
    const o = json.result.structuredContent;
    expect(o.totals.events).toBe(0);
    expect(json.result.content[0].text).toBe(JSON.stringify(o));
  });
});

describe("/mcp: the methods", () => {
  it("initialize negotiates the version, both ways", async () => {
    const same = await rpcOk("initialize", { protocolVersion: "2024-11-05" });
    expect(same.json.result.protocolVersion).toBe("2024-11-05");
    for (const asked of ["1999-01-01", 5, undefined]) {
      const r = await rpcOk("initialize", { protocolVersion: asked });
      expect(r.json.result.protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
    }
    const r = await rpcOk("initialize", { protocolVersion: PROTOCOL_VERSIONS[1] });
    expect(r.json.result).toEqual({
      protocolVersion: PROTOCOL_VERSIONS[1],
      capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
      serverInfo: { name: "mochi", title: "Mochi, Basic Mathematics", version: "1" },
      instructions: INSTRUCTIONS
    });
  });
  it("initialize works with no params at all", async () => {
    const r = await rpcOk("initialize");
    expect(r.json.result.protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
  });
  it("ping is an empty result", async () => {
    expect((await rpcOk("ping")).json.result).toEqual({});
  });
  it("tools/list has six read-only tools with closed schemas and plain descriptions", async () => {
    const { json } = await rpcOk("tools/list");
    const tools = json.result.tools;
    expect(tools.map((t: any) => t.name)).toEqual(["get_progress", "get_course_map", "list_exercises", "get_exercise", "get_clue", "check_answer"]);
    for (const t of tools) {
      expect(t.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
      expect(t.inputSchema.type).toBe("object");
      expect(t.inputSchema.additionalProperties).toBe(false);
      expect(t.title).toBeTypeOf("string");
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.description).not.toContain("!");
    }
    expect(tools[2].inputSchema.required).toEqual(["place"]);
    expect(tools[4].inputSchema.required).toEqual(["ref", "rung"]);
  });
  it("prompts/list and prompts/get", async () => {
    const list = await rpcOk("prompts/list");
    expect(list.json.result).toEqual({ prompts: [{ name: "mochi", title: "Mochi", description: PROMPT.description, arguments: [] }] });
    const got = await rpcOk("prompts/get", { name: "mochi" });
    expect(got.json.result).toEqual({ description: PROMPT.description, messages: [{ role: "user", content: { type: "text", text: PROMPT.text } }] });
    const bad = await rpcOk("prompts/get", { name: "other" });
    expect(bad.json.error.code).toBe(-32602);
    expect(bad.res.status).toBe(200);
    expect((await rpcOk("prompts/get")).json.error.code).toBe(-32602);
  });
  it("an unknown method is -32601 with the request's id", async () => {
    const s = setup();
    s.queue.push(good());
    const { json } = await run(s, post(rpcMsg("resources/list", undefined, "r1")));
    expect(json).toEqual({ jsonrpc: "2.0", id: "r1", error: { code: -32601, message: "Method not found" } });
  });
  it("an unknown tool is -32602; bad arguments are a tool error", async () => {
    expect((await rpcOk("tools/call", { name: "write_progress" })).json.error).toEqual({ code: -32602, message: "Unknown tool" });
    expect((await rpcOk("tools/call", {})).json.error.code).toBe(-32602);
    expect((await rpcOk("tools/call", { name: 5 })).json.error.code).toBe(-32602);
    expect((await rpcOk("tools/call")).json.error.code).toBe(-32602);
    for (const args of ["x", 5, null, [1]]) {
      const r = await rpcOk("tools/call", { name: "get_exercise", arguments: args });
      expect(r.json.error).toBeUndefined();
      expect(r.json.result.isError).toBe(true);
    }
  });
  it("get_course_map lists the parts, chapters and sections, without the standards data", async () => {
    const { json } = await rpcOk("tools/call", { name: "get_course_map" });
    const map = json.result.structuredContent;
    expect(json.result.content).toEqual([{ type: "text", text: JSON.stringify(map) }]);
    expect(map.parts.map((p: any) => [p.id, p.name, p.beside])).toEqual([["p1", "Basics", false], ["p2", "Pack", true]]);
    const ch = map.parts[0].chapters[0];
    expect(ch).toEqual({
      id: "ch01", label: "1", title: "Numbers", blurb: "Counting.",
      sections: [
        { id: "ch01#integers", title: "Integers" },
        { id: "ch01#no-such-skill", title: "Nowhere" }
      ]
    });
    expect(map.parts[1].chapters[0]).toEqual({ id: "ch02", label: "A", title: "Pack A", sections: [expect.objectContaining({ id: "ch02#one-unknown", title: "One unknown" })] });
    expect(JSON.stringify(map)).not.toMatch(/numbers\.html|"file"|"dir"|"status"|"skill"|ccss/);
  });
  it("get_exercise happy path and error path", async () => {
    const ok = await rpcOk("tools/call", { name: "get_exercise", arguments: { ref: "ch01/t" } });
    expect(ok.json.result.structuredContent).toMatchObject({ ref: "ch01/t", kind: "text", question: "Add 5 and 7.", clues: 3, onPage: false });
    expect(JSON.stringify(ok.json)).not.toContain('"answer"');
    expect(toolText(ok.json)).toBe(JSON.stringify(ok.json.result.structuredContent));
    const no = await rpcOk("tools/call", { name: "get_exercise", arguments: { ref: "ch01/zzz" } });
    expect(no.res.status).toBe(200);
    expect(no.json.result.isError).toBe(true);
    expect(no.json.result.structuredContent).toBeUndefined();
    expect(toolText(no.json)).toMatch(/No exercise has that reference/);
    const missing = await rpcOk("tools/call", { name: "get_exercise" });
    expect(missing.json.result.isError).toBe(true);
  });
  it("get_clue happy path and the no-clue error says how many clues there are", async () => {
    const ok = await rpcOk("tools/call", { name: "get_clue", arguments: { ref: "ch01/t", rung: 2 } });
    expect(ok.json.result.structuredContent).toEqual({ ref: "ch01/t", rung: 2, clues: 3, clue: "Seven more than five." });
    const no = await rpcOk("tools/call", { name: "get_clue", arguments: { ref: "ch01/t", rung: 4 } });
    expect(no.json.result.isError).toBe(true);
    expect(toolText(no.json)).toContain("3 clues");
    const none = await rpcOk("tools/call", { name: "get_clue", arguments: { ref: "ch01/c", rung: 1 } });
    expect(toolText(none.json)).toBe("This exercise has no clues.");
    expect((await rpcOk("tools/call", { name: "get_clue", arguments: { ref: "ch01/t", rung: "1" } })).json.result.isError).toBe(true);
  });
  it("check_answer happy path, onPage, blanks and the bad-answer error", async () => {
    const right = await rpcOk("tools/call", { name: "check_answer", arguments: { ref: "ch01/t", answer: "12" } });
    expect(right.json.result.structuredContent).toMatchObject({ ref: "ch01/t", verdict: "right" });
    const wrong = await rpcOk("tools/call", { name: "check_answer", arguments: { ref: "ch01/t", answer: "13" } });
    expect(wrong.json.result.isError).toBeUndefined();
    expect(wrong.json.result.structuredContent.verdict).toBe("wrong");
    expect(JSON.stringify(wrong.json)).not.toContain("12\"");
    const blanks = await rpcOk("tools/call", { name: "check_answer", arguments: { ref: "ch01/b", answer: ["5", "2/3"] } });
    expect(blanks.json.result.structuredContent).toMatchObject({ verdict: "right" });
    const onPage = await rpcOk("tools/call", { name: "check_answer", arguments: { ref: "ch01/o", answer: "x" } });
    expect(onPage.json.result.structuredContent).toEqual({ ref: "ch01/o", onPage: true });
    for (const answer of [5, ["a"], "x".repeat(201), undefined]) {
      const bad = await rpcOk("tools/call", { name: "check_answer", arguments: { ref: "ch01/t", answer } });
      expect(bad.json.result.isError).toBe(true);
      expect(toolText(bad.json)).toMatch(/not in a form/);
    }
  });
  it("get_progress with data answers the overview as structured content", async () => {
    const { json } = await rpcOk("tools/call", { name: "get_progress" }, page([], { last: { id: "ch01", section: "integers" } }));
    const o = json.result.structuredContent;
    expect(o).toMatchObject({ due: 0, totals: { events: 0, truncated: false } });
    expect(o.continue).toMatchObject({ chapterId: "ch01" });
  });
  it("passes the UTC day of the injected clock to the overview", async () => {
    const s = setup("on", new Date("2026-03-04T23:59:59Z"));
    s.queue.push(page([]));
    seenToday.length = 0;
    const { json } = await run(s, post(call("get_progress")));
    expect(json.result.structuredContent).toBeDefined();
    expect(seenToday).toEqual(["2026-03-04"]);
    expect(s.calls[0].signal).toBeInstanceOf(AbortSignal);
  });
});

describe("/mcp: what real clients send (clients.fixture.ts)", () => {
  const shape = (name: string) => CLIENT_SHAPES.find((c) => c.name === name)!;
  async function replay(name: string, ...queued: Reply[]) {
    const c = shape(name);
    const s = setup();
    s.queue.push(...queued);
    const headers: Record<string, string> = { ...c.headers };
    if (c.auth) headers.authorization = "Bearer " + KEY;
    const req = new Request(ORIGIN + MCP_PATH, { method: c.method, headers, body: JSON.stringify(c.body) });
    return { s, ...(await run(s, req)) };
  }
  it("keeps one observed row, the first, and lower-case header names", () => {
    expect(CLIENT_SHAPES.filter((c) => c.source === "observed").map((c) => c.name)).toEqual(["claude.ai pre-check"]);
    for (const c of CLIENT_SHAPES) for (const h of Object.keys(c.headers)) expect(h).toBe(h.toLowerCase());
  });
  it("claude.ai pre-check without a key is 401 with resource_metadata, never 400", async () => {
    const { res, s } = await replay("claude.ai pre-check");
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("resource_metadata=");
    expect(s.calls).toHaveLength(0);
  });
  it("claude.ai pre-check with a key negotiates 2025-11-25", async () => {
    const { res, json } = await replay("claude.ai pre-check after OAuth", good());
    expect(res.status).toBe(200);
    expect(json.result.protocolVersion).toBe("2025-11-25");
  });
  it("tools/list on 2025-11-25 answers the tools", async () => {
    const { res, json } = await replay("tools/list on 2025-11-25", good());
    expect(res.status).toBe(200);
    expect(json.result.tools.map((t: any) => t.name)).toEqual(["get_progress", "get_course_map", "list_exercises", "get_exercise", "get_clue", "check_answer"]);
  });
  it("the modern probe is 401 without a key", async () => {
    expect((await replay("modern probe, no key")).res.status).toBe(401);
  });
  it("the modern probe with a key is a 400 with the plain invalid-request code", async () => {
    const { res, json, s } = await replay("modern probe, with key");
    expect(res.status).toBe(400);
    expect(json.error.code).toBe(-32600);
    expect(s.calls).toHaveLength(0);
  });
  it("an initialize with an unknown future header negotiates the newest version", async () => {
    const { res, json } = await replay("initialize with an unknown future header", good());
    expect(res.status).toBe(200);
    expect(json.result.protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
  });
});
