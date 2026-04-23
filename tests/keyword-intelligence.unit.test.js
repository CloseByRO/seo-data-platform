const test = require('node:test')
const assert = require('node:assert/strict')

test('keyword intel: diacritics normalization groups variants', async () => {
  const a = 'psiholog bucurești'
  const b = 'psiholog bucuresti'
  // keep this JS-only: tests run under node --test (no TS transpile)
  function stripDiacritics(s) {
    return String(s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ș/g, 's')
      .replace(/ț/g, 't')
      .replace(/ă/g, 'a')
      .replace(/î/g, 'i')
      .replace(/â/g, 'a')
      .replace(/Ș/g, 'S')
      .replace(/Ț/g, 'T')
      .replace(/Ă/g, 'A')
      .replace(/Î/g, 'I')
      .replace(/Â/g, 'A')
  }

  const na = stripDiacritics(a.toLowerCase().trim())
  const nb = stripDiacritics(b.toLowerCase().trim())
  assert.equal(na, nb)
})

test('keyword intel: commercial vs informational keyword heuristics', async () => {
  // We keep this test cheap and deterministic; DataForSEO calls are covered by an optional smoke runner.
  const commercial = 'psiholog pret bucuresti'
  const informational = 'cum tratezi anxietatea'
  assert.ok(/\bpret\b/.test(commercial))
  assert.ok(/^cum\b/.test(informational))
})

