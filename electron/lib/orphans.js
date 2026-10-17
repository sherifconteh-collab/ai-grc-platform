'use strict';

/**
 * Server processes left behind by a launch that crashed or was killed.
 *
 * On Windows a child process outlives its parent, so after a crash the old
 * API server keeps port 3001 and the next launch cannot start. The launcher
 * records each child's PID; the next launch stops any that are still alive
 * and are provably the same process, then forgets them.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const FILE = 'running-processes.json';

function filePath(dataDir) {
  return path.join(dataDir, FILE);
}

function read(dataDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath(dataDir), 'utf8'));
    return Array.isArray(parsed) ? parsed.filter((p) => Number.isInteger(p.pid) && p.pid > 0) : [];
  } catch (_) {
    return [];
  }
}

function record(dataDir, entries) {
  fs.writeFileSync(filePath(dataDir), JSON.stringify(entries, null, 2));
}

function clear(dataDir) {
  fs.rmSync(filePath(dataDir), { force: true });
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/** POSIX process start time; together with the PID it identifies one process. */
function startTime(pid) {
  if (process.platform === 'win32') return null;
  const out = spawnSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8' });
  return String(out.stdout || '').trim() || null;
}

/**
 * True only when the PID is alive and is the process we recorded. On POSIX the
 * start time must match (Next.js renames its process title, and a reused PID
 * has a different start time). On Windows the executable name must match.
 */
function isOurs(entry) {
  if (!isAlive(entry.pid)) return false;
  if (process.platform !== 'win32') {
    return Boolean(entry.startedAt) && startTime(entry.pid) === entry.startedAt;
  }
  const out = spawnSync('tasklist', ['/FI', `PID eq ${entry.pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true });
  const image = (String(out.stdout || '').split(',')[0] || '').replace(/"/g, '').trim().toLowerCase();
  return Boolean(entry.executable) && image === path.basename(entry.executable).toLowerCase();
}

function kill(pid) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    return;
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch (_) {
    // Already gone.
  }
}

/** Stop leftovers from an earlier launch. Returns how many were stopped. */
function reap(dataDir, logger) {
  let stopped = 0;
  for (const entry of read(dataDir)) {
    if (isOurs(entry)) {
      logger.log('warn', `Stopping ${entry.source || 'a server'} left running by an earlier session (PID ${entry.pid}).`);
      kill(entry.pid);
      stopped += 1;
    }
  }
  clear(dataDir);
  return stopped;
}

module.exports = { reap, record, clear, startTime };
