'use strict';

// Walk a roll list, fetch each sheet, keep the ones that match every filter.
//
// Filters are AND, not OR: a father or mother term narrows the name search
// rather than widening it. All matching is case-insensitive substring, because
// the board writes names in whatever spelling the form was filled in with.

const { parseResult } = require('./result');

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

function matches(rec, filters) {
  const why = [];
  for (const [fieldName, term] of Object.entries(filters)) {
    if (!term) continue;
    if (!norm(rec[fieldName]).includes(norm(term))) return null;
    why.push(`${fieldName}~${term}`);
  }
  return why.length ? why : null;
}

/**
 * @param {object}   opts
 * @param {object}   opts.client     from createClient()
 * @param {object[]} opts.rolls      [{roll, group, grade}, ...] in scan order
 * @param {object}   opts.filters    {name, father, mother}
 * @param {Map}      opts.cached     roll -> record, from the JSONL cache
 * @param {object}   opts.store      appender, or null to skip caching
 * @param {number}   opts.concurrency
 * @param {boolean}  opts.stopAtFirst
 * @param {function} opts.onRecord   progress callback
 */
async function search({
  client,
  rolls,
  filters,
  cached = new Map(),
  store = null,
  concurrency = 4,
  stopAtFirst = false,
  onRecord = () => {},
}) {
  const matched = [];
  const failed = [];
  let next = 0;
  let done = 0;
  let stop = false;

  async function worker() {
    while (!stop && next < rolls.length) {
      const entry = rolls[next++];
      const roll = String(entry.roll);
      let rec = cached.get(roll);
      let fromCache = Boolean(rec);

      if (!rec) {
        try {
          rec = parseResult(await client.result(roll), roll);
          rec.listedGroup = entry.group || '';
          rec.listedGrade = entry.grade || '';
          // Only cache sheets that actually carried a name. Absentees still do;
          // a nameless 200 means the server buckled, and caching that would
          // hide the student from every later run.
          if (store && rec.found) store.write(rec);
        } catch (err) {
          failed.push(roll);
          onRecord({ roll, error: err.message, index: ++done, total: rolls.length });
          continue;
        }
      }

      const why = rec.found ? matches(rec, filters) : null;
      if (why) matched.push({ ...rec, why });
      onRecord({
        roll,
        record: rec,
        why,
        fromCache,
        index: ++done,
        total: rolls.length,
      });

      if (why && stopAtFirst) stop = true;
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return { matched, failed, scanned: done };
}

module.exports = { search, matches, norm };
