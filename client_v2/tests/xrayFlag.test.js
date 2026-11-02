import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SourceTextModule } from 'node:vm';

const url = new URL('../src/xray/flag.js', import.meta.url);
const source = await readFile(url, 'utf8');

/**
 * The static checks at the bottom of this file look for patterns that must or
 * must not appear in the flag's *code*. flag.js documents the forbidden patterns
 * in prose, so matching against the raw text would flag its own comment — strip
 * comments first and assert against code only.
 */
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * Evaluate src/xray/flag.js with a chosen `import.meta.env`, the way Vite's
 * build-time replacement would supply it. Same vm-module approach as
 * tests/streamUrl.test.js, which is how this suite loads app source without a
 * bundler.
 */
async function loadFlag(env) {
  const module = new SourceTextModule(source, {
    initializeImportMeta(meta) { meta.env = env; },
  });
  await module.link(() => { throw new Error('flag.js must stay dependency-free'); });
  await module.evaluate();
  return module.namespace;
}

test('only the exact string "true" turns X-ray on', async () => {
  assert.equal((await loadFlag({ VITE_XRAY_ENABLED: 'true' })).XRAY_ENABLED, true);
  for (const raw of [undefined, '', ' ', 'false', '0', '1', 'yes', 'on', 'ture',
                     'true-ish', 'enabled', 0, 1, true]) {
    assert.equal((await loadFlag({ VITE_XRAY_ENABLED: raw })).XRAY_ENABLED, false,
      `expected ${JSON.stringify(raw)} to fail closed`);
  }
});

test('a missing VITE_XRAY_ENABLED leaves X-ray off', async () => {
  assert.equal((await loadFlag({})).XRAY_ENABLED, false);
});

test('near-misses in casing and whitespace read as OFF, by design', async () => {
  // Deliberately stricter than src/lib/featureFlags.js. See the comment in
  // flag.js: tolerant parsing requires a helper call, a helper call stops the
  // flag being a build-time constant, and that breaks contract §3's promise
  // that an off build never imports the feature.
  for (const raw of ['TRUE', 'True', ' true', 'true ', '\ttrue\n']) {
    assert.equal((await loadFlag({ VITE_XRAY_ENABLED: raw })).XRAY_ENABLED, false);
  }
});

test('the named and default exports agree', async () => {
  for (const [raw, expected] of [['true', true], ['false', false]]) {
    const ns = await loadFlag({ VITE_XRAY_ENABLED: raw });
    assert.equal(ns.XRAY_ENABLED, expected);
    assert.equal(ns.default, expected);
  }
});

test('the guard stays statically foldable', async () => {
  // These two are the whole reason the file is shaped as it is; a well-meaning
  // refactor that reintroduces either one ships an XrayMode chunk in an off
  // build, and nothing else in the test suite would notice.
  assert.match(code, /import\.meta\.env\.VITE_XRAY_ENABLED === 'true'/,
    'the env read must be an exact member expression Vite can replace, compared inline');
  assert.doesNotMatch(code, /import\.meta\.env\s*\?\./,
    'optional chaining on import.meta.env defeats Vite static replacement');
  assert.doesNotMatch(code, /VITE_XRAY_ENABLED\s*\)/,
    'the env value must not be passed to a helper — a call expression is not foldable');
  assert.equal(/^\s*import\s/m.test(code), false,
    'flag.js must not import anything');
});
