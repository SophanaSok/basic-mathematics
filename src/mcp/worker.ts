/* The connector's Cloudflare Pages worker (decision 0016): routing, the /mcp endpoint's HTTP
   rules and the one transport to PostgREST. The OAuth documents and endpoints are oauth.ts's, the
   messages protocol.ts's; this file decides which of them a request reaches and what the
   database says about its key. CN-8's build makes the entry file that calls `createWorker`.

   The worker holds no secret and no state. The public anon key is the transport's apikey; the
   connector's own key is the credential, read from the Authorization header only, checked by the
   database before anything is answered, and never put in a URL. Nothing from a request or from a
   PostgREST answer is reflected into a response, and nothing is logged. Every call to the
   database is made once and never retried: a redeem may have been answered.

   Pure: no `window`, no DOM, no storage. Web-standard globals only. */

import {
  AUTH_SERVER_METADATA_PATH, RESOURCE_METADATA_PATH, authorizationServerMetadata,
  protectedResourceMetadata, register, token, type Rpc
} from "./oauth.ts";
import {
  PROTOCOL_VERSIONS, handle, needs, parseMessage, rpcError, type Course, type JsonRpcResponse
} from "./protocol.ts";
import { ROWS_MAX } from "./overview.ts";
import type { OverviewInput } from "./types.ts";

export const MCP_PATH = "/mcp";

export interface Env { ASSETS: { fetch(req: Request): Promise<Response> } }

export interface WorkerOptions {
  course: Course;
  /** "https://<ref>.supabase.co", no trailing slash */
  supabaseUrl: string;
  /** the public anon key (assets/config.js has it; it is not a secret) */
  anonKey: string;
  connect: "off" | "preview" | "on";
  fetch?: typeof fetch;
  now?: () => Date;
}

/** bytes (T12) */
const MAX_BODY = 16384;
const MAX_PAGES = 4;
const KEY = /^[0-9a-f]{64}$/;
const NEWER_FORMAT = "Progress is in a newer format than this connector reads. Check again after the site updates.";

const MCP_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Retry-After",
  "Access-Control-Max-Age": "86400"
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Every response from /mcp, whatever its code, is never stored. */
function reply(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": MCP_CORS["Access-Control-Expose-Headers"],
    ...extra
  });
  if (body === null) return new Response(null, { status, headers });
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}

const rpcReply = (status: number, res: JsonRpcResponse, extra: Record<string, string> = {}): Response =>
  reply(status, res, extra);

function secondsToMidnight(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

type Answer = { status: number; body: unknown };
type Page = { body: Record<string, unknown> } | { fail: Response };

export function createWorker(o: WorkerOptions): { fetch(req: Request, env: Env): Promise<Response> } {
  const doFetch: typeof fetch = o.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const now = o.now ?? (() => new Date());

  /* The PostgREST transport. Rejects only when no answer came back (network, timeout). */
  async function post(fn: string, args: Record<string, unknown>): Promise<Answer> {
    const res = await doFetch(o.supabaseUrl + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: {
        apikey: o.anonKey,
        Authorization: "Bearer " + o.anonKey,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(8000)
    });
    let body: unknown = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  }
  const rpc: Rpc = (fn, args) => post(fn, args);

  const wwwAuth = (issuer: string, invalid: boolean): string =>
    "Bearer " + (invalid ? 'error="invalid_token", ' : "") + 'resource_metadata="' + issuer + RESOURCE_METADATA_PATH + '"';

  const unavailable = (retryAfter = "5"): Response =>
    rpcReply(503, rpcError(-32603, "The course is not reachable right now"), { "Retry-After": retryAfter });

  /* One metered or key-checking call to mcp_context, mapped as the database answered. */
  async function context(key: string, full: boolean | null, issuer: string, before?: unknown): Promise<Page> {
    const args: Record<string, unknown> = { p_key: key, p_full: full };
    if (before !== undefined) args.p_before = before;
    let ans: Answer;
    try { ans = await post("mcp_context", args); } catch { return { fail: unavailable() }; }
    const b = ans.body;
    if (ans.status !== 200 || !isObject(b)) return { fail: unavailable() };
    if ("hint" in b) {
      if (b.hint === "refused") {
        return { fail: reply(401, { error: "unauthorized" }, { "WWW-Authenticate": wwwAuth(issuer, true) }) };
      }
      if (b.hint === "limit") {
        return { fail: rpcReply(429, rpcError(-32000, "Daily limit reached"), { "Retry-After": String(secondsToMidnight(now())) }) };
      }
      if (b.hint === "retry") return { fail: unavailable("1") };
      return { fail: unavailable() };
    }
    if (b.ok !== true) return { fail: unavailable() };
    return { body: b };
  }

  /* The newest page, then older ones while the log says there are more: at most MAX_PAGES, and no
     further once the rows reach ROWS_MAX, the most overview() folds; `truncated` is true whenever a
     row that exists was not handed over, so the overview never calls a cut log whole. */
  async function progressOf(key: string, issuer: string):
    Promise<{ progress: OverviewInput | null; progressError: string | null } | { fail: Response }> {
    const first = await context(key, true, issuer);
    if ("fail" in first) return first;
    let page = first.body;
    let newer = false;
    let events: unknown[] = [];
    let fetched = 1;
    for (;;) {
      if (typeof page.v !== "number" || !Number.isFinite(page.v) || !Array.isArray(page.events)) return { fail: unavailable() };
      if (page.v > 1) newer = true;
      events = page.events.concat(events);
      const before = page.before;
      const more = page.truncated === true && !newer && fetched < MAX_PAGES && events.length < ROWS_MAX
        && (typeof before === "number" || (typeof before === "string" && /^[0-9]{1,19}$/.test(before)));
      if (!more) break;
      const next = await context(key, true, issuer, before);
      if ("fail" in next) return next;
      page = next.body;
      fetched++;
    }
    if (newer) return { progress: null, progressError: NEWER_FORMAT };
    const cut = page.truncated === true || events.length > ROWS_MAX;
    return { progress: { events, last: first.body.last, truncated: cut }, progressError: null };
  }

  async function mcp(req: Request, issuer: string): Promise<Response> {
    try {
      // 1
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: { ...MCP_CORS, "Cache-Control": "no-store" } });
      }
      // 2
      if (req.method !== "POST") return reply(405, { error: "method_not_allowed" }, { Allow: "POST, OPTIONS" });
      // 3
      const origin = req.headers.get("origin");
      if (origin !== null && origin !== issuer) return reply(403, { error: "forbidden" });
      // 4
      const version = req.headers.get("mcp-protocol-version");
      if (version !== null && !(PROTOCOL_VERSIONS as readonly string[]).includes(version)) {
        return rpcReply(400, rpcError(-32600, "Unsupported protocol version"));
      }
      // 5
      const auth = req.headers.get("authorization");
      if (auth === null) return reply(401, { error: "unauthorized" }, { "WWW-Authenticate": wwwAuth(issuer, false) });
      const key = auth.slice(7);
      if (auth.length !== 71 || auth.slice(0, 7).toLowerCase() !== "bearer " || !KEY.test(key)) {
        return reply(401, { error: "unauthorized" }, { "WWW-Authenticate": wwwAuth(issuer, true) });
      }
      // 6
      const len = req.headers.get("content-length");
      if (len !== null && /^[0-9]+$/.test(len.trim()) && Number(len.trim()) > MAX_BODY) return reply(413, { error: "too_large" });
      const text = await req.text();
      if (new TextEncoder().encode(text).length > MAX_BODY) return reply(413, { error: "too_large" });
      // 7
      const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (type !== "application/json") return reply(415, { error: "unsupported_media_type" });
      // 8
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { return rpcReply(400, rpcError(-32700, "Parse error")); }
      const msg = parseMessage(parsed);
      if ("error" in msg) return rpcReply(400, msg.error);
      if ("notification" in msg) return reply(202, null);
      // 9
      const full = needs(msg.request);
      let progress: OverviewInput | null = null;
      let progressError: string | null = null;
      if (full === true) {
        const got = await progressOf(key, issuer);
        if ("fail" in got) return got.fail;
        progress = got.progress;
        progressError = got.progressError;
      } else {
        const got = await context(key, full, issuer);
        if ("fail" in got) return got.fail;
      }
      // 10
      const today = now().toISOString().slice(0, 10);
      const res = handle(msg.request, { course: o.course, today, progress, progressError });
      return rpcReply(200, res, {
        Pragma: "no-cache",
        "MCP-Protocol-Version": PROTOCOL_VERSIONS[0]
      });
    } catch {
      // 11
      return reply(500, { error: "server_error" });
    }
  }

  /* A metadata document: GET as it is, HEAD without the body, OPTIONS with its CORS headers. */
  function metadataReply(req: Request, make: () => Response): Response {
    if (req.method === "GET") return make();
    const doc = make();
    if (req.method === "HEAD") return new Response(null, { status: doc.status, headers: doc.headers });
    if (req.method === "OPTIONS") {
      const headers = new Headers();
      doc.headers.forEach((v, k) => { if (k.startsWith("access-control-")) headers.set(k, v); });
      return new Response(null, { status: 204, headers });
    }
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD, OPTIONS" } });
  }

  return {
    async fetch(req: Request, env: Env): Promise<Response> {
      if (o.connect === "off") return env.ASSETS.fetch(req);
      const url = new URL(req.url);
      const issuer = url.origin;
      switch (url.pathname) {
        case AUTH_SERVER_METADATA_PATH:
          return metadataReply(req, () => authorizationServerMetadata(issuer));
        case RESOURCE_METADATA_PATH:
        case RESOURCE_METADATA_PATH + MCP_PATH:
          return metadataReply(req, () => protectedResourceMetadata(issuer));
        case "/oauth/register":
          return register(req);
        case "/oauth/token":
          return token(req, issuer, rpc);
        case MCP_PATH:
          return mcp(req, issuer);
        default:
          return env.ASSETS.fetch(req);
      }
    }
  };
}
