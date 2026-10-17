'use strict';

/**
 * Desktop launcher log.
 *
 * One file per launch at <dataDir>/logs/desktop.log; the previous launch is
 * kept as desktop.previous.log so a user can still attach it after a restart.
 * Child-process output is written here too, prefixed with its source.
 */

const fs = require('fs');
const path = require('path');

const MAX_TAIL_LINES = 60;

function createLogger(logsDir) {
  fs.mkdirSync(logsDir, { recursive: true });
  const filePath = path.join(logsDir, 'desktop.log');
  const previousPath = path.join(logsDir, 'desktop.previous.log');
  try {
    if (fs.existsSync(filePath)) fs.renameSync(filePath, previousPath);
  } catch (_) {
    // Another process may hold the old file open on Windows; append instead.
  }

  const tails = new Map();

  function write(line) {
    try {
      fs.appendFileSync(filePath, `${new Date().toISOString()} ${line}\n`);
    } catch (_) {
      // Logging must never take the launcher down.
    }
  }

  function log(level, message) {
    const line = `[${level.toUpperCase()}] ${message}`;
    write(line);
    if (process.env.CW_DESKTOP_LOG_STDOUT === '1') process.stdout.write(`${line}\n`);
  }

  /** Record a chunk of child-process output and keep its last lines in memory. */
  function child(source, chunk) {
    const tail = tails.get(source) || [];
    for (const raw of chunk.toString().replace(/\r\n/g, '\n').split('\n')) {
      if (!raw) continue;
      write(`[${source}] ${raw}`);
      tail.push(raw);
      if (tail.length > MAX_TAIL_LINES) tail.shift();
    }
    tails.set(source, tail);
  }

  function tail(source, lines = 20) {
    return (tails.get(source) || []).slice(-lines);
  }

  return { filePath, logsDir, log, child, tail };
}

module.exports = { createLogger };
