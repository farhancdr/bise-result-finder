#!/usr/bin/env node
'use strict';

// bise-result — find a student's HSC result by institution EIIN and name.
//
//   bise-result 123456 rafi
//   bise-result 123456 rafi --father="kamal uddin"
//   bise-result 123456 --roll 456789
//   bise-result 123456 --roster

const { createClient, DEFAULT_BASE, DEFAULT_EXAM } = require('../src/client');
const { parseRoster, allRolls } = require('../src/roster');
const { parseResult } = require('../src/result');
const { search } = require('../src/search');
const cache = require('../src/cache');
const { resultSheet, rosterSummary } = require('../src/format');

const HELP = `
bise-result — find a student's HSC result from a board site by EIIN + name

Usage
  bise-result <eiin> <name-part> [options]
  bise-result <eiin> --roll <roll>
  bise-result <eiin> --roster

Arguments
  <eiin>           institution EIIN, e.g. 123456
  <name-part>      any part of the student's name, case-insensitive

Options
  --father=<text>  also require this in the father's name
  --mother=<text>  also require this in the mother's name
  --roll=<roll>    skip the search, print this roll's sheet
  --roster         print the institution's groups and roll counts, then exit
  --all            keep scanning after the first full match
  --group=<name>   only scan groups whose title contains this (e.g. science)
  --concurrency=<n>   parallel requests (default 4)
  --json           print JSON instead of a formatted sheet
  --no-cache       do not read or write the local record cache
  --cache-dir=<p>  where records are cached (default ~/.cache/bise-result-finder)
  --base-url=<url> board site (default ${DEFAULT_BASE})
  --exam=<slug>    exam path segment (default ${DEFAULT_EXAM})
  --quiet          no progress lines
  -h, --help       this text

Notes
  Filters are AND: --father narrows the name search, it does not widen it.
  With --father or --mother the scan stops at the first full match unless
  --all is given; a name on its own scans the whole institution so partial
  spellings surface every candidate.
  Every fetched record is cached per EIIN, so re-running with a different
  spelling costs no requests.
`;

// Flags that take a value, so `--roll 456789` works as well as `--roll=456789`.
const VALUE_FLAGS = new Set([
  'father',
  'mother',
  'roll',
  'group',
  'concurrency',
  'cacheDir',
  'baseUrl',
  'exam',
  'name',
]);

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '--no-cache') opts.noCache = true;
    else if (arg.startsWith('--')) {
      const [k, ...rest] = arg.slice(2).split('=');
      const key = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (rest.length) opts[key] = rest.join('=');
      else if (VALUE_FLAGS.has(key) && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        opts[key] = argv[++i];
      } else opts[key] = true;
    } else opts._.push(arg);
  }
  return opts;
}

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(2);
}

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts._.length) {
    console.log(HELP.trim());
    process.exit(opts.help ? 0 : 2);
  }

  const eiin = opts._[0];
  if (!/^\d+$/.test(eiin)) fail(`"${eiin}" is not an EIIN`);
  const namePart = opts._.slice(1).join(' ').trim() || (opts.name === true ? '' : opts.name || '');
  const quiet = Boolean(opts.quiet) || Boolean(opts.json);
  const log = (...a) => {
    if (!quiet) console.log(...a);
  };

  const client = createClient({
    baseUrl: typeof opts.baseUrl === 'string' ? opts.baseUrl : undefined,
    exam: typeof opts.exam === 'string' ? opts.exam : undefined,
  });

  // --roll: one sheet, no roster, no scan.
  if (opts.roll && opts.roll !== true) {
    const rec = parseResult(await client.result(opts.roll), opts.roll);
    if (!rec.found) fail(`no result published for roll ${opts.roll}`);
    console.log(opts.json ? JSON.stringify(rec, null, 2) : resultSheet(rec));
    return;
  }

  log(`Fetching roster for EIIN ${eiin}…`);
  const roster = parseRoster(await client.roster(eiin));
  if (!roster.groups.length) fail(`no roll list on the page for EIIN ${eiin}`);

  if (opts.roster) {
    console.log(opts.json ? JSON.stringify(roster, null, 2) : rosterSummary(roster, eiin));
    return;
  }

  if (!namePart) fail('give a part of the student\'s name, or use --roster / --roll');

  let rolls = allRolls(roster);
  if (typeof opts.group === 'string') {
    const want = opts.group.toLowerCase();
    rolls = rolls.filter((r) => r.group.toLowerCase().includes(want));
    if (!rolls.length) fail(`no group matching "${opts.group}"`);
  }

  const filters = {
    name: namePart,
    father: typeof opts.father === 'string' ? opts.father : '',
    mother: typeof opts.mother === 'string' ? opts.mother : '',
  };
  // A name alone can be a partial spelling, so sweep everything and show all
  // candidates. Once a parent's name narrows it, the first full match is the one.
  const stopAtFirst = !opts.all && Boolean(filters.father || filters.mother);

  const file = opts.noCache ? null : cache.cacheFile(eiin, typeof opts.cacheDir === 'string' ? opts.cacheDir : undefined);
  const cached = file ? cache.load(file) : new Map();
  const store = file ? cache.appender(file) : null;

  log(
    `${roster.institute || `EIIN ${eiin}`} — scanning ${rolls.length} rolls` +
      (cached.size ? `, ${cached.size} already cached` : '') +
      `\nname~${filters.name}` +
      (filters.father ? `, father~${filters.father}` : '') +
      (filters.mother ? `, mother~${filters.mother}` : '') +
      (stopAtFirst ? ' (stops at first full match)' : '') +
      '\n'
  );

  const { matched, failed, scanned } = await search({
    client,
    rolls,
    filters,
    cached,
    store,
    concurrency: Number(opts.concurrency) > 0 ? Number(opts.concurrency) : 4,
    stopAtFirst,
    onRecord: ({ roll, record, why, error, index, total }) => {
      if (quiet) return;
      if (error) return console.log(`[${index}/${total}] ${roll}  ERROR: ${error}`);
      const name = record.found ? record.name : '(no result published)';
      console.log(
        `[${index}/${total}] ${roll}  ${name}` +
          (record.gpa ? `  GPA ${record.gpa}` : '') +
          (why ? `   <== MATCH` : '')
      );
    },
  });
  if (store) await store.close();

  if (opts.json) {
    console.log(JSON.stringify({ eiin, institute: roster.institute, scanned, matched }, null, 2));
    process.exitCode = matched.length ? 0 : 1;
    return;
  }

  console.log('\n' + '='.repeat(60));
  if (failed.length) {
    console.log(`${failed.length} roll(s) never answered: ${failed.join(', ')}`);
  }
  if (!matched.length) {
    console.log(`No student matching those filters in ${scanned} rolls.`);
    if (file) console.log(`Records cached in ${file} — try another spelling, it costs no requests.`);
    process.exitCode = 1;
    return;
  }
  console.log(`${matched.length} match(es):`);
  for (const rec of matched) console.log(resultSheet(rec));
})().catch((err) => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});
