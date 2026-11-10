/* Account settings for this copy of the site.
   Leave both strings empty and there are no accounts: nothing is loaded from Supabase,
   nothing is sent anywhere, and progress lives in the browser as it always has.

   To switch accounts on, follow supabase/README.md, then paste the project URL and the
   anon (publishable) key below. That key is meant to be public — row-level security in
   supabase/schema.sql is what keeps each reader's rows their own. Never put the
   service-role key here. */
window.BM_CONFIG = {
  supabaseUrl: "https://jfidvrzonyzfstnykzly.supabase.co",
  supabaseAnonKey: "sb_publishable_JCD6rFC0brc-k3j-SbmNow_74zaBKhp",
  /* Sign-in buttons to show on the account page, in this order. Add an id only AFTER that
     service is switched on in the Supabase dashboard (supabase/README.md, "Sign-in
     providers"): a button for one that is not takes the reader to an error page.
     Ids: "google", "github", "discord", "facebook", "azure" (Microsoft). */
  providers: ["google", "github"],
  /* false while the project cannot send email to the public (Supabase's own mailer only
     reaches the project's team): leaves out "Email me a sign-in link" and "Forgot
     password", which work only through an email. Set to true once custom SMTP is set up. */
  emailDelivery: false
  /* The Daily board (docs/decisions/0006-keyboard-and-speedruns.md) is on by default, for
     signed-in readers who join it. To switch it off, add  board: "off"  as a setting here
     (with a comma after emailDelivery's value): nothing is sent to or fetched from the
     board, the Arena shows no board and the account page shows no Daily board switch.
     Apply the board's part of supabase/schema.sql before leaving it on (supabase/README.md). */
  /* The answer log's sync is on by default for signed-in readers. To switch it off, add
     learn: { events: "off" }  as a setting here (with a comma after the previous setting's
     value, as the board's comment says): nothing is sent to or pulled from events; the
     browser's own log is still kept. */
  /* The Learners panel on the account page is on by default. To hide it, add  learners: "off"
     as a setting here (with a comma after the previous setting's value): the panel is not
     drawn and the account page makes no learner_* calls; a browser already playing as a
     managed learner keeps doing so (its learner is still checked on load) until it signs
     out. A server stop is  revoke execute on function
     public.learner_add(text, boolean, smallint) from authenticated  (docs/OPERATIONS.md). */
  /* The companion (docs/decisions/0013-mochi.md), Mochi, on the chapter pages and in the
     Arena, is on by default. To hide it everywhere, add  companion: "off"  as a setting
     here (with a comma after the previous setting's value): no figure is drawn and no model
     or pose sheet is fetched, and the settings sheet's Companion switch then changes nothing. It uses
     no network and no account. */
  /* The pool (docs/decisions/0015-mochi-pool.md), Mochi's pond and its button, is on by default. To
     hide it, add  pet: "off"  as a setting here (with a comma after the previous setting's value):
     no pool is drawn and its code is not fetched; what a reader earns keeps accruing in the
     browser. It uses no network and no account. */
  /* The shop tab in the pool is on by default. To hide it, add  shop: "off"  as a setting here
     (with a comma after the previous setting's value): no tab is drawn and a buy is refused
     (docs/decisions/0011). It uses no network and no account. */
  /* Mochi in your AI (docs/decisions/0016-mochi-in-your-ai.md), the read-only connector an
     account holder adds to their own Claude or ChatGPT, is OFF while this setting is absent.
     Add  connect: "preview"  (with a comma after the previous setting's value) and the worker
     answers /mcp and the sign-in flow works, but the account page shows its Connect your AI
     panel only to an account that already has a connection (the owner's end-to-end check,
     OPERATIONS.md "The connector"); add  connect: "on"  and the panel, with the address and
     the steps, shows to every signed-in account holder. Only those two exact strings count.
     The value is baked into dist/_worker.js at build time, so a change here and the build go
     together (npm run check:dist refuses a worker built from a different value). The server
     stop, which outlives every open tab, is in OPERATIONS.md "Kill switches". */
};
