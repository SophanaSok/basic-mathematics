/* The site's settings (assets/config.js, window.BM_CONFIG), read with their defaults.
   assets/config.js is imported after site.js and game.js in every entry, so a setting is
   read at the moment it is used, never when a script starts: readConfig(window.BM_CONFIG)
   there, by the caller. Pure: it is handed the raw object and touches nothing else. */

export interface Config {
  /** Supabase project URL and anon key; both empty means no accounts */
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** the sign-in services to offer, in order */
  providers: string[];
  /** false while the project cannot send email to the public */
  emailDelivery: boolean;
  learn: {
    /** "off" is the event sync's kill switch; any other value means "on" */
    events: "on" | "off";
  };
  /** "off" is the Daily board's kill switch (nothing submitted or fetched, no board in the
      Arena, no switch on the account page); any other value means "on" */
  board: "on" | "off";
  /** "off" hides the Learners panel on the account page (no learner is listed, added, switched or
      deleted from there); any other value means "on" */
  learners: "on" | "off";
  /** "off" hides the companion on every chapter page; any other value means "on" */
  companion: "on" | "off";
  /** "off" hides the pool and Mochi's button; earns keep accruing; any other value means "on" */
  pet: "on" | "off";
  /** "off" hides the shop tab and refuses buys (decision 0011); any other value means "on" */
  shop: "on" | "off";
}

function obj(x: unknown): Record<string, unknown> { return x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {}; }
function str(x: unknown): string { return typeof x === "string" ? x : ""; }

/** The settings with every default filled in: a missing or damaged field takes its
    default, and emailDelivery is on unless it is false. Not yet all of how
    assets/account.js reads them: providers here are every string in the list, in order,
    while account.js also drops an id it has no button for and a repeated one, and offers
    none unless both Supabase strings are set. Those rules move in with account.js. */
export function readConfig(raw: unknown): Config {
  const c = obj(raw), learn = obj(c.learn);
  return {
    supabaseUrl: str(c.supabaseUrl),
    supabaseAnonKey: str(c.supabaseAnonKey),
    providers: Array.isArray(c.providers) ? c.providers.filter((p): p is string => typeof p === "string") : [],
    emailDelivery: c.emailDelivery !== false,
    learn: { events: learn.events === "off" ? "off" : "on" },
    board: c.board === "off" ? "off" : "on",
    learners: c.learners === "off" ? "off" : "on",
    companion: c.companion === "off" ? "off" : "on",
    pet: c.pet === "off" ? "off" : "on",
    shop: c.shop === "off" ? "off" : "on"
  };
}
