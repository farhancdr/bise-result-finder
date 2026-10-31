'use strict';

// Single place where HTTP happens. Everything else works on strings.
//
// The board site is slow under result-day load and drops requests rather than
// queueing them, so every call gets a few backed-off retries.

const DEFAULT_BASE = 'https://hscresult.bise-ctg.gov.bd';
const DEFAULT_EXAM = 'h22_31_x1_26';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';

function createClient({
  baseUrl = DEFAULT_BASE,
  exam = DEFAULT_EXAM,
  timeoutMs = 30000,
  retries = 4,
} = {}) {
  const root = `${baseUrl.replace(/\/+$/, '')}/${exam}`;

  async function post(pathname, form, attempt = 1) {
    const url = `${root}/${pathname}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          origin: baseUrl.replace(/\/+$/, ''),
          referer: `${root}/`,
          'user-agent': UA,
        },
        body: new URLSearchParams(form).toString(),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, 800 * attempt));
      return post(pathname, form, attempt + 1);
    }
  }

  return {
    baseUrl,
    exam,
    // The institution-wide page; its form posts just the EIIN.
    roster: (eiin) => post('result.php', { eiin: String(eiin) }),
    // The individual sheet; button2 is the submit button's own field and the
    // page rejects the post without it.
    result: (roll) => post('individual/result_mark_details.php', { roll: String(roll), button2: '' }),
  };
}

module.exports = { createClient, DEFAULT_BASE, DEFAULT_EXAM };
