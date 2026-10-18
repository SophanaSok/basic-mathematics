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
};
