'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { parseFeed, mergeFeeds } = require('../lib/updateFeed');

const ARM = `version: 2026.10.0
files:
  - url: ControlWeave-2026.10.0-arm64-mac.zip
    sha512: AAA==
    size: 100
  - url: ControlWeave-2026.10.0-arm64.dmg
    sha512: BBB==
    size: 110
path: ControlWeave-2026.10.0-arm64-mac.zip
sha512: AAA==
releaseDate: '2026-10-24T09:00:00.000Z'
`;
const X64 = `version: 2026.10.0
files:
  - url: ControlWeave-2026.10.0-mac.zip
    sha512: CCC==
    size: 120
  - url: ControlWeave-2026.10.0.dmg
    sha512: DDD==
    size: 130
path: ControlWeave-2026.10.0-mac.zip
sha512: CCC==
releaseDate: '2026-10-24T09:05:00.000Z'
`;

test('parses the electron-builder feed shape', () => {
  const feed = parseFeed(ARM);
  assert.strictEqual(feed.version, '2026.10.0');
  assert.strictEqual(feed.files.length, 2);
  assert.deepStrictEqual(feed.files[0], { url: 'ControlWeave-2026.10.0-arm64-mac.zip', sha512: 'AAA==', size: '100' });
});

test('the merged feed lists the artifacts of both architectures', () => {
  const merged = parseFeed(mergeFeeds([ARM, X64]));
  assert.deepStrictEqual(merged.files.map((f) => f.url), [
    'ControlWeave-2026.10.0-arm64-mac.zip',
    'ControlWeave-2026.10.0-arm64.dmg',
    'ControlWeave-2026.10.0-mac.zip',
    'ControlWeave-2026.10.0.dmg',
  ]);
  assert.strictEqual(merged.version, '2026.10.0');
  assert.strictEqual(merged.releaseDate, '2026-10-24T09:05:00.000Z');
});

test('merging is idempotent on duplicate entries', () => {
  const merged = parseFeed(mergeFeeds([ARM, ARM]));
  assert.strictEqual(merged.files.length, 2);
});

test('feeds for different versions are refused', () => {
  assert.throws(() => mergeFeeds([ARM, X64.replace(/2026\.10\.0/g, '2026.10.1')]), /disagree on the version/);
});

test('a feed with no files or an unexpected line is refused', () => {
  assert.throws(() => parseFeed('version: 1.0.0\n'), /no files/);
  assert.throws(() => parseFeed('version: 1.0.0\nfiles:\n  - url: a\n    sha512: b\nstray line\n'), /Unexpected line/);
});
