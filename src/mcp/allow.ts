/* Where an authorization code may be sent (decision 0016). The SQL is the authority:
   private.connect_app in supabase/schema.sql decides at approval and again at redemption;
   this is the worker's copy, so that register and token refuse what the database would.

   The comparison is on the string's bytes, the SQL's. `new URL()` is never used: it drops
   `:80`, lowercases the host and normalises the path, and would accept values the SQL
   refuses.

   Pure: no `window`, no DOM, no storage. */

export type App = "claude" | "chatgpt" | "local";

export const CLAUDE_CALLBACKS: readonly string[] = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
];
export const CHATGPT_CALLBACK = "https://chatgpt.com/connector_platform_oauth_redirect";

const LOCAL = /^http:\/\/(?:localhost|127\.0\.0\.1):([1-9][0-9]{0,4})\/callback$/;

/** The app a redirect address belongs to, or null. Mirrors private.connect_app in
    supabase/schema.sql:1048 exactly: the SQL is the authority, this is the worker's copy. */
export function appOf(uri: unknown): App | null {
  if (typeof uri !== "string" || uri.length > 200) return null;
  if (CLAUDE_CALLBACKS.includes(uri)) return "claude";
  if (uri === CHATGPT_CALLBACK) return "chatgpt";
  const m = LOCAL.exec(uri);
  if (m && Number(m[1]) <= 65535) return "local";
  return null;
}
