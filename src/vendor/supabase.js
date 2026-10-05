/* supabase-js from npm, behind a dynamic import. No entry imports this file:
   assets/account.js imports it with import() when it needs a client, which is on the
   account page and, elsewhere, only when Supabase has left a session in this browser,
   so a signed-out reader on an ordinary page never downloads it
   (tools/game/account.test.js proves it by the requests the pages make). Re-exported
   from a file of its own so the chunk has this file's name, bundle/supabase.js
   (vite.config.ts bundleNames), rather than one the bundler made up. */
export { createClient } from "@supabase/supabase-js";
