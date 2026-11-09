import { describe, expect, it } from "vitest";
import { appOf } from "./allow.ts";
import { authorizationServerMetadata, protectedResourceMetadata, register, token, type Rpc } from "./oauth.ts";

const ISSUER = "https://learn.groundupmath.org";
const CLAUDE = "https://claude.ai/api/mcp/auth_callback";
const CODE = "a".repeat(64);
const VERIFIER = "v".repeat(43);
const CLIENT = "client_id-123";
const REFRESH = "b".repeat(96);
const ACCESS = "c".repeat(64);
const GOOD = { access: ACCESS, refresh: "d".repeat(96), expires_in: 3600 };

// allow-list: mirrors private.connect_app, supabase/schema.sql:1048-1060
describe("appOf", () => {
  const accepted: [string, string][] = [
    ["https://claude.ai/api/mcp/auth_callback", "claude"],
    ["https://claude.com/api/mcp/auth_callback", "claude"],
    ["https://chatgpt.com/connector_platform_oauth_redirect", "chatgpt"],
    ["http://localhost:1/callback", "local"],
    ["http://127.0.0.1:65535/callback", "local"],
    ["http://localhost:8080/callback", "local"],
  ];
  for (const [u, app] of accepted) it("accepts " + u, () => expect(appOf(u)).toBe(app));

  const refused: unknown[] = [
    "https://claude.ai.evil.example/api/mcp/auth_callback",
    "https://claude.ai@evil.example/api/mcp/auth_callback",
    "https://claude.ai/api/mcp/auth_callback/",
    "https://claude.ai/api/mcp/auth_callback#x",
    "https://claude.ai/api/mcp/auth_callback?x=1",
    "http://claude.ai/api/mcp/auth_callback",
    "HTTPS://CLAUDE.AI/api/mcp/auth_callback",
    "http://localhost:0/callback",
    "http://localhost:65536/callback",
    "http://localhost:080/callback",
    "http://localhost:80/callback\n",
    "http://localhost:8080/callback/",
    "http://localhost:8080/Callback",
    "http://[::1]:8080/callback",
    "https://localhost:8080/callback",
    "http://localhost/callback",
    "https://chatgpt.com/connector/oauth/abc",
    "x".repeat(201),
    "https://claude.ai/api/mcp/auth_callback" + "a".repeat(200),
    null, undefined, 42, {}, ["https://claude.ai/api/mcp/auth_callback"],
  ];
  for (const u of refused) it("refuses " + JSON.stringify(u)?.slice(0, 60), () => expect(appOf(u)).toBeNull());
});

describe("metadata", () => {
  it("the authorization server document", async () => {
    const r = authorizationServerMetadata(ISSUER);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/json");
    expect(r.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("access-control-allow-methods")).toBe("GET, HEAD, OPTIONS");
    expect(await r.json()).toEqual({
      issuer: ISSUER,
      authorization_endpoint: ISSUER + "/account",
      token_endpoint: ISSUER + "/oauth/token",
      registration_endpoint: ISSUER + "/oauth/register",
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      authorization_response_iss_parameter_supported: true,
    });
  });
  it("the protected resource document", async () => {
    const r = protectedResourceMetadata(ISSUER);
    expect(r.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(await r.json()).toEqual({
      resource: ISSUER + "/mcp",
      authorization_servers: [ISSUER],
      bearer_methods_supported: ["header"],
    });
  });
  it("the issuer is the identical string in both, and is never normalised", async () => {
    for (const iss of [ISSUER, ISSUER + "/"]) {
      const a = (await authorizationServerMetadata(iss).json()) as Record<string, unknown>;
      const b = (await protectedResourceMetadata(iss).json()) as { authorization_servers: string[]; resource: string };
      expect(b.authorization_servers[0]).toBe(a.issuer);
      expect(a.issuer).toBe(iss);
      expect(b.resource).toBe(iss + "/mcp");
    }
    const a = (await authorizationServerMetadata(ISSUER + "/").json()) as Record<string, string>;
    expect(a.token_endpoint).toBe(ISSUER + "//oauth/token");
  });
});

const reg = (body: unknown, init: RequestInit = {}) =>
  register(new Request(ISSUER + "/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...init,
  }));

function noStore(r: Response) {
  expect(r.headers.get("cache-control")).toBe("no-store");
  expect(r.headers.get("pragma")).toBe("no-cache");
}

describe("register", () => {
  it("201 with the fixed shape and no echo of the app's claims", async () => {
    const r = await reg({ redirect_uris: [CLAUDE], client_name: "zq9marker", logo_uri: "zq9marker", scope: "zq9marker" });
    expect(r.status).toBe(201);
    noStore(r);
    const b = (await r.json()) as Record<string, unknown>;
    expect(Object.keys(b).sort()).toEqual(["client_id", "client_id_issued_at", "grant_types", "redirect_uris",
      "response_types", "token_endpoint_auth_method"]);
    expect(b.client_id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect((b.client_id as string).length).toBe(32);
    expect(typeof b.client_id_issued_at).toBe("number");
    expect(b.redirect_uris).toEqual([CLAUDE]);
    expect(b.token_endpoint_auth_method).toBe("none");
    expect(b.grant_types).toEqual(["authorization_code", "refresh_token"]);
    expect(b.response_types).toEqual(["code"]);
    expect(JSON.stringify(b)).not.toContain("zq9marker");
  });
  it("two calls give different client ids", async () => {
    const a = (await (await reg({ redirect_uris: [CLAUDE] })).json()) as { client_id: string };
    const b = (await (await reg({ redirect_uris: [CLAUDE] })).json()) as { client_id: string };
    expect(a.client_id).not.toBe(b.client_id);
  });
  it("accepts declared metadata that is within what is offered", async () => {
    const r = await reg({ redirect_uris: [CLAUDE, "http://localhost:8080/callback"], token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] });
    expect(r.status).toBe(201);
  });
  it("415 for another content type", async () => {
    const r = await reg({ redirect_uris: [CLAUDE] }, { headers: { "Content-Type": "text/plain" } });
    expect(r.status).toBe(415);
    expect(((await r.json()) as { error: string }).error).toBe("invalid_request");
  });
  it("allows content type parameters", async () => {
    const r = await reg({ redirect_uris: [CLAUDE] }, { headers: { "Content-Type": "application/json; charset=utf-8" } });
    expect(r.status).toBe(201);
  });
  for (const [name, body] of [
    ["not JSON", "{nope"],
    ["an array", "[]"],
    ["null", "null"],
    ["a string", '"x"'],
  ] as const) {
    it("400 invalid_client_metadata for " + name, async () => {
      const r = await reg(body);
      expect(r.status).toBe(400);
      expect(((await r.json()) as { error: string }).error).toBe("invalid_client_metadata");
    });
  }
  for (const [name, uris] of [
    ["missing", undefined],
    ["empty", []],
    ["not an array", CLAUDE],
    ["a refused address", ["https://evil.example/cb"]],
    ["one refused among good", [CLAUDE, "http://localhost:80/callback/"]],
    ["a number", [5]],
    ["duplicates", [CLAUDE, CLAUDE]],
    ["eleven", Array.from({ length: 11 }, (_, i) => "http://localhost:" + (i + 1) + "/callback")],
  ] as const) {
    it("400 invalid_redirect_uri for " + name, async () => {
      const r = await reg({ redirect_uris: uris });
      expect(r.status).toBe(400);
      expect(((await r.json()) as { error: string }).error).toBe("invalid_redirect_uri");
    });
  }
  it("ten addresses are fine", async () => {
    const r = await reg({ redirect_uris: Array.from({ length: 10 }, (_, i) => "http://localhost:" + (i + 1) + "/callback") });
    expect(r.status).toBe(201);
  });
  for (const extra of [
    { token_endpoint_auth_method: "client_secret_basic" },
    { grant_types: ["implicit"] },
    { grant_types: "authorization_code" },
    { response_types: ["token"] },
    { response_types: ["code", "id_token"] },
  ]) {
    it("400 invalid_client_metadata for " + JSON.stringify(extra), async () => {
      const r = await reg({ redirect_uris: [CLAUDE], ...extra });
      expect(r.status).toBe(400);
      expect(((await r.json()) as { error: string }).error).toBe("invalid_client_metadata");
    });
  }
  it("413 by Content-Length and by a long body", async () => {
    const a = await reg({ redirect_uris: [CLAUDE] }, { headers: { "Content-Type": "application/json", "Content-Length": "16385" } });
    expect(a.status).toBe(413);
    const b = await reg(JSON.stringify({ redirect_uris: [CLAUDE], client_name: "x".repeat(16400) }));
    expect(b.status).toBe(413);
  });
  it("405 with Allow for GET, 204 for OPTIONS", async () => {
    const g = await register(new Request(ISSUER + "/oauth/register"));
    expect(g.status).toBe(405);
    expect(g.headers.get("allow")).toBe("POST");
    const o = await register(new Request(ISSUER + "/oauth/register", { method: "OPTIONS" }));
    expect(o.status).toBe(204);
    expect(o.headers.get("access-control-allow-origin")).toBe("*");
    expect(o.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(o.headers.get("access-control-allow-headers")).toBe("Content-Type");
    expect(o.headers.get("access-control-max-age")).toBe("86400");
  });
});

function stub(answer: { status: number; body: unknown } | "reject" | "throw") {
  const seen = { calls: 0, fn: "", args: {} as Record<string, string> };
  const rpc: Rpc = async (fn, args) => {
    seen.calls++;
    seen.fn = fn;
    seen.args = args;
    if (answer === "reject") throw new Error("network");
    if (answer === "throw") throw new Error("boom");
    return answer;
  };
  return { seen, rpc };
}

const REDEEM = { grant_type: "authorization_code", code: CODE, code_verifier: VERIFIER, client_id: CLIENT, redirect_uri: CLAUDE };
const REFRESHING = { grant_type: "refresh_token", refresh_token: REFRESH, client_id: CLIENT };

function tok(fields: Record<string, string>, rpc: Rpc, init: RequestInit = {}) {
  return token(new Request(ISSUER + "/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
    ...init,
  }), ISSUER, rpc);
}
const errOf = async (r: Response) => ((await r.json()) as { error: string }).error;

describe("token: request refusals", () => {
  it("415 for JSON even when well formed", async () => {
    const s = stub({ status: 200, body: GOOD });
    const r = await token(new Request(ISSUER + "/oauth/token", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(REDEEM),
    }), ISSUER, s.rpc);
    expect(r.status).toBe(415);
    expect(await errOf(r)).toBe("invalid_request");
    noStore(r);
    expect(s.seen.calls).toBe(0);
  });
  it("allows content type parameters", async () => {
    const s = stub({ status: 200, body: GOOD });
    const r = await tok(REDEEM, s.rpc, { headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" } });
    expect(r.status).toBe(200);
  });
  it("413 by Content-Length and by a long body", async () => {
    const s = stub({ status: 200, body: GOOD });
    const a = await tok(REDEEM, s.rpc, { headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": "16385" } });
    expect(a.status).toBe(413);
    const b = await tok({ ...REDEEM, junk: "x".repeat(16400) }, s.rpc);
    expect(b.status).toBe(413);
    noStore(b);
    expect(s.seen.calls).toBe(0);
  });
  it("405 with Allow for GET, 204 for OPTIONS", async () => {
    const s = stub({ status: 200, body: GOOD });
    const g = await token(new Request(ISSUER + "/oauth/token"), ISSUER, s.rpc);
    expect(g.status).toBe(405);
    expect(g.headers.get("allow")).toBe("POST");
    const o = await token(new Request(ISSUER + "/oauth/token", { method: "OPTIONS" }), ISSUER, s.rpc);
    expect(o.status).toBe(204);
    expect(o.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(s.seen.calls).toBe(0);
  });
  it("a parameter given twice is invalid_request", async () => {
    const s = stub({ status: 200, body: GOOD });
    const body = new URLSearchParams(REDEEM);
    body.append("code", CODE);
    const r = await token(new Request(ISSUER + "/oauth/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString(),
    }), ISSUER, s.rpc);
    expect(r.status).toBe(400);
    expect(await errOf(r)).toBe("invalid_request");
    expect(s.seen.calls).toBe(0);
  });
  it("resource: absent and exact are fine; anything else is invalid_target", async () => {
    for (const [resource, ok] of [
      [undefined, true], [ISSUER + "/mcp", true],
      [ISSUER + "/mcp/", false], ["https://evil.example/mcp", false], [ISSUER + "/MCP", false], ["", false],
    ] as const) {
      const s = stub({ status: 200, body: GOOD });
      const r = await tok(resource === undefined ? REDEEM : { ...REDEEM, resource }, s.rpc);
      if (ok) expect(r.status).toBe(200);
      else {
        expect(r.status).toBe(400);
        expect(await errOf(r)).toBe("invalid_target");
        expect(s.seen.calls).toBe(0);
      }
    }
  });
  it("an Authorization header is invalid_client; a client_secret is ignored", async () => {
    const s = stub({ status: 200, body: GOOD });
    const a = await tok(REDEEM, s.rpc, { headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic eDp5" } });
    expect(a.status).toBe(400);
    expect(await errOf(a)).toBe("invalid_client");
    expect(s.seen.calls).toBe(0);
    const b = await tok({ ...REDEEM, client_secret: "whatever" }, s.rpc);
    expect(b.status).toBe(200);
    expect(JSON.stringify(s.seen.args)).not.toContain("whatever");
  });
  for (const id of [undefined, "short", "has space 12345", "x".repeat(65), ""]) {
    it("client_id " + JSON.stringify(id) + " is invalid_client", async () => {
      const s = stub({ status: 200, body: GOOD });
      const { client_id: _c, ...rest } = REDEEM;
      const r = await tok(id === undefined ? rest : { ...rest, client_id: id }, s.rpc);
      expect(r.status).toBe(400);
      expect(await errOf(r)).toBe("invalid_client");
      expect(s.seen.calls).toBe(0);
    });
  }
  it("a missing or other grant_type is unsupported_grant_type", async () => {
    for (const f of [{ client_id: CLIENT } as Record<string, string>, { client_id: CLIENT, grant_type: "password" }, { client_id: CLIENT, grant_type: "" }]) {
      const s = stub({ status: 200, body: GOOD });
      const r = await tok(f, s.rpc);
      expect(r.status).toBe(400);
      expect(await errOf(r)).toBe("unsupported_grant_type");
      expect(s.seen.calls).toBe(0);
    }
  });
});

describe("token: shape refusals", () => {
  const bad: [string, Record<string, string>, string][] = [
    ["code with uppercase hex", { ...REDEEM, code: "A".repeat(64) }, "invalid_grant"],
    ["short code", { ...REDEEM, code: "a".repeat(63) }, "invalid_grant"],
    ["verifier too short", { ...REDEEM, code_verifier: "v".repeat(42) }, "invalid_grant"],
    ["verifier too long", { ...REDEEM, code_verifier: "v".repeat(129) }, "invalid_grant"],
    ["verifier with a bad character", { ...REDEEM, code_verifier: "v".repeat(42) + "+" }, "invalid_grant"],
    ["redirect_uri not allowed", { ...REDEEM, redirect_uri: "https://evil.example/cb" }, "invalid_grant"],
    ["redirect_uri with a trailing slash", { ...REDEEM, redirect_uri: CLAUDE + "/" }, "invalid_grant"],
    ["redirect_uri with a leading-zero port", { ...REDEEM, redirect_uri: "http://localhost:080/callback" }, "invalid_grant"],
    ["redirect_uri with :80 oddities", { ...REDEEM, redirect_uri: "http://localhost:80/callback/" }, "invalid_grant"],
    ["redirect_uri over 200", { ...REDEEM, redirect_uri: CLAUDE + "a".repeat(200) }, "invalid_grant"],
    ["redirect_uri empty", { ...REDEEM, redirect_uri: "" }, "invalid_grant"],
    ["refresh key of 95", { ...REFRESHING, refresh_token: "b".repeat(95) }, "invalid_grant"],
    ["refresh key with a bad character", { ...REFRESHING, refresh_token: "g".repeat(96) }, "invalid_grant"],
  ];
  for (const [name, f, code] of bad) {
    it(name, async () => {
      const s = stub({ status: 200, body: GOOD });
      const r = await tok(f, s.rpc);
      expect(r.status).toBe(400);
      expect(await errOf(r)).toBe(code);
      noStore(r);
      expect(s.seen.calls).toBe(0);
    });
  }
  for (const k of ["code", "code_verifier", "redirect_uri"]) {
    it("missing " + k + " is invalid_request", async () => {
      const s = stub({ status: 200, body: GOOD });
      const f: Record<string, string> = { ...REDEEM };
      delete f[k];
      const r = await tok(f, s.rpc);
      expect(r.status).toBe(400);
      expect(await errOf(r)).toBe("invalid_request");
      expect(s.seen.calls).toBe(0);
    });
  }
  it("a missing refresh_token is invalid_request", async () => {
    const s = stub({ status: 200, body: GOOD });
    const r = await tok({ grant_type: "refresh_token", client_id: CLIENT }, s.rpc);
    expect(r.status).toBe(400);
    expect(await errOf(r)).toBe("invalid_request");
    expect(s.seen.calls).toBe(0);
  });
});

describe("token: what the rpc gets and what comes back", () => {
  it("redeem passes the raw strings, once", async () => {
    const s = stub({ status: 200, body: GOOD });
    const r = await tok({ ...REDEEM, redirect_uri: "http://localhost:8080/callback" }, s.rpc);
    expect(r.status).toBe(200);
    expect(s.seen.calls).toBe(1);
    expect(s.seen.fn).toBe("connect_redeem");
    expect(s.seen.args).toEqual({ p_code: CODE, p_verifier: VERIFIER, p_client_id: CLIENT, p_redirect_uri: "http://localhost:8080/callback" });
  });
  it("refresh passes the key and client, once", async () => {
    const s = stub({ status: 200, body: GOOD });
    const r = await tok(REFRESHING, s.rpc);
    expect(r.status).toBe(200);
    expect(s.seen.calls).toBe(1);
    expect(s.seen.fn).toBe("connect_refresh");
    expect(s.seen.args).toEqual({ p_key: REFRESH, p_client_id: CLIENT });
  });

  type Outcome = [string, { status: number; body: unknown } | "reject" | "throw", number, string | null, string | null];
  const outcomes: Outcome[] = [
    ["success", { status: 200, body: GOOD }, 200, null, null],
    ["refused", { status: 200, body: { hint: "refused" } }, 400, "invalid_grant", null],
    ["limit", { status: 200, body: { hint: "limit" } }, 429, "temporarily_unavailable", "3600"],
    ["retry", { status: 200, body: { hint: "retry" } }, 503, "temporarily_unavailable", "1"],
    ["PostgREST 500", { status: 500, body: { message: "zq9marker" } }, 503, "temporarily_unavailable", "5"],
    ["PostgREST 401", { status: 401, body: null }, 503, "temporarily_unavailable", "5"],
    ["200 with another hint", { status: 200, body: { hint: "other" } }, 503, "temporarily_unavailable", "5"],
    ["200 with null", { status: 200, body: null }, 503, "temporarily_unavailable", "5"],
    ["200 with a short access key", { status: 200, body: { ...GOOD, access: "c".repeat(63) } }, 503, "temporarily_unavailable", "5"],
    ["200 with a bad expires_in", { status: 200, body: { ...GOOD, expires_in: 0 } }, 503, "temporarily_unavailable", "5"],
    ["200 with a fractional expires_in", { status: 200, body: { ...GOOD, expires_in: 1.5 } }, 503, "temporarily_unavailable", "5"],
    ["rejection", "reject", 503, "temporarily_unavailable", "5"],
  ];
  for (const [grant, fields] of [["redeem", REDEEM], ["refresh", REFRESHING]] as const) {
    for (const [name, answer, status, error, retry] of outcomes) {
      it(grant + ": " + name, async () => {
        const s = stub(answer);
        const r = await tok(fields, s.rpc);
        expect(r.status).toBe(status);
        expect(s.seen.calls).toBe(1);
        noStore(r);
        expect(r.headers.get("content-type")).toBe("application/json");
        expect(r.headers.get("retry-after")).toBe(retry);
        const b = (await r.json()) as Record<string, unknown>;
        if (error === null) {
          expect(b).toEqual({ access_token: ACCESS, token_type: "Bearer", expires_in: 3600, refresh_token: "d".repeat(96) });
        } else {
          expect(b.error).toBe(error);
          expect(typeof b.error_description).toBe("string");
          expect(JSON.stringify(b)).not.toContain("zq9marker");
        }
      });
    }
  }
  it("an rpc that throws before returning a promise is 503 too, called once", async () => {
    let calls = 0;
    const rpc = ((): never => { calls++; throw new Error("sync"); }) as unknown as Rpc;
    const r = await tok(REDEEM, rpc);
    expect(r.status).toBe(503);
    expect(r.headers.get("retry-after")).toBe("5");
    expect(calls).toBe(1);
  });
  it("a non-OAuth throw inside the handler is a bare 500", async () => {
    const r = await token({ method: "POST", get headers(): Headers { throw new Error("boom"); } } as unknown as Request, ISSUER, stub("reject").rpc);
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: "server_error", error_description: "The server could not answer." });
  });
});

describe("no request string comes back", () => {
  const M = "zq9marker";
  it("in any error body", async () => {
    const s = stub({ status: 200, body: { hint: "refused", detail: M } });
    const rs: Response[] = [];
    const m = (k: string) => M + k;
    rs.push(await tok({ grant_type: m("g"), client_id: CLIENT, code: m("c"), resource: m("r") }, s.rpc));
    rs.push(await tok({ grant_type: m("g"), client_id: m("i") }, s.rpc));
    rs.push(await tok({ grant_type: "authorization_code", client_id: CLIENT, code: m("c"), code_verifier: m("v"), redirect_uri: m("u") }, s.rpc));
    rs.push(await tok({ grant_type: "refresh_token", client_id: CLIENT, refresh_token: m("t"), resource: ISSUER + "/mcp" }, s.rpc));
    rs.push(await tok({ ...REDEEM, redirect_uri: m("u") }, s.rpc));
    rs.push(await tok(REDEEM, s.rpc));
    rs.push(await reg({ redirect_uris: [m("u")], client_name: m("n"), token_endpoint_auth_method: m("a"), [m("k")]: m("x") }));
    rs.push(await reg({ redirect_uris: [CLAUDE], grant_types: [m("g")], client_name: m("n") }));
    rs.push(await reg(m("body"), { headers: { "Content-Type": "application/json" } }));
    for (const r of rs) {
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(await r.text()).not.toContain(M);
    }
  });
});
