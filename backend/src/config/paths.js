// @tier: community
const fs = require('fs');
const path = require('path');

// Where uploaded files are stored. Defaults to backend/uploads. The desktop
// app sets UPLOADS_DIR to the user's data folder: its install directory is
// read-only (AppImage, signed macOS bundle, Program Files) and is replaced by
// every update.
//
// With S3_BUCKET set (services/storageService.js) this directory is a
// write-through cache: files missing from it are fetched back from the bucket
// on demand. Without S3_BUCKET it is the only copy, as before.
//
// Evidence rows store the absolute path the file was written to. Those paths
// are mapped onto the current UPLOADS_DIR through their storage key (the part
// after the uploads directory), so moving the directory, or restoring onto a
// host with a different layout, does not orphan existing records.
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '../../uploads');

const LEGACY_SEGMENT = `${path.sep}uploads${path.sep}`;

function isValidKey(key) {
  if (!key || key.startsWith('/')) return false;
  return key.split('/').every((part) => part && part !== '.' && part !== '..');
}

/**
 * Storage key (POSIX-style path relative to the uploads directory) for a stored
 * file path, or null when the path is not an uploads path.
 */
function toStorageKey(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  const resolved = path.resolve(filePath);
  let relative = null;
  if (resolved.startsWith(`${UPLOADS_DIR}${path.sep}`)) {
    relative = resolved.slice(UPLOADS_DIR.length + 1);
  } else {
    const index = resolved.lastIndexOf(LEGACY_SEGMENT);
    if (index !== -1) relative = resolved.slice(index + LEGACY_SEGMENT.length);
  }
  if (!relative) return null;
  const key = relative.split(path.sep).join('/');
  return isValidKey(key) ? key : null;
}

/** Absolute local path for a stored file path, or null when it is not an uploads path. */
function resolveUploadPath(filePath) {
  const key = toStorageKey(filePath);
  return key ? path.join(UPLOADS_DIR, ...key.split('/')) : null;
}

/** Absolute local path for a storage key. */
function pathForKey(key) {
  if (!isValidKey(key)) throw new Error('Invalid storage key');
  return path.join(UPLOADS_DIR, ...key.split('/'));
}

/** Subdirectory of the uploads directory, created on first use. */
function uploadsSubdir(name) {
  const dir = pathForKey(name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = { UPLOADS_DIR, toStorageKey, resolveUploadPath, pathForKey, uploadsSubdir };
