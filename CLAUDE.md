# CLAUDE.md

Notes for AI assistants working on this repo. Read `README.md` first for what
the tool does; this file covers how to change it without breaking things.

## Hard boundary

This exists so one person can find one student's published result without
knowing the roll number. It is not a harvester.

- Keep the default concurrency low (4) and keep the backoff. Result day is
  exactly when the board's servers are weakest and when someone runs this
- Do not add anything that walks EIINs, enumerates roll ranges the roster does
  not list, or bulk-exports other people's records. The cache exists to avoid
  re-requesting, not to build a database to publish
- Do not add CAPTCHA solving, token forging or any other bot-check workaround.
  Both endpoints are the site's own public forms; keep posting them the way a
  browser does and nothing more

The data is published by the board, but it is still minors' names, parents'
names and marks. Treat the cache as personal data.

## Architecture

```
bin/cli.js     argument parsing, output, exit codes. No HTTP, no parsing
src/client.js  the only place fetch() is called. Retries with backoff
src/roster.js  institution page -> {groups: [{title, students: [{roll, grade}]}]}
src/result.js  one result sheet -> record, including per-subject marks
src/search.js  concurrent scan, AND filters, stop policy
src/cache.js   per-EIIN JSONL record store
src/format.js  terminal tables and sheets
```

The split is deliberate: everything below `bin/` takes strings and returns
objects, so a parser can be tested against a saved page with no network.

Two endpoints, both POST, both form-encoded:

| Path | Body | Returns |
|---|---|---|
| `result.php` | `eiin=123456` | institution page, all groups and rolls |
| `individual/result_mark_details.php` | `roll=456789&button2=` | one student's sheet |

## Non-obvious facts about the site

Each of these was discovered the hard way. Do not "simplify" them away.

| Fact | Consequence |
|---|---|
| No session cookie is needed | The `PHPSESSID` in a copied cURL is noise; do not add cookie handling |
| `button2=` is the submit button's own field | The individual sheet rejects a post without it |
| The institution page embeds `var D = {...}` | Parse that JSON for groups and rolls; the rendered HTML is the fallback, not the source |
| Roster entries are `roll[grade]`, e.g. `103139[4.42]`, `103142[F1]` | Always strip the suffix before posting a roll |
| One group spans several roll ranges | Science holds both `1031xx` and `7007xx`. Never infer a range; use the listed rolls |
| Absentees still return a full sheet, name included | `ABS.` in the roster, a normal name block on the sheet |
| A sheet with **no** name block means the server buckled | Never cache it. Caching one hides that student from every later run |
| Subject cells read `A+(161)` | Grade and marks in one string; a subject with no marks has no parentheses |
| The site is slow and drops requests rather than queueing | Serial-ish concurrency plus backoff, not a tight loop |

The exam path segment (`h22_31_x1_26`) and host are per board and per year.
They are flags (`--exam`, `--base-url`), never constants in new code.

## Matching rules

- Filters are **AND**. `--father` narrows the name search. An early version
  OR'd them and returned a student whose mother merely shared a first name
- Case-insensitive substring, both sides normalised for whitespace. Names are
  stored in whatever spelling the registration form carried
- With a parent filter, stop at the first full match. With a name alone, scan
  everything and list every candidate — the spelling is probably approximate

## Testing

There is no test suite. Verification is a live run plus `node --check`:

```bash
npm run check
node bin/cli.js <eiin> --roster               # group titles and roll counts
node bin/cli.js <eiin> <name> --father <name> # one sheet, with subjects
node bin/cli.js <eiin> --roll <roll>
```

Pick a real EIIN off the board's own site to run these; the roster counts it
prints must add up to the "Appeared" figure on the same page.

A cached second run must finish in well under a second and issue no requests.

Use a made-up name and roll in anything that gets committed — docs, comments,
commit messages, issues. Live output is a real student's record.
To test a parser without the network, save a page and feed it to
`parseRoster()` / `parseResult()` directly — neither touches `fetch`.

## Conventions

- Plain CommonJS, no build step, no dependencies. Keep it that way
- Node 18+ for global `fetch`. No polyfills
- New flags go in `VALUE_FLAGS` if they take a value, in `HELP`, and in the
  README's option table — all three, or the flag silently becomes a boolean
- Comments explain *why*, especially where the code looks needlessly careful.
  It usually is not
- Exit codes: `0` found, `1` nothing matched, `2` usage error. Scripts depend
  on the difference between 1 and 2
