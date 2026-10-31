'use strict';

// Terminal rendering. Kept away from the fetching and parsing so the same
// records can be printed, piped as JSON, or reused by something else.

const PAD = 9;

function table(rows, headers) {
  if (!rows.length) return '';
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length))
  );
  const line = (cells) =>
    '  ' + cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join('  ').trimEnd();
  return [line(headers), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}

function resultSheet(rec) {
  const out = [];
  const row = (label, value) => {
    if (value) out.push(`  ${label.padEnd(PAD)} ${value}`);
  };
  out.push('');
  row('Roll', rec.roll);
  row('Name', rec.name);
  row('Father', rec.father);
  row('Mother', rec.mother);
  row('Group', rec.group || rec.listedGroup);
  row('Session', rec.session);
  row('Reg. No', rec.reg);
  row('Type', rec.type);
  row('Institute', rec.institute);
  row('Result', rec.result);
  row('GPA', rec.gpa);
  if (rec.why && rec.why.length) row('Matched', rec.why.join(', '));
  if (rec.subjects && rec.subjects.length) {
    out.push('');
    out.push(
      table(
        rec.subjects.map((s) => [
          s.code ? `${s.subject} (${s.code})` : s.subject,
          s.grade,
          s.marks,
        ]),
        ['Subject', 'Grade', 'Marks']
      )
    );
  }
  out.push('');
  return out.join('\n');
}

function rosterSummary(roster, eiin) {
  const out = [];
  out.push(`  Institute  ${roster.institute || `EIIN ${eiin}`}`);
  if (roster.zilla) out.push(`  Zilla      ${roster.zilla}`);
  if (roster.thana) out.push(`  Thana      ${roster.thana}`);
  if (roster.appeared) {
    out.push(
      `  Appeared   ${roster.appeared}   Passed ${roster.passed}   ` +
        `Percent ${roster.percent}   GPA5 ${roster.gpa5}`
    );
  }
  out.push('');
  out.push(
    table(
      roster.groups.map((g) => [g.title, String(g.students.length)]),
      ['Group', 'Rolls']
    )
  );
  return out.join('\n');
}

module.exports = { table, resultSheet, rosterSummary };
