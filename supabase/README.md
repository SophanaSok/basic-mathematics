# Switching accounts on

The site works without any of this. Accounts add one thing: a signed-in reader's progress,
streak, and attempt history follow them between browsers and devices — and you, as the author,
get an aggregate view of which exercises people struggle with.

1. **Create a project** at [supabase.com](https://supabase.com) (the free tier is enough).
2. **Create the tables.** Dashboard → SQL → New query, paste the whole of
   [`schema.sql`](schema.sql), and run it. It is safe to run again later.
3. **Allow the site's address.** Dashboard → Authentication → URL Configuration:
   - Site URL: `https://sophanasok.github.io/basic-mathematics/`
   - Redirect URLs: `https://sophanasok.github.io/basic-mathematics/account.html` and, for local
     work, `http://localhost:8000/account.html`
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
below) *before* deploying the new site. Every sync now writes a `game` column, and until it exists
each save fails with a "column not found" error and nothing syncs:

```sql
alter table public.user_state add column if not exists game jsonb not null default '{}'::jsonb;
```

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
| Google | Google Cloud console → Google Auth Platform | Branding: app name and support email. Audience: External. Data access: only `openid`, `userinfo.email`, `userinfo.profile`. Clients → Web application: authorised JavaScript origin `https://sophanasok.github.io`, authorised redirect URI = the callback URL | With only those three scopes Google applies no test-user list and no "unverified app" warning. The consent screen names `<project-ref>.supabase.co` rather than the course unless you complete brand verification |
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

Signed-out visitors never contact Supabase: the SDK is not even downloaded unless a session
exists or the reader opens the account page.
