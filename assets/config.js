/* Account settings for this copy of the site.
   Leave both strings empty and there are no accounts: nothing is loaded from Supabase,
   nothing is sent anywhere, and progress lives in the browser as it always has.

   To switch accounts on, follow supabase/README.md, then paste the project URL and the
   anon (publishable) key below. That key is meant to be public — row-level security in
   supabase/schema.sql is what keeps each reader's rows their own. Never put the
   service-role key here. */
window.BM_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  /* set to true once the Google provider is enabled in the Supabase dashboard */
  google: false
};
