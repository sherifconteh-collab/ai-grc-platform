# ControlWeave Desktop

The desktop app bundles PostgreSQL 17, the Express backend and the Next.js
frontend, and runs them on the user's machine. Electron only provides the
windows; everything that starts and stops the stack is plain Node in `lib/`,
so CI boots exactly the code users run.

## Layout

| File | Role |
|---|---|
| `main.js` | Electron main process: single-instance lock, startup window, app window, menu, quit. |
| `startup.html`, `startup.js`, `startup-preload.js` | Startup window: step progress, first-run sign-in details, error screen with Try again / Open logs / Copy details. |
| `preload.js`, `updater.js` | App window bridge (`window.electronAPI`) and auto-updates. |
| `lib/stack.js` | Starts database, migrations, API, admin check and interface in order; `stop()` works at any point. |
| `lib/postgres.js` | Bundled PostgreSQL through its own `initdb` and `pg_ctl`; recovers a server left running by a crash. |
| `lib/orphans.js` | Stops API and interface processes a crashed launch left behind (they keep port 3001 on Windows). |
| `lib/secrets.js` | Per-install secrets and the first-run administrator account, kept in the data folder. |
| `lib/processes.js`, `lib/ports.js`, `lib/log.js`, `lib/verify.js` | Child processes, port selection, `desktop.log`, sign-in check. |

The data folder (`app.getPath('userData')`, named `controlweave-desktop`) holds
`pgdata/`, `uploads/`, `logs/` and the secret files. Nothing is written to the
install directory.

## Ports

The API listens on 3001; the frontend bundle proxies `/api/v1` and
`/socket.io` to that port at build time (`frontend/next.config.ts`), so it
cannot move. The interface (3000) and database (5433) fall back to any free
port.

## Testing

```bash
# Once: install backend, frontend and electron dependencies, build the frontend
cd frontend && npm run build && cd ../electron

npm test          # launcher unit tests (node:test)
npm run smoke     # boot the stack twice from plain Node and sign in; no Electron needed
npm start         # run the app from source
```

The packaged app accepts `--smoke-test [--smoke-data-dir <dir>]`: it boots
the full stack in a throwaway data folder, signs in, shuts down and exits 0
or 1.

`scripts/smoke-installed.sh` (macOS, Linux) and `scripts/smoke-installed.ps1`
(Windows) install a built artifact the way a user does and run that check from
the installed location:

| Platform | What is booted |
|---|---|
| Windows | The `.exe` installed silently into `%LOCALAPPDATA%\Programs` (the default per-user install). |
| macOS | The app on the mounted DMG (read-only), then a copy in `/Applications`. |
| Linux | The AppImage through its FUSE mount (read-only), not extracted. |

The read-only runs fail if the app writes into its own install folder. CI runs
these on every pull request that touches the app (`.github/workflows/desktop.yml`)
and on every release installer (`build-release.yml`).

```bash
bash scripts/smoke-installed.sh appimage dist/ControlWeave-<version>.AppImage
bash scripts/smoke-installed.sh dmg dist/ControlWeave-<version>-arm64.dmg
pwsh scripts/smoke-installed.ps1 -Installer dist/ControlWeave.Setup.<version>.exe
```
