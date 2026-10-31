'use strict';

// Individual result sheet -> plain object.
//
// The sheet is two label/value div pairs per row:
//   <div>Name</div><div class="v">riya sharma</div>
// and a marks table of:
//   <tr><td>BANGLA <span class="code">(101)</span></td><td class="num">A+(161)</td></tr>

const decode = (s) =>
  String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function field(html, label) {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = html.match(new RegExp(`<div>\\s*${esc}\\s*</div>\\s*<div[^>]*>([^<]*)</div>`, 'i'));
  return m ? decode(m[1]) : '';
}

function subjects(html) {
  const rows = [];
  const re =
    /<tr>\s*<td>\s*([^<]*?)\s*(?:<span class="code">\(([^)]*)\)<\/span>)?\s*<\/td>\s*<td class="num">\s*([^<]*?)\s*<\/td>\s*<\/tr>/gi;
  for (const m of html.matchAll(re)) {
    const cell = decode(m[3]);
    // "A+(161)" -> grade A+, marks 161. Absent subjects carry no marks.
    const split = cell.match(/^([^(]*?)\s*\(\s*([^)]*?)\s*\)$/);
    rows.push({
      subject: decode(m[1]),
      code: m[2] ? decode(m[2]) : '',
      grade: split ? split[1].trim() : cell,
      marks: split ? split[2].trim() : '',
    });
  }
  return rows;
}

function parseResult(html, roll) {
  const rec = {
    roll: field(html, 'Roll No') || String(roll || ''),
    name: field(html, 'Name'),
    father: field(html, "Father's Name"),
    mother: field(html, "Mother's Name"),
    board: field(html, 'Board'),
    group: field(html, 'Group'),
    session: field(html, 'Session'),
    reg: field(html, 'Reg. NO'),
    type: field(html, 'Type'),
    institute: field(html, 'Institute'),
    result: field(html, 'Result'),
    gpa: field(html, 'GPA'),
    subjects: subjects(html),
  };
  // Absentees and withheld rolls render the shell with no name block.
  rec.found = Boolean(rec.name);
  return rec;
}

module.exports = { parseResult };
