# 0016: Mochi in your AI

## Decision

Decided by the owner on 2026-11-09.

**A learner can connect their own AI assistant to the course, and Mochi tutors them
there.** The site offers a remote MCP connector at `https://learn.groundupmath.org/mcp`.
The account holder adds it to Claude or ChatGPT as a custom connector, signs in to the
course, approves, and from then on that assistant can read their progress, the course
map, an exercise's question and its authored clues, and can check an answer with the
course's own grader. The assistant speaks as Mochi. It runs on the AI plan the person
already pays for, so a conversation costs the site nothing.

- **Mochi is text in the AI app's chat.** A persona and five read-only tools. There is
  no widget in the chat and no link to the open course page.
- **The account holder's own progress only.** A connection belongs to the account, and
  an account's own learner cannot be under 13 (0010). No managed learner's data is
  reachable, by construction: no function takes a learner.
- **Read only.** Nothing done in the chat is recorded as learning. Checking an answer
  there is a calculation; to make it count, the learner enters it on the page. The only
  writes are the connection's own bookkeeping (when it was made, when it was last used,
  a daily call count).
- **Free, beside the Prep tutor.** This is not the tutor of 0001 and 0010, which is a
  paid, server-side feature the site pays for per reply and which stays planned behind
  `tutor.enabled`. This feature has its own switch, `connect` (`off`, `preview`, `on`),
  off until the go-live list in OPERATIONS is done.
- **The AI app never holds a Supabase credential.** The site runs its own small sign-in
  layer for AI apps (OAuth 2.1 with PKCE) in a Cloudflare Pages worker; Supabase's OAuth
  server stays off. A connection is one opaque key, stored hashed, that three database
  functions accept and nothing else does. Approving one needs a sign-in within the last
  10 minutes, as deleting an account does.
- **Limits:** 5 connections an account, 20 approvals a day, 300 tool calls a day; a
  connection unused for 90 days ends; Revoke on the account page takes effect on the
  next call.

## Why

A consumer AI plan can be used only from inside the AI app, so "use my own AI" means the
conversation happens there and the course comes to it. MCP custom connectors are how
both Claude (every plan) and ChatGPT (paid plans) let a person add a service by its
address.

The sign-in layer is the site's own because of what a spike found (card CN-0,
2026-11-09, local Supabase Auth v2.197.0). A token that Supabase's OAuth server issues
to an app is nearly a full account credential at the Auth layer: it set the account's
password, it enrolled and verified a second factor and was handed back a token without
the mark that identifies an app, and it approved further apps with no person involved.
The database can be locked against such a token; Supabase Auth's own endpoints cannot.
For a site whose accounts hold children's learning records, a key that can do one thing
is the right shape.

## What this changes

- **0012 and 0013** say nothing Mochi says comes from untrusted input. That rule holds
  for the site, where it is unchanged. In the AI app, Mochi's words are a model's, and
  the site cannot filter them: the persona asks for an attempt first, clues in order,
  no final answer before the learner has one, and never a punitive word, and it cannot
  enforce any of that.
- **0001** notes that answer keys are in the page source. So keeping answers out of tool
  results is pedagogy, not secrecy; a check runs the hint-leak lint over every tool
  result for every exercise.
- **The house rule** that functions are granted to `authenticated` only gains three
  exceptions, granted to `anon`: the worker has no user identity, and the key is the
  credential.
- **Server code.** The site gains its first server compute: a worker inside the Pages
  deployment that answers `/mcp`, `/oauth/*` and two `/.well-known/` documents and
  passes every other path to the static site. It holds no secret and no storage.
- **What is stored** gains the connections table: for each, the app ("Claude",
  "ChatGPT" or "an app on this computer"), when it was approved and last used, and
  hashes of its keys.
- **What leaves the site** gains, for an account holder who connects: section and
  exercise ids, mastery bands, counts and dates, sent to the AI provider they chose.
  No name, no email, no list of learners. The about page says so.

## Threat model, stated plainly

The full model is the spec for the build cards; this is its shape.

- An AI app's key works on three functions. It is not a sign-in and Supabase Auth does
  not know it.
- A code is sent only to Claude's and ChatGPT's fixed callback addresses or to a program
  on the person's own computer. The app's name on the approval view comes from that
  address, never from what the app claims.
- A phishing link can at worst get a victim's learning summary, with no name on it, into
  the attacker's chat, and only if the victim signs in again and approves.
- A child at a browser that holds the parent's session cannot approve: approval needs a
  fresh sign-in and is refused while the browser is playing as a managed learner.
- Nothing free-text from a learner's stored state reaches the model: results are built
  from numbers, curriculum titles and authored text.
- The model's inputs are checked against the exercise index and bounded before the
  grader sees them.
- A flood can exhaust the worker's free daily quota; the connector then stops and the
  static site does not. There is no rate limit at the edge.
- Every preview deployment keeps a working copy of the worker, so the database functions
  are the boundary, and the stop is
  `revoke execute on function public.mcp_context(text, boolean, bigint) from anon`.

## Deferred

- A Mochi panel inside the chat; Mochi on the course page reacting to the chat.
- Recording work done in the chat.
- Managed learners, which waits on counsel's answer to 0010's first question and on a
  consent text of its own.
- Worked solutions, Arena problems, the placement plan and the deck's "next step" as
  tool results.
- Listing the connector in an AI app's directory.

## Status

Decided 2026-11-09. This record is card CN-1; the cards CN-2 to CN-11 follow, with the
two migrations applied live before the pull requests that need them merge. Two things are
measured at the owner's end-to-end test and may add a card each: whether the account
page's opener policy lets an AI app finish the flow, and the worker's CPU time on the
free plan for a learner with a long history.
