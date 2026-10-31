'use strict';

// Every record ever fetched is appended to a JSONL file per EIIN. A second run
// with a different spelling then costs nothing — the board site is only hit for
// rolls that are not in the file yet.

const fs = require('fs');
const os = require('os');
const path = require('path');

function cacheDir(custom) {
  return custom || path.join(os.homedir(), '.cache', 'bise-result-finder');
}

function cacheFile(eiin, custom) {
  const dir = cacheDir(custom);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${eiin}.jsonl`);
}

function load(file) {
  const byRoll = new Map();
  if (!fs.existsSync(file)) return byRoll;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      // Later lines win, so a re-fetch overwrites a stale record.
      if (rec && rec.roll) byRoll.set(String(rec.roll), rec);
    } catch {
      // A half-written line from an interrupted run; skip it.
    }
  }
  return byRoll;
}

function appender(file) {
  const stream = fs.createWriteStream(file, { flags: 'a' });
  return {
    write: (rec) => stream.write(JSON.stringify(rec) + '\n'),
    close: () => new Promise((r) => stream.end(r)),
  };
}

module.exports = { cacheDir, cacheFile, load, appender };
