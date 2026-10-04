# Database migrations

One file per change to the database, named the way the Supabase CLI names them:

```
<YYYYMMDDHHMMSS>_<name>.sql        20261004000000_baseline.sql
```

The first fourteen digits are the UTC date and time the file was written; the name is lower-case
letters, digits and underscores. Nothing else lives in this folder except this README.

## The rule

1. **[`../schema.sql`](../schema.sql) stays the whole schema.** It is idempotent, and pasting it
   into the SQL editor of a fresh project is still all a new setup needs
   ([`../README.md`](../README.md)).
2. **Every change to `schema.sql` ships with a new migration file** in the same pull request,
   holding only the statements that take the live project from the old schema to the new one.
   Those statements are idempotent too (`create table if not exists`,
   `add column if not exists`, `create or replace function`, `drop policy if exists` before
   `create policy`), so running a file twice does no harm.
3. **Migrations are applied in filename order**, which is time order. A new file's timestamp is
   later than every file already here. A file that has been applied is never edited or deleted;
   a mistake is corrected by a newer file.
4. **A migration is applied to the live project before the pull request that needs it is
   merged.** The site deploys on merge. If the new site arrives first, every signed-in sync fails
   until the SQL has been run; this happened to the `game` column (see "Upgrading" in
   [`../README.md`](../README.md)).
5. **A migration is backward compatible with the site that is already deployed**, because for a
   while the old site runs against the new schema, and old tabs stay open for longer. Add columns
   (nullable or with a default) and add tables. Never rename or drop a column, table or function
   in the same release that stops using it; drop it in a later release, once no deployed site
   reads or writes it.

The step-by-step release order, the query that confirms a migration landed, and how to undo each
step are in [`../../OPERATIONS.md`](../../OPERATIONS.md).

## What checks it

`node tools/check-static.js --only=migrations --base=<ref>` fails when `schema.sql` differs from
its content at `<ref>` and no migration file has been added since `<ref>`, when a file name here
does not match the format, and when two files share a timestamp. It cannot see whether a
migration was applied to the live project, or whether its statements match the change to
`schema.sql`. Those two are on you.

## Applying one

Today: open the file, paste it into the dashboard's SQL editor (Dashboard → SQL → New query) and
run it, the same way `schema.sql` is run. The Supabase CLI is not part of this repository yet.

The file names already follow the CLI's format, so the folder can be handed to it later
(`supabase db push` applies the files a project has not recorded yet, in order). Statements run
through the SQL editor are not recorded in the CLI's history table, so on first use the CLI will
treat every file here as not yet applied. Because they are idempotent, letting it run them again
is harmless. Read the
[Supabase migrations guide](https://supabase.com/docs/guides/deployment/database-migrations)
before the first push.
