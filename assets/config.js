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
  providers: ["github"],
  /* false while the project cannot send email to the public (Supabase's own mailer only
     reaches the project's team): leaves out "Email me a sign-in link" and "Forgot
     password", which work only through an email. Set to true once custom SMTP is set up. */
  emailDelivery: false
};
