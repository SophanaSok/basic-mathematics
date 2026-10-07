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
}

function obj(x: unknown): Record<string, unknown> { return x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {}; }
function str(x: unknown): string { return typeof x === "string" ? x : ""; }

/** The settings with every default filled in, as assets/account.js reads them: a missing
    or damaged field takes its default, and emailDelivery is on unless it is false. */
export function readConfig(raw: unknown): Config {
  const c = obj(raw), learn = obj(c.learn);
  return {
    supabaseUrl: str(c.supabaseUrl),
    supabaseAnonKey: str(c.supabaseAnonKey),
    providers: Array.isArray(c.providers) ? c.providers.filter((p): p is string => typeof p === "string") : [],
    emailDelivery: c.emailDelivery !== false,
    learn: { events: learn.events === "off" ? "off" : "on" }
  };
}
