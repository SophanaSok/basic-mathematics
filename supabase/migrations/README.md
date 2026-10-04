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

`node tools/check-static.js --only=migrations` compares the working tree with the commit the
branch left `main` at. It fails when:

- `schema.sql` differs from its content there and no migration file has been added since;
- a migration that was already there has been edited, renamed or deleted (what is on `main` has
  been applied, by rule 4);
- a new file's timestamp is not later than every one already there, or the file holds no SQL;
- a file name does not match the format, or two files share a timestamp.

On `main` itself the comparison is with the last commit, so it judges only what is not yet
committed. `--migrations-base=<ref>` names another commit to compare against; continuous
integration has to pass the commit being merged into. `--base` is not used: it is the
progress-keys base, older than every file here. Only in a checkout where `main` does not resolve
does the check fall back to it, and it then prints a warning, because against that base it cannot
catch a missing migration.

It cannot see whether a migration was applied to the live project, or whether its statements
match the change to `schema.sql`. Those two are on you.

## Applying one

Today: open the file, paste it into the dashboard's SQL editor (Dashboard → SQL → New query) and
run it, the same way `schema.sql` is run. The Supabase CLI is not part of this repository yet.

**Later, if the CLI is adopted (not set up, not tested here).** The file names already follow the
CLI's format, so the folder can be handed to it (`supabase db push` applies the files a project
has not recorded yet, in order). Statements run through the SQL editor are not recorded in the
CLI's migration history, and Supabase's
[migrations guide](https://supabase.com/docs/guides/deployment/database-migrations) (read
2026-10-04) warns that changes made that way bypass the history and make `db push` fail with sync
errors. The reconciliation it documents is to mark each file that was already applied by hand as
applied, without running it again:
`supabase migration repair --status applied <timestamp>`, once per file, before the first push.
From then on every change goes through the CLI and none through the SQL editor. Read the guide
again at that point; this paragraph is a pointer, not a tested procedure.
