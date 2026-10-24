'use strict';

/**
 * The File and Help menu actions of the desktop app, and the menu template.
 *
 * main.js owns the windows and the app lifecycle; the work behind each menu
 * item lives here with no direct Electron import, so test/menuActions.test.js
 * can call every action with `dialog` stubbed. Everything that touches
 * Electron or main.js's state arrives through `deps`:
 *
 *   state             live view of main.js's variables (getters and setters):
 *                     stack, maintenance, launching, connecting, connected,
 *                     mode, presetServer, quitAfterMaintenance
 *   app, dialog, shell, clipboard   the Electron objects
 *   backup            lib/backup.js
 *   bundledMajor      PostgreSQL major version shipped with the app
 *   dataDir()         the data folder
 *   logger()          the file logger, or null
 *   loadAdminCredentials(dataDir)
 *   getMainWindow(), getStartupWindow()
 *   createStartupWindow(), sendStartup(event), destroyMainWindow()
 *   startLocal(), showChooser()
 *   checkForUpdates(), openExternal(url), repoUrl
 *   isPackaged, platform
 */
const path = require('path');

function createMenuActions(deps) {
  const { state, app, dialog, shell, clipboard, backup } = deps;
  const log = (level, message) => {
    const logger = deps.logger();
    if (logger) logger.log(level, message);
  };

  /** Daily backup after the database has stopped cleanly. Never blocks quitting on failure. */
  function backupAfterStop(result) {
    if (!result || !result.databaseStopped) return null;
    try {
      const dir = backup.createBackup(deps.dataDir(), { appVersion: app.getVersion() });
      log('info', `Backup saved to ${dir}`);
      return dir;
    } catch (error) {
      log('warn', `Backup failed: ${error.message}`);
      return null;
    }
  }

  /** Menu: stop what runs now (backing up local data first) and ask again. */
  async function changeConnection() {
    if (state.presetServer || state.maintenance || state.launching || state.connecting) return;
    const local = state.mode && state.mode.mode === 'local';
    const { response } = await dialog.showMessageBox(deps.getMainWindow() || undefined, {
      type: 'question',
      title: 'Change connection',
      message: local ? 'Connect to your organization\'s server instead?' : 'Stop using this server?',
      detail: local
        ? 'ControlWeave stops the database on this computer and backs it up first. Your local data stays on this computer, and you can switch back to it at any time.'
        : `ControlWeave closes ${state.mode.origin}. You can connect to it again at any time.`,
      buttons: ['Continue', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return;
    state.maintenance = true;
    try {
      await deps.createStartupWindow();
      deps.destroyMainWindow();
      state.connected = false;
      if (state.stack) {
        const running = state.stack;
        state.stack = null;
        deps.sendStartup({ type: 'notice', text: 'Stopping and backing up your data...' });
        backupAfterStop(await running.stop());
      }
    } catch (error) {
      log('warn', `Stopping for a connection change: ${error.message}`);
    } finally {
      state.maintenance = false;
    }
    if (state.quitAfterMaintenance) app.quit();
    else deps.showChooser();
  }

  /**
   * Stop the stack, run `work` while the database is down, then start again.
   * The startup window shows `notice` meanwhile and the restarted progress after.
   */
  async function withStackStopped(notice, work) {
    if (!state.stack || state.maintenance) return;
    state.maintenance = true;
    const running = state.stack;
    state.stack = null;
    try {
      // Open the startup window first: closing the last window quits the app.
      await deps.createStartupWindow();
      deps.destroyMainWindow();
      deps.sendStartup({ type: 'notice', text: notice });
      const result = await running.stop();
      if (!result.databaseStopped) throw new Error('The database did not stop, so it was left untouched.');
      await work();
    } catch (error) {
      log('error', `${notice} failed: ${error.message}`);
      await dialog.showMessageBox(deps.getStartupWindow() || undefined, {
        type: 'error',
        title: 'ControlWeave',
        message: `${notice.replace(/\.+$/, '')} failed`,
        detail: error.message,
      });
    } finally {
      state.maintenance = false;
      if (state.quitAfterMaintenance) app.quit();
      else deps.startLocal();
    }
  }

  function backUpNow() {
    return withStackStopped('Backing up your data...', async () => {
      const dir = backup.createBackup(deps.dataDir(), { appVersion: app.getVersion() });
      await dialog.showMessageBox(deps.getStartupWindow() || undefined, {
        type: 'info',
        title: 'Backup saved',
        message: 'Your data is backed up.',
        detail: `${dir}\n\nUse File > Export Latest Backup to copy it to another disk.`,
      });
    });
  }

  async function exportLatestBackup() {
    const parent = () => deps.getMainWindow() || undefined;
    const [latest] = backup.listBackups(deps.dataDir());
    if (!latest) {
      await dialog.showMessageBox(parent(), {
        type: 'info',
        title: 'No backup yet',
        message: 'There is no backup to export yet.',
        detail: 'ControlWeave backs up when you quit. Use File > Back Up Now to make one immediately.',
      });
      return;
    }
    const { response } = await dialog.showMessageBox(parent(), {
      type: 'warning',
      title: 'Export backup',
      message: `Export the backup from ${latest.name}?`,
      detail: 'The backup holds all of this installation\'s data, for every account, together with the keys that decrypt it and the first-run administrator password. Store it only somewhere as protected as this computer.',
      buttons: ['Choose Folder...', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return;
    const { canceled, filePaths } = await dialog.showOpenDialog(parent(), {
      title: 'Export ControlWeave backup to',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (canceled || !filePaths[0]) return;
    if (backup.isNetworkPath(filePaths[0])) {
      const choice = await dialog.showMessageBox(parent(), {
        type: 'warning',
        title: 'Network folder',
        message: 'This folder is on a network share.',
        detail: 'The backup will be locked to your Windows account where the share supports it, but other people who administer the share may still reach it.',
        buttons: ['Export Anyway', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
      });
      if (choice.response !== 0) return;
    }
    try {
      const dest = backup.exportBackup(latest.dir, filePaths[0]);
      await dialog.showMessageBox(parent(), { type: 'info', title: 'Backup exported', message: 'Backup exported.', detail: dest });
    } catch (error) {
      await dialog.showMessageBox(parent(), { type: 'error', title: 'Export failed', message: 'The backup could not be exported.', detail: error.message });
    }
  }

  async function restoreFromBackup() {
    const parent = () => deps.getMainWindow() || undefined;
    const { canceled, filePaths } = await dialog.showOpenDialog(parent(), {
      title: 'Choose a ControlWeave backup folder',
      defaultPath: backup.backupsDir(deps.dataDir()),
      properties: ['openDirectory'],
    });
    if (canceled || !filePaths[0]) return;
    const source = filePaths[0];
    let manifest;
    try {
      manifest = backup.readBackup(source, deps.bundledMajor);
    } catch (error) {
      await dialog.showMessageBox(parent(), { type: 'error', title: 'Not a usable backup', message: 'This folder cannot be restored.', detail: error.message });
      return;
    }
    const { response } = await dialog.showMessageBox(parent(), {
      type: 'warning',
      title: 'Restore backup',
      message: `Replace all data in this installation with the backup from ${new Date(manifest.createdAt).toLocaleString()}?`,
      detail: 'This replaces the data of every account in this installation, and ControlWeave restarts. Your current data is kept in the backups folder (pre-restore), so the restore can be undone.',
      buttons: ['Restore', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
    if (response !== 0) return;
    await withStackStopped('Restoring your backup...', async () => {
      backup.restoreBackup(deps.dataDir(), source, { bundledMajor: deps.bundledMajor });
    });
  }

  function showSignInDetails() {
    const admin = deps.loadAdminCredentials(deps.dataDir());
    return dialog.showMessageBox(deps.getMainWindow() || undefined, {
      type: 'info',
      title: 'First-run sign-in details',
      message: 'The administrator account created on first launch',
      detail: `Email: ${admin.email}\nInitial password: ${admin.password}\n\nIf you changed the password inside ControlWeave, use your new password instead.`,
      buttons: ['Copy password', 'Close'],
      defaultId: 1,
    }).then(({ response }) => {
      if (response === 0) clipboard.writeText(admin.password);
    });
  }

  /** The application menu. Backup items exist only in local mode; switching only without an IT preset. */
  function buildMenuTemplate() {
    const viewItems = [
      { role: 'reload' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ];
    if (!deps.isPackaged) viewItems.push({ role: 'toggleDevTools' });

    const mode = state.mode;
    const local = !mode || mode.mode === 'local';
    const fileItems = local ? [
      { label: 'Back Up Now', click: () => backUpNow() },
      { label: 'Export Latest Backup...', click: () => exportLatestBackup() },
      { label: 'Restore from Backup...', click: () => restoreFromBackup() },
      { label: 'Open Backups Folder', click: () => shell.openPath(backup.backupsDir(deps.dataDir())) },
      { type: 'separator' },
    ] : [];
    if (!state.presetServer && mode) {
      fileItems.push(
        { label: local ? 'Connect to a Server...' : 'Change Connection...', click: () => changeConnection() },
        { type: 'separator' }
      );
    }
    const helpLocal = local ? [{ label: 'Show First-Run Sign-In Details', click: () => showSignInDetails() }] : [];

    return [
      ...(deps.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      {
        label: 'File',
        submenu: [...fileItems, { role: deps.platform === 'darwin' ? 'close' : 'quit' }],
      },
      { role: 'editMenu' },
      { label: 'View', submenu: viewItems },
      {
        label: 'Help',
        submenu: [
          { label: 'Check for Updates...', click: () => deps.checkForUpdates() },
          { type: 'separator' },
          ...helpLocal,
          { label: 'Open Logs Folder', click: () => shell.openPath(path.join(deps.dataDir(), 'logs')) },
          { type: 'separator' },
          { label: 'Documentation', click: () => deps.openExternal(deps.repoUrl) },
          { label: 'Report Issue', click: () => deps.openExternal(`${deps.repoUrl}/issues`) },
        ],
      },
    ];
  }

  return {
    backupAfterStop,
    changeConnection,
    withStackStopped,
    backUpNow,
    exportLatestBackup,
    restoreFromBackup,
    showSignInDetails,
    buildMenuTemplate,
  };
}

module.exports = { createMenuActions };
