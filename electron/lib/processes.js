'use strict';

/**
 * Child-process helpers for the desktop launcher.
 *
 * Every wait here has two exits: the thing becomes ready, or the child dies.
 * A child that crashes during startup fails the launch immediately with its
 * last output instead of leaving the user staring at a spinner until a
 * timeout fires.
 */

const http = require('http');
const { spawn, spawnSync } = require('child_process');

class StartupError extends Error {
  constructor(message, { step, hint, output } = {}) {
    super(message);
    this.name = 'StartupError';
    this.step = step || null;
    this.hint = hint || null;
    this.output = output || [];
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Spawn a long-running child. stdout/stderr go to the logger under `source`.
 * Returns the ChildProcess with an `exited` promise attached.
 */
function spawnChild(command, args, { cwd, env, logger, source, onLine }) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const handle = (chunk) => {
    logger.child(source, chunk);
    if (onLine) {
      for (const line of chunk.toString().split(/\r?\n/)) if (line) onLine(line);
    }
  };
  child.stdout.on('data', handle);
  child.stderr.on('data', handle);
  child.exited = new Promise((resolve) => {
    child.on('error', (error) => {
      logger.log('error', `[${source}] failed to spawn: ${error.message}`);
      resolve({ code: null, signal: null, error });
    });
    child.on('exit', (code, signal) => {
      const expected = code === 0 || child.stopRequested;
      logger.log(expected ? 'info' : 'warn', `[${source}] exited code=${code} signal=${signal}`);
      resolve({ code, signal, error: null });
    });
  });
  return child;
}

/** Run a command to completion; reject with its output on a non-zero exit. */
async function runToCompletion(command, args, opts) {
  const child = spawnChild(command, args, opts);
  const { code, error } = await child.exited;
  if (error || code !== 0) {
    throw new StartupError(`${opts.source} failed (exit code ${code})`, {
      step: opts.source,
      output: opts.logger.tail(opts.source, 25),
    });
  }
}

function httpGet(port, path, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.setTimeout(timeoutMs, () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

/**
 * Wait until GET http://127.0.0.1:<port><path> answers with a status below
 * 500, the child exits, or the deadline passes.
 */
async function waitForHttp(child, { port, path, timeoutMs, logger, source, hint }) {
  const deadline = Date.now() + timeoutMs;
  let exitInfo = null;
  child.exited.then((info) => { exitInfo = info; });

  while (Date.now() < deadline) {
    if (exitInfo) {
      throw new StartupError(`${source} stopped during startup (exit code ${exitInfo.code})`, {
        step: source,
        hint,
        output: logger.tail(source, 25),
      });
    }
    const status = await httpGet(port, path);
    if (status !== null && status < 500) return;
    await sleep(400);
  }
  throw new StartupError(`${source} did not answer on port ${port} within ${Math.round(timeoutMs / 1000)}s`, {
    step: source,
    hint,
    output: logger.tail(source, 25),
  });
}

/** Kill a child and everything it started. Windows needs taskkill /T for that. */
function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    return;
  }
  try {
    child.kill('SIGTERM');
  } catch (_) {
    // Already gone.
  }
}

/** Stop a child gracefully, then force it after `graceMs`. */
async function stopChild(child, graceMs = 5000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.stopRequested = true;
  killTree(child);
  const done = await Promise.race([child.exited.then(() => true), sleep(graceMs).then(() => false)]);
  if (!done) {
    try {
      child.kill('SIGKILL');
    } catch (_) {
      // Already gone.
    }
  }
}

module.exports = {
  StartupError,
  sleep,
  spawnChild,
  runToCompletion,
  waitForHttp,
  killTree,
  stopChild,
};
