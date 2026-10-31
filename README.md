# bise-result-finder

Find a student's HSC result on a Bangladesh education board site when you know
the institution and roughly the name — but not the roll number.

The board publishes results by roll only. The institution page publishes the
roll numbers but no names. This walks the first list through the second.

```
bise-result 123456 rafi --father "kamal uddin"
```

```
  Roll      456789
  Name      md. sakib hasan rafi
  Father    md. kamal uddin
  Mother    shirin akter
  Group     science
  Result    PASS
  GPA       3.67
  Matched   name~rafi, father~kamal uddin

  Subject                                       Grade  Marks
  --------------------------------------------  -----  -----
  BANGLA (101)                                  A-     128
  ENGLISH (107)                                 A      151
  INFORMATION & COMMUNICATION TECHNOLOGY (275)  A-     63
  PHYSICS (174)                                 B      113
  CHEMISTRY (176)                               A-     135
  BIOLOGY (178)                                 A-     131
  HIGHER MATHEMATICS (265)                      B      101
```

Every name and number in this README is made up. Real output carries real
students' details — don't paste it into issues or screenshots.

## Run it

Node 18 or newer, no dependencies, nothing to install:

```bash
npx git+ssh://git@github.com/farhancdr/bise-result-finder.git 123456 rafi --father "kamal uddin"
```

That works straight from the private repo over your existing GitHub SSH key.
If this is ever published to npm, the short form works too:

```bash
npx bise-result-finder 123456 rafi
```

Run it often? Install it once instead:

```bash
npm install -g git+ssh://git@github.com/farhancdr/bise-result-finder.git
bise-result 123456 rafi
```

From a clone, `npm link` puts `bise-result` on your PATH, or just run
`node bin/cli.js …`.

## Usage

```
bise-result <eiin> <name-part> [options]
bise-result <eiin> --roll <roll>
bise-result <eiin> --roster
```

| Option | Meaning |
|---|---|
| `--father <text>` | also require this in the father's name |
| `--mother <text>` | also require this in the mother's name |
| `--roll <roll>` | skip the search, print one roll's sheet |
| `--roster` | print the institution's groups and roll counts |
| `--all` | keep scanning after the first full match |
| `--group <name>` | only scan groups whose title contains this, e.g. `science` |
| `--concurrency <n>` | parallel requests, default 4 |
| `--json` | machine-readable output |
| `--no-cache` | don't read or write the record cache |
| `--cache-dir <path>` | where records are cached |
| `--base-url <url>` | another board site |
| `--exam <slug>` | another exam path segment |
| `--quiet` | no progress lines |

Exit status is `1` when nothing matched, `2` on a usage error.

## How matching works

Filters are **AND**. `--father` narrows the name search rather than widening
it, so a common first name plus a parent's name pins down one student.

Everything is a case-insensitive substring, because the board stores whatever
spelling the registration form was filled in with. `rafi` finds both
`md. sakib hasan rafi` and `rafiul islam sowrov`.

With `--father` or `--mother`, the scan stops at the first record matching
every filter. A name on its own scans the whole institution and lists every
candidate, which is what you want when the spelling is uncertain. `--all`
forces the full scan either way.

Groups are scanned in the order the board lists them — the passing groups come
before `Unsuccessful / Others`.

## Caching

Every sheet fetched is appended to `~/.cache/bise-result-finder/<eiin>.jsonl`.
A later run reads that first, so trying a second spelling costs no requests:

```bash
bise-result 123456 rafi           # ~1000 requests, a few minutes
bise-result 123456 rafee          # instant, served from the cache
```

Delete the file to force a refetch.

## Other boards and years

The default is HSC 2026 at Chattogram:

```
--base-url https://hscresult.bise-ctg.gov.bd
--exam     h22_31_x1_26
```

Both are flags, so another board's host or next year's path segment needs no
code change. Open the board's result page and read them out of its URL.

## How it works

```
result.php          POST eiin=123456   -> institution page
                                          embeds var D = {...} with every
                                          group and roll[grade] pair
individual/
  result_mark_details.php
                    POST roll=456789   -> one student's sheet:
                       &button2=          name, parents, group, GPA,
                                          per-subject grades and marks
```

Both are the site's own public forms, posted exactly as the browser posts
them. The roster is read from the JSON the page already ships for its PDF
download; if that ever disappears, the parser falls back to scraping
`roll[grade]` pairs out of the HTML.

| File | Role |
|---|---|
| `bin/cli.js` | argument parsing, output, exit codes |
| `src/client.js` | the only place HTTP happens; retries with backoff |
| `src/roster.js` | EIIN page -> groups and rolls |
| `src/result.js` | result sheet -> record with subjects |
| `src/search.js` | concurrent scan, AND filters, stop policy |
| `src/cache.js` | per-EIIN JSONL record store |
| `src/format.js` | terminal tables and sheets |

`npm run check` runs `node --check` over all of them.

## Being a good citizen

Four requests at a time by default, each retried with backoff rather than
hammered. One full institution is about a thousand requests; the cache means
you only pay that once. Lower it with `--concurrency 1` on result day, when
the board's servers are already struggling.
