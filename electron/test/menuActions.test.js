'use strict';

// The File and Help menu wiring (#396): every action is called with `dialog`
// stubbed, against the real lib/backup.js and a throwaway data folder.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const backup = require('../lib/backup');
const { createMenuActions } = require('../lib/menuActions');

function tempDir(prefix = 'cw-menu-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fakeDataDir(label) {
  const dir = tempDir();
  const pg = path.join(dir, 'pgdata');
  fs.mkdirSync(path.join(pg, 'base'), { recursive: true });
  fs.writeFileSync(path.join(pg, 'PG_VERSION'), '17\n');
  fs.writeFileSync(path.join(pg, 'base', 'table'), `rows from ${label}`);
  for (const name of ['postgresql.conf', 'pg_hba.conf', 'pg_ident.conf']) {
    fs.writeFileSync(path.join(pg, name), `# ${label} ${name}\n`);
  }
  fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'uploads', 'evidence.pdf'), `evidence from ${label}`);
  for (const name of ['db-credentials.json', 'jwt-secret', 'encryption-key', 'hmac-key', 'admin-credentials.json']) {
    fs.writeFileSync(path.join(dir, name), `${name} of ${label}`);
  }
  return dir;
}

/**
 * Build the actions around a stubbed Electron. `dialogs` queues the answers
 * for showMessageBox ({ response }) and showOpenDialog ({ filePaths }).
 */
function harness({ mode = { mode: 'local' }, presetServer = null, running = true, messageAnswers = [], openAnswers = [], dataDir = fakeDataDir('original') } = {}) {
  const calls = { messages: [], opens: [], stops: 0, startLocal: 0, showChooser: 0, quits: 0, clipboard: [], opened: [], external: [], startupWindows: 0, notices: [] };
  const stack = running ? { stop: async () => { calls.stops += 1; return { databaseStopped: true }; } } : null;
  const state = { stack, maintenance: false, launching: false, connecting: false, connected: false, mode, presetServer, quitAfterMaintenance: false };
  const dialog = {
    showMessageBox: async (_win, options) => {
      calls.messages.push(options);
      return messageAnswers.length ? messageAnswers.shift() : { response: 0 };
    },
    showOpenDialog: async (_win, options) => {
      calls.opens.push(options);
      return openAnswers.length ? openAnswers.shift() : { canceled: true, filePaths: [] };
    },
  };
  const actions = createMenuActions({
    state,
    app: { getVersion: () => '9.9.9', quit: () => { calls.quits += 1; } },
    dialog,
    shell: { openPath: (p) => calls.opened.push(p) },
    clipboard: { writeText: (t) => calls.clipboard.push(t) },
    backup,
    bundledMajor: '17',
    dataDir: () => dataDir,
    logger: () => null,
    loadAdminCredentials: () => ({ email: 'admin@example.test', password: 'first-run-password' }),
    getMainWindow: () => null,
    getStartupWindow: () => null,
    createStartupWindow: async () => { calls.startupWindows += 1; },
    sendStartup: (event) => calls.notices.push(event),
    destroyMainWindow: () => {},
    startLocal: () => { calls.startLocal += 1; },
    showChooser: () => { calls.showChooser += 1; },
    checkForUpdates: () => {},
    openExternal: (url) => calls.external.push(url),
    repoUrl: 'https://example.test/repo',
    isPackaged: true,
    platform: 'linux',
  });
  return { actions, state, calls, dataDir };
}

const labels = (template, menuLabel) => template.find((m) => m.label === menuLabel).submenu.map((i) => i.label).filter(Boolean);
const item = (template, menuLabel, label) => template.find((m) => m.label === menuLabel).submenu.find((i) => i.label === label);

test('Back Up Now stops the stack, writes a backup folder, and starts the stack again', async () => {
  const h = harness();
  await h.actions.backUpNow();
  const [latest] = backup.listBackups(h.dataDir);
  assert.ok(latest, 'a backup folder appeared');
  assert.strictEqual(fs.readFileSync(path.join(latest.dir, 'pgdata', 'base', 'table'), 'utf8'), 'rows from original');
  assert.strictEqual(h.calls.stops, 1);
  assert.strictEqual(h.calls.startLocal, 1);
  assert.strictEqual(h.state.maintenance, false);
  assert.strictEqual(h.state.stack, null);
  assert.strictEqual(h.calls.messages[0].title, 'Backup saved');
  assert.ok(h.calls.messages[0].detail.includes(latest.dir));
});

test('Back Up Now does nothing while a backup or restore already holds the stack', async () => {
  const h = harness();
  h.state.maintenance = true;
  await h.actions.backUpNow();
  assert.strictEqual(h.calls.stops, 0);
  assert.strictEqual(backup.listBackups(h.dataDir).length, 0);
});

test('a failed backup shows the error and still starts the stack again', async () => {
  const h = harness();
  h.state.stack.stop = async () => ({ databaseStopped: false });
  await h.actions.backUpNow();
  assert.strictEqual(h.calls.messages[0].type, 'error');
  assert.match(h.calls.messages[0].detail, /did not stop/);
  assert.strictEqual(backup.listBackups(h.dataDir).length, 0);
  assert.strictEqual(h.calls.startLocal, 1);
});

test('Export Latest Backup says so when there is no backup yet', async () => {
  const h = harness();
  await h.actions.exportLatestBackup();
  assert.strictEqual(h.calls.messages.length, 1);
  assert.strictEqual(h.calls.messages[0].title, 'No backup yet');
  assert.strictEqual(h.calls.opens.length, 0);
});

test('Export Latest Backup copies the newest backup into the chosen folder', async () => {
  const h = harness();
  const made = backup.createBackup(h.dataDir);
  const dest = tempDir('cw-menu-export-');
  const h2 = harness({ dataDir: h.dataDir, messageAnswers: [{ response: 0 }, { response: 0 }], openAnswers: [{ canceled: false, filePaths: [dest] }] });
  await h2.actions.exportLatestBackup();
  const exported = path.join(dest, `ControlWeave-backup-${path.basename(made)}`);
  assert.strictEqual(fs.readFileSync(path.join(exported, 'pgdata', 'base', 'table'), 'utf8'), 'rows from original');
  assert.strictEqual(h2.calls.messages[h2.calls.messages.length - 1].title, 'Backup exported');
});

test('Export Latest Backup copies nothing when the person cancels either prompt', async () => {
  const dataDir = fakeDataDir('original');
  backup.createBackup(dataDir);
  const dest = tempDir('cw-menu-export-');
  const declined = harness({ dataDir, messageAnswers: [{ response: 1 }] });
  await declined.actions.exportLatestBackup();
  assert.strictEqual(declined.calls.opens.length, 0);
  const noFolder = harness({ dataDir, messageAnswers: [{ response: 0 }], openAnswers: [{ canceled: true, filePaths: [] }] });
  await noFolder.actions.exportLatestBackup();
  assert.deepStrictEqual(fs.readdirSync(dest), []);
});

test('Restore from Backup swaps the data and restarts the stack', async () => {
  const source = fakeDataDir('older');
  const sourceBackup = backup.createBackup(source);
  const live = fakeDataDir('current');
  const h = harness({ dataDir: live, messageAnswers: [{ response: 0 }], openAnswers: [{ canceled: false, filePaths: [sourceBackup] }] });
  await h.actions.restoreFromBackup();
  assert.strictEqual(fs.readFileSync(path.join(live, 'pgdata', 'base', 'table'), 'utf8'), 'rows from older');
  assert.strictEqual(fs.readFileSync(path.join(live, 'uploads', 'evidence.pdf'), 'utf8'), 'evidence from older');
  assert.strictEqual(fs.readFileSync(path.join(live, 'jwt-secret'), 'utf8'), 'jwt-secret of older');
  assert.ok(fs.readdirSync(backup.backupsDir(live)).some((n) => n.startsWith('pre-restore-')), 'current data kept aside');
  assert.strictEqual(h.calls.stops, 1);
  assert.strictEqual(h.calls.startLocal, 1);
});

test('Restore from Backup refuses a folder that is not a backup and leaves the stack running', async () => {
  const live = fakeDataDir('current');
  const notBackup = tempDir();
  const h = harness({ dataDir: live, openAnswers: [{ canceled: false, filePaths: [notBackup] }] });
  await h.actions.restoreFromBackup();
  assert.strictEqual(h.calls.messages[0].title, 'Not a usable backup');
  assert.strictEqual(h.calls.stops, 0);
  assert.strictEqual(h.calls.startLocal, 0);
  assert.strictEqual(fs.readFileSync(path.join(live, 'pgdata', 'base', 'table'), 'utf8'), 'rows from current');
});

test('Restore from Backup changes nothing when the person cancels the confirmation', async () => {
  const sourceBackup = backup.createBackup(fakeDataDir('older'));
  const live = fakeDataDir('current');
  const h = harness({ dataDir: live, messageAnswers: [{ response: 1 }], openAnswers: [{ canceled: false, filePaths: [sourceBackup] }] });
  await h.actions.restoreFromBackup();
  assert.strictEqual(h.calls.stops, 0);
  assert.strictEqual(fs.readFileSync(path.join(live, 'pgdata', 'base', 'table'), 'utf8'), 'rows from current');
});

test('switching from local to a server backs up first, then asks where to connect', async () => {
  const h = harness();
  await h.actions.changeConnection();
  assert.strictEqual(h.calls.stops, 1);
  assert.strictEqual(backup.listBackups(h.dataDir).length, 1, 'local data backed up before switching');
  assert.strictEqual(h.state.stack, null);
  assert.strictEqual(h.state.maintenance, false);
  assert.strictEqual(h.calls.showChooser, 1);
});

test('Change Connection does nothing when cancelled, with an IT preset, or mid-launch', async () => {
  const cancelled = harness({ messageAnswers: [{ response: 1 }] });
  await cancelled.actions.changeConnection();
  assert.strictEqual(cancelled.calls.stops, 0);
  assert.strictEqual(cancelled.calls.showChooser, 0);

  const preset = harness({ presetServer: 'https://grc.example.test' });
  await preset.actions.changeConnection();
  assert.strictEqual(preset.calls.messages.length, 0);

  const launching = harness();
  launching.state.launching = true;
  await launching.actions.changeConnection();
  assert.strictEqual(launching.calls.messages.length, 0);
});

test('leaving server mode closes the window without any backup', async () => {
  const h = harness({ mode: { mode: 'server', origin: 'https://grc.example.test' }, running: false });
  h.state.connected = true;
  await h.actions.changeConnection();
  assert.strictEqual(h.state.connected, false);
  assert.strictEqual(backup.listBackups(h.dataDir).length, 0);
  assert.strictEqual(h.calls.showChooser, 1);
});

test('Show First-Run Sign-In Details offers the password and copies it on request', async () => {
  const h = harness({ messageAnswers: [{ response: 0 }] });
  await h.actions.showSignInDetails();
  assert.match(h.calls.messages[0].detail, /admin@example\.test/);
  assert.deepStrictEqual(h.calls.clipboard, ['first-run-password']);
  const closed = harness({ messageAnswers: [{ response: 1 }] });
  await closed.actions.showSignInDetails();
  assert.deepStrictEqual(closed.calls.clipboard, []);
});

test('the menu offers backup items and Connect to a Server in local mode', () => {
  const t = harness().actions.buildMenuTemplate();
  assert.deepStrictEqual(labels(t, 'File'), ['Back Up Now', 'Export Latest Backup...', 'Restore from Backup...', 'Open Backups Folder', 'Connect to a Server...']);
  assert.ok(labels(t, 'Help').includes('Show First-Run Sign-In Details'));
});

test('the menu omits backup items in server mode and offers Change Connection', () => {
  const t = harness({ mode: { mode: 'server', origin: 'https://grc.example.test' } }).actions.buildMenuTemplate();
  assert.deepStrictEqual(labels(t, 'File'), ['Change Connection...']);
  assert.ok(!labels(t, 'Help').includes('Show First-Run Sign-In Details'));
});

test('with a server fixed by IT the menu offers no switching', () => {
  const t = harness({ mode: { mode: 'server', origin: 'https://grc.example.test' }, presetServer: 'https://grc.example.test' }).actions.buildMenuTemplate();
  assert.deepStrictEqual(labels(t, 'File'), []);
});

test('before a choice is made the menu has backup items but no switching', () => {
  const t = harness({ mode: null }).actions.buildMenuTemplate();
  assert.ok(labels(t, 'File').includes('Back Up Now'));
  assert.ok(!labels(t, 'File').includes('Connect to a Server...'));
});

test('menu clicks call the actions', async () => {
  const h = harness();
  const t = h.actions.buildMenuTemplate();
  await item(t, 'File', 'Back Up Now').click();
  assert.strictEqual(backup.listBackups(h.dataDir).length, 1);
  item(t, 'File', 'Open Backups Folder').click();
  assert.deepStrictEqual(h.calls.opened, [backup.backupsDir(h.dataDir)]);
  item(t, 'Help', 'Documentation').click();
  item(t, 'Help', 'Report Issue').click();
  assert.deepStrictEqual(h.calls.external, ['https://example.test/repo', 'https://example.test/repo/issues']);
});
