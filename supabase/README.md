# Switching accounts on

The site works without any of this. Accounts add one thing: a signed-in reader's progress,
streak, and attempt history follow them between browsers and devices — and you, as the author,
get an aggregate view of which exercises people struggle with.

1. **Create a project** at [supabase.com](https://supabase.com) (the free tier is enough).
2. **Create the tables.** Dashboard → SQL → New query, paste the whole of
   [`schema.sql`](schema.sql), and run it. It is safe to run again later.
3. **Allow the site's address.** Dashboard → Authentication → URL Configuration:
   - Site URL: `https://sophanasok.github.io/basic-mathematics/` until the site has moved to
     Cloudflare Pages, then `https://learn.groundupmath.org/` (`OPERATIONS.md`, 8.6)
   - Redirect URLs: `https://sophanasok.github.io/basic-mathematics/account.html` and, for local
     work, `http://localhost:8000/account.html`; for the move, also
     `https://learn.groundupmath.org/account.html`, `https://groundupmath.pages.dev/account.html`
     (the project's own address) and `https://*.groundupmath.pages.dev/**` (its previews).
     The site builds every address it hands Supabase from the page it is on
     (`assets/account.js` `pageUrl()`), so each address it is served from needs its entry
     ([`OPERATIONS.md`](../OPERATIONS.md), 8.4)
4. **Give the site its keys.** Dashboard → Project Settings → API. Copy the project URL and the
   `anon` / publishable key into [`../assets/config.js`](../assets/config.js). Never the
   service-role key — `config.js` is public.
5. **Make yourself an admin** so `insights.html` shows you the aggregates. Sign up on the site
   first, then run in the SQL editor:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```

**Upgrading a project set up before the game layer?** Run `schema.sql` again (or just the one line
below) *before* deploying the new site. Until the `game` column exists the site leaves it out of
every save: the rest still syncs, but achievements, medals and review boxes stay in each browser
and do not follow the reader. Once the column is there, the next sync from each browser fills it.

```sql
alter table public.user_state add column if not exists game jsonb not null default '{}'::jsonb;
```

## Older and newer copies of the site

Readers do not all run the same copy of the site: a tab stays open, a browser keeps old scripts.
The sync in [`../assets/account.js`](../assets/account.js) is written so that an older copy and a
newer one can save to the same account, and so that the tables and the site need not change at
the same instant. Running the SQL first is still the rule; these are what happens when it was not.

- **Fields the site does not know are kept.** Inside the `jsonb` columns, a field with no merge
  rule is carried through every merge and written back: kept if one side has it, and if both do,
  the value whose canonical JSON (keys sorted at every level) is the later string. Known fields
  merge as before. See the main README for where this applies, and for its limits: an object
  under a new key of a column keyed by chapter, section, mode or set is merged as a record of
  that kind, not passed through whole.
- **Columns the site does not know are left alone.** A save is an `update` naming only the columns
  this copy knows, so a column added for a later release keeps its value. That holds for a reset
  as well: an older copy empties the columns it knows and cannot empty one it cannot name, so a
  release that adds a `user_state` column must clear it itself when it sees `reset_at` advance.
- **Columns the server does not have are left out.** The site reads its row with `select *`, sees
  which columns exist, and sends only those. A new account has no row to read, so its first save
  may be refused once (PostgREST `PGRST204`, "Could not find the '…' column of 'user_state' in the
  schema cache") and is then repeated without that column. Nothing fails; what the column would
  hold stays in the browser until the column exists.
- **A missing `attempts` table switches the attempt log off.** The insert is refused (`PGRST205`),
  the checks stay queued in the page, and the sync still succeeds. The page does not send the
  log again with every save: it asks once every five minutes, keeps the newest 500 checks
  meanwhile, and sends them when the table is there. The queue lives in the page, so it is lost
  when the page is closed. The author's aggregate view then has nothing to read.
- **The data carries a shape number.** `game.v` inside the `game` column; absent means 1, and no
  release writes it yet. A later release that changes what an existing field means saves a
  larger number. A copy of the site that reads a number above the one it understands merges the
  row into the browser, writes nothing (neither `user_state` nor `attempts`), and asks the reader
  to reload. There is no column for it and no SQL to run. It needs the `game` column to travel.

**Changing the schema later?** Every change to `schema.sql` ships with a new file in
[`migrations/`](migrations/README.md), and that file is run on the live project *before* the pull
request that needs it is merged. The release order, the queries that confirm it landed, quotas,
secrets and what to do when sync breaks are in [`../OPERATIONS.md`](../OPERATIONS.md).

## Sign-in providers (optional)

Readers can also sign in with an account they already have at another service. The site knows
five: `google`, `github`, `discord`, `facebook` and `azure` (Microsoft). Each one is switched on
in two places, **in this order**:

1. Register the site with the service and enable it in Supabase (the per-service notes below).
2. Add its id to `providers` in [`../assets/config.js`](../assets/config.js), for example
   `providers: ["google", "github"]`. The order of the list is the order of the buttons.

A button for a service that is not enabled in Supabase takes the reader to an error page, so
never do step 2 first. To remove a service, take its id out of `config.js` and deploy, then
disable it in Supabase.

Every service asks for the same **callback URL**, which is Supabase's, not the site's:
`https://<project-ref>.supabase.co/auth/v1/callback`. Client secrets go only into the Supabase
dashboard (Authentication → Sign In / Providers), never into this repository. Nothing in step 3
above needs to change.

| Service | Where to register | What to enter there | Notes |
| --- | --- | --- | --- |
| Google | Google Cloud console → Google Auth Platform | Branding: app name and support email. Audience: External. Data access: only `openid`, `userinfo.email`, `userinfo.profile`. Clients → Web application: authorised JavaScript origins `https://sophanasok.github.io` and, for the move, `https://learn.groundupmath.org`, authorised redirect URI = the callback URL | With only those three scopes Google applies no test-user list and no "unverified app" warning. The consent screen names `<project-ref>.supabase.co` rather than the course unless you complete brand verification |
| GitHub | github.com → Settings → Developer settings → OAuth Apps → New OAuth App | Name, homepage URL (the site), authorization callback URL = the callback URL. Generate a client secret | An OAuth App, not a GitHub App. Private email addresses still work |
| Discord | discord.com/developers → New Application → OAuth2 | Redirects: the callback URL. Copy the client id, reset and copy the secret | A reader whose Discord email is unverified is refused |
| Facebook | developers.facebook.com → Create App → "Authenticate and request data from users with Facebook Login" | Permissions `email` and `public_profile`; Valid OAuth Redirect URIs: the callback URL; in App settings → Basic an icon and a privacy policy URL (`…/about.html#progress`); then switch the app to Live | While the app is in Development only people with a role on it can sign in. A Facebook account with no confirmed email is refused |
| Microsoft (`azure`) | Entra admin center → App registrations → New registration | Accounts in any organisation and personal Microsoft accounts; redirect URI (Web) = the callback URL; Certificates & secrets → new client secret | The secret expires (24 months at most): note the date, because sign-in stops when it lapses. School and work tenants can block apps their admin has not approved |

In the Supabase dashboard, leave **Allow new users to sign up** on (a first sign-in through a
service creates the account), leave each provider's **Allow users without an email** off, and
leave **Confirm email** on. A service that cannot vouch for the reader's email address is then
refused, and the account page says so. Turning confirmation off instead would let an unverified
address be linked to an existing account.

Two sign-ins open the **same account** only when both services report the same verified email
address. Otherwise each gets its own account with its own progress, which is why the account
page tells readers to use the same way in each time.

`emailDelivery: false` in `config.js` leaves out "Email me a sign-in link" and "Forgot password".
Both work only through an email, and Supabase's built-in mailer delivers only to the project's
own team. Set it to `true` once custom SMTP is configured (Authentication → Emails).

To try a service before it goes live, serve the repo at `http://localhost:8000` (already on the
redirect list), add the id to `providers` locally, and open `account.html`.

## What is stored

| Table | Contents |
| --- | --- |
| `user_state` | One row per reader, holding the same JSON the site keeps in `localStorage`: solved exercises, missions, per-exercise attempt records, XP per day, lesson position, and the game record (achievements, compared solutions, Arena bests, rematch medals, review boxes). Play settings and the combo meter stay in the browser. |
| `attempts` | One row per answer check by a signed-in reader: chapter, exercise key, section, right or wrong, try number, hint level, whether the solution was open. Typed answers are never stored. |
| `profiles` | An optional display name. |
| `admins` | The user ids allowed to call the aggregate functions. |

Row-level security restricts every row to its owner. `exercise_stats()` and `chapter_stats()`
return aggregates only, and only to admins. `delete_my_account()` removes the caller's auth user,
and every table cascades from it.

Signed-out visitors never contact Supabase: the SDK (supabase-js, an npm dependency bundled as
`dist/bundle/supabase.js` and fetched from the site itself, never from a CDN) is not even
downloaded unless a session exists or the reader opens the account page.
`tools/game/account.test.js` lists the requests a chapter page makes to prove it.
