/* The site's sign-in layer for AI apps (decision 0016): OAuth 2.1 for public clients
   (authorization code with PKCE S256, no client secret) in front of two database functions.
   Four paths turn a request into a response: the two metadata documents, /oauth/register and
   /oauth/token. Routing, /mcp and the PostgREST call are the worker's.

   Nothing is stored here and nothing is secret. The only I/O is `rpc`, injected. It is called
   once per token request and never again: a redeem may have been answered, and a second
   presentation of a code is a replay that ends the connection it made. Nothing from a request
   is reflected into a response but the redirect addresses the allow-list accepted.

   Pure: no `window`, no DOM, no storage. */

import { appOf } from "./allow.ts";

/** How the worker reaches PostgREST. Resolves with PostgREST's status and parsed JSON body
    (null when the body is not JSON). Rejects only when no answer came back at all. */
export type Rpc = (fn: "connect_redeem" | "connect_refresh", args: Record<string, string>)
  => Promise<{ status: number; body: unknown }>;

export const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";
export const AUTH_SERVER_METADATA_PATH = "/.well-known/oauth-authorization-server";

const MAX_BODY = 16384;
const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/;
const CODE = /^[0-9a-f]{64}$/;
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const REFRESH = /^[0-9a-f]{96}$/;
const ACCESS = /^[0-9a-f]{64}$/;

function cors(methods: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "Retry-After",
    "Access-Control-Max-Age": "86400",
  };
}
const POST_CORS = cors("POST, OPTIONS");
const GET_CORS = cors("GET, HEAD, OPTIONS");
const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

function json(status: number, body: unknown, extra: Record<string, string> = {}, noStore = true): Response {
  const headers = new Headers({ "Content-Type": "application/json", ...POST_CORS, ...(noStore ? NO_STORE : {}), ...extra });
  return new Response(JSON.stringify(body), { status, headers });
}

function fail(status: number, error: string, description: string, extra: Record<string, string> = {}): Response {
  return json(status, { error, error_description: description }, extra);
}

const serverError = (): Response => fail(500, "server_error", "The server could not answer.");

function preflight(): Response {
  return new Response(null, { status: 204, headers: { ...POST_CORS, ...NO_STORE } });
}

function notPost(): Response {
  return new Response(JSON.stringify({ error: "invalid_request", error_description: "Use POST." }), {
    status: 405,
    headers: new Headers({ "Content-Type": "application/json", Allow: "POST", ...POST_CORS, ...NO_STORE }),
  });
}

function metadata(doc: unknown): Response {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=3600",
    ...GET_CORS,
  };
  return new Response(JSON.stringify(doc), { status: 200, headers });
}

/** RFC 8414. GET and HEAD. The module never normalises `issuer`. */
export function authorizationServerMetadata(issuer: string): Response {
  return metadata({
    issuer,
    authorization_endpoint: issuer + "/account",
    token_endpoint: issuer + "/oauth/token",
    registration_endpoint: issuer + "/oauth/register",
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    authorization_response_iss_parameter_supported: true,
  });
}

/** RFC 9728. GET and HEAD. */
export function protectedResourceMetadata(issuer: string): Response {
  return metadata({
    resource: issuer + "/mcp",
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
  });
}

function mediaType(req: Request): string {
  return (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
}

/** The body text, or the refusal. Read once. */
async function readBody(req: Request): Promise<{ text: string } | { refused: Response }> {
  const len = req.headers.get("content-length");
  if (len !== null && /^[0-9]+$/.test(len.trim()) && Number(len.trim()) > MAX_BODY) {
    return { refused: fail(413, "invalid_request", "The request is too large.") };
  }
  const text = await req.text();
  if (text.length > MAX_BODY) return { refused: fail(413, "invalid_request", "The request is too large.") };
  return { text };
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const subset = (v: unknown, allowed: readonly string[]): boolean =>
  Array.isArray(v) && v.every(x => typeof x === "string" && allowed.includes(x));

/** RFC 7591, stateless: a client id is made up and nothing is kept. POST only. */
export async function register(req: Request): Promise<Response> {
  try {
    if (req.method === "OPTIONS") return preflight();
    if (req.method !== "POST") return notPost();
    if (mediaType(req) !== "application/json") return fail(415, "invalid_request", "Send application/json.");
    const got = await readBody(req);
    if ("refused" in got) return got.refused;
    let meta: unknown;
    try { meta = JSON.parse(got.text); } catch { meta = null; }
    if (!isObject(meta)) return fail(400, "invalid_client_metadata", "The body must be a JSON object.");
    const uris = meta.redirect_uris;
    if (!Array.isArray(uris) || uris.length < 1 || uris.length > 10
        || !uris.every(u => appOf(u) !== null) || new Set(uris).size !== uris.length) {
      return fail(400, "invalid_redirect_uri", "A redirect address is not allowed.");
    }
    if (("token_endpoint_auth_method" in meta && meta.token_endpoint_auth_method !== "none")
        || ("grant_types" in meta && !subset(meta.grant_types, ["authorization_code", "refresh_token"]))
        || ("response_types" in meta && !subset(meta.response_types, ["code"]))) {
      return fail(400, "invalid_client_metadata", "Only public clients using the code flow are supported.");
    }
    return json(201, {
      client_id: base64url(crypto.getRandomValues(new Uint8Array(24))),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
  } catch {
    return serverError();
  }
}

function mapAnswer(answer: { status: number; body: unknown }): Response {
  const b = answer.body;
  if (answer.status === 200 && isObject(b)) {
    if ("hint" in b) {
      if (b.hint === "refused") return fail(400, "invalid_grant", "The grant is not valid.");
      if (b.hint === "limit") {
        return fail(429, "temporarily_unavailable", "Too many requests. Try again later.", { "Retry-After": "3600" });
      }
      if (b.hint === "retry") return fail(503, "temporarily_unavailable", "Try again.", { "Retry-After": "1" });
      // any other hint falls through to the 503 below
    } else if (typeof b.access === "string" && ACCESS.test(b.access)
        && typeof b.refresh === "string" && REFRESH.test(b.refresh)
        && typeof b.expires_in === "number" && Number.isInteger(b.expires_in) && b.expires_in > 0) {
      return json(200, {
        access_token: b.access,
        token_type: "Bearer",
        expires_in: b.expires_in,
        refresh_token: b.refresh,
      });
    }
  }
  return fail(503, "temporarily_unavailable", "Try again shortly.", { "Retry-After": "5" });
}

/** RFC 6749 §4.1.3 and §6 with PKCE (RFC 7636). POST only. `issuer` is the site's origin. */
export async function token(req: Request, issuer: string, rpc: Rpc): Promise<Response> {
  try {
    if (req.method === "OPTIONS") return preflight();
    if (req.method !== "POST") return notPost();
    if (mediaType(req) !== "application/x-www-form-urlencoded") {
      return fail(415, "invalid_request", "Send application/x-www-form-urlencoded.");
    }
    const got = await readBody(req);
    if ("refused" in got) return got.refused;
    const p = new URLSearchParams(got.text);
    const seen = new Set<string>();
    for (const k of p.keys()) {
      if (seen.has(k)) return fail(400, "invalid_request", "A parameter was given twice.");
      seen.add(k);
    }
    const resource = p.get("resource");
    if (resource !== null && resource !== issuer + "/mcp") {
      return fail(400, "invalid_target", "The resource is not this server's.");
    }
    if (req.headers.has("authorization")) {
      return fail(400, "invalid_client", "Clients here are public; send no credentials.");
    }
    const clientId = p.get("client_id");
    if (clientId === null || !CLIENT_ID.test(clientId)) return fail(400, "invalid_client", "The client is not valid.");

    const grant = p.get("grant_type");
    let fn: "connect_redeem" | "connect_refresh";
    let args: Record<string, string>;
    if (grant === "authorization_code") {
      const code = p.get("code");
      const verifier = p.get("code_verifier");
      const redirect = p.get("redirect_uri");
      if (code === null || verifier === null || redirect === null) {
        return fail(400, "invalid_request", "A required parameter is missing.");
      }
      if (!CODE.test(code) || !VERIFIER.test(verifier) || redirect.length > 200 || appOf(redirect) === null) {
        return fail(400, "invalid_grant", "The grant is not valid.");
      }
      fn = "connect_redeem";
      args = { p_code: code, p_verifier: verifier, p_client_id: clientId, p_redirect_uri: redirect };
    } else if (grant === "refresh_token") {
      const key = p.get("refresh_token");
      if (key === null) return fail(400, "invalid_request", "A required parameter is missing.");
      if (!REFRESH.test(key)) return fail(400, "invalid_grant", "The grant is not valid.");
      fn = "connect_refresh";
      args = { p_key: key, p_client_id: clientId };
    } else {
      return fail(400, "unsupported_grant_type", "The grant type is not supported.");
    }
    // One call, never repeated; a throw and a rejection alike mean no answer came back.
    let answer: { status: number; body: unknown };
    try { answer = await rpc(fn, args); } catch { return fail(503, "temporarily_unavailable", "Try again shortly.", { "Retry-After": "5" }); }
    return mapAnswer(answer);
  } catch {
    return serverError();
  }
}
