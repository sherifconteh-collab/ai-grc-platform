'use strict';

/**
 * Merge per-architecture electron-builder update feeds (latest-mac.yml) into one.
 *
 * The arm64 and x64 macOS builds run as separate jobs and each writes a feed with
 * the same file name that lists only its own artifacts. electron-updater reads
 * one latest-mac.yml per release and picks the entry for the running CPU from its
 * `files` list, so the feed published with the release must list both.
 *
 * electron-builder writes a small, flat YAML shape, so this reads exactly that
 * shape and fails loudly on anything else instead of guessing.
 */

function unquote(value) {
  const v = value.trim();
  if (v.length >= 2 && ((v[0] === "'" && v[v.length - 1] === "'") || (v[0] === '"' && v[v.length - 1] === '"'))) {
    return v.slice(1, -1);
  }
  return v;
}

function parseFeed(text) {
  const feed = { files: [] };
  let inFiles = false;
  let current = null;
  for (const raw of String(text).split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const top = /^([A-Za-z0-9]+):\s*(.*)$/.exec(raw);
    if (top) {
      inFiles = top[1] === 'files';
      current = null;
      if (!inFiles) feed[top[1]] = unquote(top[2]);
      continue;
    }
    if (!inFiles) throw new Error(`Unexpected line in update feed: ${raw}`);
    const item = /^\s+-\s+([A-Za-z0-9]+):\s*(.*)$/.exec(raw);
    const field = /^\s+([A-Za-z0-9]+):\s*(.*)$/.exec(raw);
    if (item) {
      current = { [item[1]]: unquote(item[2]) };
      feed.files.push(current);
    } else if (field && current) {
      current[field[1]] = unquote(field[2]);
    } else {
      throw new Error(`Unexpected line in update feed: ${raw}`);
    }
  }
  if (!feed.version) throw new Error('Update feed has no version');
  if (feed.files.length === 0) throw new Error('Update feed lists no files');
  for (const file of feed.files) {
    if (!file.url || !file.sha512) throw new Error('Update feed file entry is missing url or sha512');
  }
  return feed;
}

function mergeFeeds(texts) {
  const feeds = texts.map(parseFeed);
  const version = feeds[0].version;
  if (feeds.some((f) => f.version !== version)) {
    throw new Error(`Update feeds disagree on the version: ${feeds.map((f) => f.version).join(', ')}`);
  }
  const files = [];
  const seen = new Set();
  for (const feed of feeds) {
    for (const file of feed.files) {
      if (seen.has(file.url)) continue;
      seen.add(file.url);
      files.push(file);
    }
  }
  // Legacy top-level path/sha512 name the first feed's primary artifact.
  const first = feeds[0];
  const lines = [`version: ${version}`, 'files:'];
  for (const file of files) {
    lines.push(`  - url: ${file.url}`, `    sha512: ${file.sha512}`);
    if (file.size !== undefined) lines.push(`    size: ${file.size}`);
  }
  if (first.path) lines.push(`path: ${first.path}`);
  if (first.sha512) lines.push(`sha512: ${first.sha512}`);
  const releaseDates = feeds.map((f) => f.releaseDate).filter(Boolean).sort();
  if (releaseDates.length) lines.push(`releaseDate: '${releaseDates[releaseDates.length - 1]}'`);
  return `${lines.join('\n')}\n`;
}

module.exports = { parseFeed, mergeFeeds };
