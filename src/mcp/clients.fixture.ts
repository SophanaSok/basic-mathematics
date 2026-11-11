/* The request shapes real MCP clients send to /mcp, one row each, replayed by worker.test.ts.
   `observed` rows were recorded from a real client; `spec` rows are built from the published
   revision and are assumptions until a client is seen sending them. Header names are lower case.
   The body of a row is a JSON value; `auth` says whether the replay adds the connector's key. */

export interface ClientShape {
  name: string;
  source: "observed" | "spec";
  note: string;
  method: "POST";
  headers: Record<string, string>;
  body: unknown;
  auth: boolean;
}

const initialize2025_11_25 = {
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "claude-ai", version: "0.1.0" } }
};

const discover2026_07_28 = {
  jsonrpc: "2.0", id: 1, method: "server/discover",
  params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } }
};

const jsonHeaders = {
  accept: "application/json, text/event-stream",
  "content-type": "application/json"
};

export const CLIENT_SHAPES: ClientShape[] = [
  {
    name: "claude.ai pre-check",
    source: "observed",
    note: "Observed 2026-11-10 in the production tail: POST /mcp, no Origin, no Authorization, python-httpx, "
      + "content-length 158. The headers are as recorded; the body was not visible and is assumed to be an initialize.",
    method: "POST",
    headers: { ...jsonHeaders, "mcp-protocol-version": "2025-11-25", "user-agent": "python-httpx/0.28.1" },
    body: initialize2025_11_25,
    auth: false
  },
  {
    name: "claude.ai pre-check after OAuth",
    source: "spec",
    note: "The same request once the client holds a key; assumed, not observed.",
    method: "POST",
    headers: { ...jsonHeaders, "mcp-protocol-version": "2025-11-25", "user-agent": "python-httpx/0.28.1" },
    body: initialize2025_11_25,
    auth: true
  },
  {
    name: "tools/list on 2025-11-25",
    source: "spec",
    note: "A legacy-revision client listing tools after initialize.",
    method: "POST",
    headers: { ...jsonHeaders, "mcp-protocol-version": "2025-11-25" },
    body: { jsonrpc: "2.0", id: 2, method: "tools/list" },
    auth: true
  },
  {
    name: "modern probe, no key",
    source: "spec",
    note: "Revision 2026-07-28: a dual-era client tries server/discover first. Not implemented here; "
      + "without a key the answer is the 401 that starts OAuth.",
    method: "POST",
    headers: { ...jsonHeaders, "mcp-protocol-version": "2026-07-28", "mcp-method": "server/discover" },
    body: discover2026_07_28,
    auth: false
  },
  {
    name: "modern probe, with key",
    source: "spec",
    note: "With a key the refusal must be a 400 whose body is not a modern error code (-32020, -32021, "
      + "-32022) and not a 404, so the client falls back to initialize.",
    method: "POST",
    headers: { ...jsonHeaders, "mcp-protocol-version": "2026-07-28", "mcp-method": "server/discover" },
    body: discover2026_07_28,
    auth: true
  },
  {
    name: "initialize with an unknown future header",
    source: "spec",
    note: "An initialize is never refused on the header; its body negotiates.",
    method: "POST",
    headers: { ...jsonHeaders, "mcp-protocol-version": "2099-01-01" },
    body: { ...initialize2025_11_25, params: { ...initialize2025_11_25.params, protocolVersion: "2099-01-01" } },
    auth: true
  }
];
