'use strict';

/**
 * Durable storage for uploaded files (evidence, policies, scan imports).
 *
 * Files are always written to the local uploads directory first, so parsers
 * and hashers keep working on a real path. With the S3 driver every write is
 * also persisted to an S3-compatible bucket (AWS S3, Cloudflare R2, MinIO,
 * Backblaze B2), and a file missing locally (for example after a container
 * redeploy) is fetched back from the bucket the first time it is read.
 *
 * Driver selection:
 *   STORAGE_DRIVER=s3     bucket-backed (default when S3_BUCKET is set)
 *   STORAGE_DRIVER=local  local directory only; durable only when UPLOADS_DIR
 *                         is on a persistent volume
 *
 * S3 settings: S3_BUCKET, S3_REGION, S3_ENDPOINT, S3_FORCE_PATH_STYLE,
 * S3_PREFIX, S3_SSE (AES256 | aws:kms), S3_KMS_KEY_ID. Credentials come from
 * the standard AWS chain (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY, instance
 * role, and so on).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { UPLOADS_DIR, toStorageKey, pathForKey } = require('../config/paths');
const { log, serializeError } = require('../utils/logger');

function readConfig(env = process.env) {
  const bucket = String(env.S3_BUCKET || '').trim();
  const requested = String(env.STORAGE_DRIVER || '').trim().toLowerCase();
  const driver = requested === 'local' || requested === 's3' ? requested : (bucket ? 's3' : 'local');
  const prefix = String(env.S3_PREFIX ?? 'uploads/').replace(/^\/+/, '');
  return {
    driver,
    bucket,
    region: env.S3_REGION || env.AWS_REGION || 'us-east-1',
    endpoint: env.S3_ENDPOINT || undefined,
    forcePathStyle: String(env.S3_FORCE_PATH_STYLE || '').toLowerCase() === 'true',
    prefix: prefix && !prefix.endsWith('/') ? `${prefix}/` : prefix,
    sse: env.S3_SSE === 'aws:kms' ? 'aws:kms' : (env.S3_SSE === 'none' ? null : 'AES256'),
    kmsKeyId: env.S3_KMS_KEY_ID || undefined,
    volumePath: env.RAILWAY_VOLUME_MOUNT_PATH || '',
    localDurable: String(env.STORAGE_LOCAL_DURABLE || '').toLowerCase() === 'true'
  };
}

let config = readConfig();
let s3 = null;

function getS3() {
  if (!s3) {
    const { S3Client } = require('@aws-sdk/client-s3');
    s3 = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle
    });
  }
  return s3;
}

function objectKey(key) {
  return `${config.prefix}${key}`;
}

function isNotFound(error) {
  const status = error && error.$metadata && error.$metadata.httpStatusCode;
  return status === 404 || (error && (error.name === 'NoSuchKey' || error.name === 'NotFound'));
}

/** Whether files survive a redeploy with the current configuration. */
function describe() {
  if (config.driver === 's3') {
    return {
      driver: 's3',
      durable: Boolean(config.bucket),
      location: config.bucket ? `s3://${config.bucket}/${config.prefix}` : '(S3_BUCKET not set)',
      encryption: config.sse || 'bucket default'
    };
  }
  const onVolume = Boolean(config.volumePath) &&
    (UPLOADS_DIR === path.resolve(config.volumePath) || UPLOADS_DIR.startsWith(`${path.resolve(config.volumePath)}${path.sep}`));
  return {
    driver: 'local',
    durable: onVolume || config.localDurable,
    location: UPLOADS_DIR,
    encryption: 'filesystem'
  };
}

function requireKey(filePath) {
  const key = toStorageKey(filePath);
  if (!key) throw new Error('File is outside the uploads directory');
  return key;
}

/**
 * Persist a file that was just written under the uploads directory. With the
 * local driver this is a no-op. Throws when the bucket write fails, so callers
 * can reject an upload that would otherwise be lost on the next deploy.
 */
async function persist(filePath, { contentType } = {}) {
  const key = requireKey(filePath);
  if (config.driver !== 's3') return { key, driver: 'local' };
  if (!config.bucket) throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET');
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const localPath = pathForKey(key);
  const { size } = await fs.promises.stat(localPath);
  await getS3().send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: objectKey(key),
    Body: fs.createReadStream(localPath),
    ContentLength: size,
    ContentType: contentType || 'application/octet-stream',
    ServerSideEncryption: config.sse || undefined,
    SSEKMSKeyId: config.sse === 'aws:kms' ? config.kmsKeyId : undefined
  }));
  return { key, driver: 's3' };
}

/** Write a buffer or string to the uploads directory and persist it. */
async function writeFile(filePath, body, options = {}) {
  const localPath = pathForKey(requireKey(filePath));
  await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
  await fs.promises.writeFile(localPath, body);
  await persist(localPath, options);
  return localPath;
}

/**
 * Make sure a stored file is present locally, fetching it from the bucket when
 * needed. Returns the local path, or null when the file exists nowhere.
 */
async function ensureLocal(filePath) {
  const key = toStorageKey(filePath);
  if (!key) return null;
  const localPath = pathForKey(key);
  if (fs.existsSync(localPath)) return localPath;
  if (config.driver !== 's3' || !config.bucket) return null;
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  let response;
  try {
    response = await getS3().send(new GetObjectCommand({ Bucket: config.bucket, Key: objectKey(key) }));
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
  const partial = `${localPath}.${crypto.randomBytes(4).toString('hex')}.part`;
  try {
    await pipeline(response.Body, fs.createWriteStream(partial));
    await fs.promises.rename(partial, localPath);
  } catch (error) {
    await fs.promises.rm(partial, { force: true });
    throw error;
  }
  return localPath;
}

/** Remove a stored file locally and from the bucket. Missing files are ignored. */
async function remove(filePath) {
  const key = toStorageKey(filePath);
  if (!key) return false;
  await fs.promises.rm(pathForKey(key), { force: true });
  if (config.driver === 's3' && config.bucket) {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await getS3().send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey(key) }));
  }
  return true;
}

/** remove() for cleanup paths that must not throw. */
function removeQuietly(filePath) {
  return remove(filePath).catch((error) => {
    log('warn', 'storage.remove_failed', { error: serializeError(error) });
    return false;
  });
}

/**
 * Express middleware that runs after multer: persists every uploaded file and
 * rejects the request (removing the local copies) when persistence fails.
 */
async function persistUploads(req, res, next) {
  const files = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) files.push(...req.files);
  else if (req.files && typeof req.files === 'object') Object.values(req.files).forEach((list) => files.push(...list));
  if (!files.length || config.driver !== 's3') return next();
  try {
    await Promise.all(files.map((file) => persist(file.path, { contentType: file.mimetype })));
    return next();
  } catch (error) {
    log('error', 'storage.persist_failed', { error: serializeError(error) });
    await Promise.all(files.map((file) => removeQuietly(file.path)));
    return res.status(503).json({ success: false, error: 'File storage is unavailable; the upload was not saved. Try again shortly.' });
  }
}

/** Round-trip probe used by the QA self-test. */
async function probe() {
  const key = `.qa-probe-${crypto.randomBytes(6).toString('hex')}`;
  const content = `probe ${new Date().toISOString()}`;
  const localPath = pathForKey(key);
  await writeFile(localPath, content, { contentType: 'text/plain' });
  try {
    if (config.driver === 's3') {
      await fs.promises.rm(localPath, { force: true });
      await ensureLocal(localPath);
    }
    const readBack = await fs.promises.readFile(localPath, 'utf8');
    return { ok: readBack === content };
  } finally {
    await remove(localPath).catch(() => {});
  }
}

/** Log once at startup when uploads would be lost on redeploy. */
function warnIfEphemeral() {
  const info = describe();
  if (process.env.NODE_ENV === 'production' && !info.durable) {
    log('warn', 'storage.ephemeral', {
      detail: 'Uploaded files are stored on the container filesystem and will be lost on redeploy. Set S3_BUCKET (object storage) or mount a volume at UPLOADS_DIR.',
      location: info.location
    });
  }
  return info;
}

/** Test hook: re-read configuration from an environment object. */
function _configure(env) {
  config = readConfig(env);
  s3 = null;
}

module.exports = {
  describe,
  persist,
  writeFile,
  ensureLocal,
  remove,
  removeQuietly,
  persistUploads,
  probe,
  warnIfEphemeral,
  _configure
};
