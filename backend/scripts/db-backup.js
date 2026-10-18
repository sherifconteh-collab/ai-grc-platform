#!/usr/bin/env node
// @tier: community
require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function timestamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

function toInt(value, fallback) {
  const parsed = parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ensureDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function pruneOldBackups(backupDir, retentionDays) {
  if (retentionDays <= 0) return { removed: 0, checked: 0 };

  const now = Date.now();
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(backupDir).filter((name) => /\.(dump|sql)$/.test(name));
  let removed = 0;

  for (const file of files) {
    const fullPath = path.join(backupDir, file);
    const stat = fs.statSync(fullPath);
    if (now - stat.mtimeMs > maxAgeMs) {
      fs.unlinkSync(fullPath);
      removed += 1;
    }
  }

  return { removed, checked: files.length };
}

function buildBackupCommand(outputFile) {
  const backupFormat = String(process.env.DB_BACKUP_FORMAT || 'custom').toLowerCase();
  const pgDumpBin = process.env.PG_DUMP_PATH || 'pg_dump';
  const args = ['--no-owner', '--no-acl'];

  if (backupFormat === 'plain') {
    args.push('--format=plain');
  } else {
    args.push('--format=custom');
  }

  args.push(`--file=${outputFile}`);

  if (process.env.DATABASE_URL) {
    args.push(`--dbname=${process.env.DATABASE_URL}`);
  } else {
    if (!process.env.DB_NAME) {
      throw new Error('DB_NAME is required when DATABASE_URL is not set.');
    }
    if (process.env.DB_HOST) args.push(`--host=${process.env.DB_HOST}`);
    if (process.env.DB_PORT) args.push(`--port=${process.env.DB_PORT}`);
    if (process.env.DB_USER) args.push(`--username=${process.env.DB_USER}`);
    args.push(process.env.DB_NAME);
  }

  return { pgDumpBin, args, backupFormat };
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  const backupDir = process.env.DB_BACKUP_DIR || path.join(__dirname, '..', 'backups');
  const retentionDays = toInt(process.env.DB_BACKUP_RETENTION_DAYS, 7);

  ensureDirectory(backupDir);

  const stamp = timestamp();
  const extension = String(process.env.DB_BACKUP_FORMAT || 'custom').toLowerCase() === 'plain' ? 'sql' : 'dump';
  const outputFile = path.join(backupDir, `grc_${stamp}.${extension}`);
  const { pgDumpBin, args, backupFormat } = buildBackupCommand(outputFile);

  console.log('Starting database backup...');
  console.log(`Backup directory: ${backupDir}`);
  console.log(`Backup format: ${backupFormat}`);
  console.log(`Retention days: ${retentionDays}`);
  // The scheduler stores this output in backup_logs; never print the password.
  const printable = args.map((arg) => arg.replace(/^(--dbname=[a-z]+:\/\/[^:/@]+:)[^@]*@/i, '$1***@'));
  console.log(`Command: ${pgDumpBin} ${printable.join(' ')}`);

  if (dryRun) {
    console.log('Dry run complete. No backup file was created.');
    return;
  }

  const env = { ...process.env };
  if (!process.env.DATABASE_URL && process.env.DB_PASSWORD) {
    env.PGPASSWORD = process.env.DB_PASSWORD;
  }

  const result = spawnSync(pgDumpBin, args, {
    env,
    stdio: 'inherit'
  });

  if (result.error) {
    throw new Error(`Failed to execute pg_dump: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`pg_dump exited with status ${result.status}`);
  }

  const stat = fs.statSync(outputFile);
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
  console.log(`Backup created: ${outputFile} (${sizeMb} MB)`);

  // Upload to S3 if configured
  const s3Bucket = process.env.AWS_S3_BUCKET;
  if (s3Bucket) {
    try {
      let s3Sdk;
      try {
        s3Sdk = require('@aws-sdk/client-s3');
      } catch (_) {
        throw new Error('AWS_S3_BUCKET is set but @aws-sdk/client-s3 is not installed; run "npm install @aws-sdk/client-s3" in backend/');
      }
      const { S3Client, PutObjectCommand } = s3Sdk;
      const region = process.env.AWS_REGION || 'us-east-1';
      const prefix = process.env.AWS_S3_PREFIX || 'backups/';
      const s3Key = `${prefix}${path.basename(outputFile)}`;
      const s3 = new S3Client({ region });
      const fileStream = fs.createReadStream(outputFile);
      await s3.send(new PutObjectCommand({ Bucket: s3Bucket, Key: s3Key, Body: fileStream }));
      console.log(`Uploaded to s3://${s3Bucket}/${s3Key}`);
    } catch (s3Err) {
      console.error(`S3 upload failed (local backup preserved): ${s3Err.message}`);
    }
  }

  const pruneResult = pruneOldBackups(backupDir, retentionDays);
  console.log(`Backup retention: checked ${pruneResult.checked} files, removed ${pruneResult.removed}.`);
}

run().catch((error) => {
  console.error(`Backup failed: ${error.message}`);
  process.exit(1);
});
