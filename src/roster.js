'use strict';

// The institution page renders its roll lists from a JSON blob it also uses to
// build the downloadable PDF:
//
//   var D = {"inst":"...","groups":[{"title":"Science","rolls":["103139[4.42]"]}]};
//
// Parsing that is exact. If the page ever stops shipping it, fall back to
// scraping `roll[grade]` pairs out of the rendered HTML — same shape, no groups.

function parseRoster(html) {
  const blob = html.match(/var\s+D\s*=\s*(\{[\s\S]*?\})\s*;\s*\n/);
  if (blob) {
    try {
      return fromBlob(JSON.parse(blob[1]));
    } catch {
      // fall through to the scrape
    }
  }
  return fromScrape(html);
}

function splitEntry(entry) {
  const m = String(entry).match(/^\s*(\d+)\s*(?:\[\s*([^\]]*)\s*\])?/);
  return m ? { roll: m[1], grade: (m[2] || '').trim() } : null;
}

function fromBlob(d) {
  const groups = (d.groups || []).map((g) => ({
    title: (g.title || '').trim(),
    note: (g.note || '').trim(),
    students: (g.rolls || []).map(splitEntry).filter(Boolean),
  }));
  return {
    institute: d.inst || '',
    zilla: d.zilla || '',
    thana: d.thana || '',
    appeared: d.app || '',
    passed: d.pass || '',
    percent: d.percent || '',
    gpa5: d.gpa5 || '',
    groups,
    source: 'json',
  };
}

function fromScrape(html) {
  const seen = new Set();
  const students = [];
  for (const m of html.matchAll(/\b(\d{5,7})\s*\[\s*([^\]]*)\s*\]/g)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    students.push({ roll: m[1], grade: m[2].trim() });
  }
  const inst = html.match(/Institute name<\/div>\s*<div[^>]*>([^<]*)</i);
  return {
    institute: inst ? inst[1].trim() : '',
    zilla: '',
    thana: '',
    appeared: '',
    passed: '',
    percent: '',
    gpa5: '',
    groups: students.length ? [{ title: 'All', note: '', students }] : [],
    source: 'scrape',
  };
}

// Flat roll list in roster order. Groups that passed are listed first by the
// board itself, so searching in this order usually finds a student early.
function allRolls(roster) {
  const seen = new Set();
  const out = [];
  for (const g of roster.groups) {
    for (const s of g.students) {
      if (seen.has(s.roll)) continue;
      seen.add(s.roll);
      out.push({ ...s, group: g.title });
    }
  }
  return out;
}

module.exports = { parseRoster, allRolls };
