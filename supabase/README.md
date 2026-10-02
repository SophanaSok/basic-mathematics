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

Optional: to offer "Continue with Google", enable the Google provider under Authentication →
Providers and set `google: true` in `config.js`.

## What is stored

| Table | Contents |
| --- | --- |
| `user_state` | One row per reader, holding the same JSON the site keeps in `localStorage`: solved exercises, missions, per-exercise attempt records, XP per day, lesson position. |
| `attempts` | One row per answer check by a signed-in reader: chapter, exercise key, section, right or wrong, try number, hint level, whether the solution was open. Typed answers are never stored. |
| `profiles` | An optional display name. |
| `admins` | The user ids allowed to call the aggregate functions. |

Row-level security restricts every row to its owner. `exercise_stats()` and `chapter_stats()`
return aggregates only, and only to admins. `delete_my_account()` removes the caller's auth user,
and every table cascades from it.

Signed-out visitors never contact Supabase: the SDK is not even downloaded unless a session
exists or the reader opens the account page.
