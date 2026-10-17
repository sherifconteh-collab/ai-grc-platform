#!/usr/bin/env bash
# Install a built macOS or Linux artifact the way a user would, then boot it
# with --smoke-test (full stack, sign-in, shutdown) from that location.
#
#   smoke-installed.sh appimage <file.AppImage>
#       Runs the AppImage mounted through FUSE, as users run it. The mount is
#       read-only, so any write into the install directory fails the test.
#       (APPIMAGE_EXTRACT_AND_RUN would extract to a writable folder and hide
#       exactly that class of bug.)
#   smoke-installed.sh dmg <file.dmg>
#       Mounts the DMG read-only and runs the app from the mounted volume,
#       then copies it to /Applications as a user would and runs it there.
#
# On failure the tail of the app's desktop.log is printed.
set -euo pipefail

mode="${1:?usage: smoke-installed.sh appimage|dmg <file>}"
artifact="${2:?usage: smoke-installed.sh appimage|dmg <file>}"
extra_args=()

run_smoke() {
  local binary="$1" label="$2"
  local data_dir
  data_dir="$(mktemp -d)"
  echo "::group::Smoke test: ${label}"
  echo "binary: ${binary}"
  local status=0
  "$binary" "${extra_args[@]}" --smoke-test --smoke-data-dir "$data_dir" || status=$?
  echo "::endgroup::"
  if [ "$status" -ne 0 ]; then
    echo "::error::Smoke test failed for ${label} (exit ${status})"
    tail -n 80 "$data_dir/logs/desktop.log" 2>/dev/null || echo "(no desktop.log was written)"
    exit "$status"
  fi
  grep -E '\[(INFO|WARN|ERROR)\]' "$data_dir/logs/desktop.log" | grep -v 'exited code' | tail -n 10
}

case "$mode" in
  appimage)
    chmod +x "$artifact"
    # Electron in CI needs a display and no GPU/sandbox; users get neither flag.
    extra_args=(--no-sandbox --disable-gpu)
    unset APPIMAGE_EXTRACT_AND_RUN
    wrapper="$(mktemp)"
    printf '#!/usr/bin/env bash\nexec xvfb-run -a --server-args="-screen 0 1280x720x24" "%s" "$@"\n' "$artifact" > "$wrapper"
    chmod +x "$wrapper"
    run_smoke "$wrapper" "AppImage (FUSE mount, read-only)"
    ;;

  dmg)
    mount_point="$(mktemp -d)"
    hdiutil attach -nobrowse -readonly -mountpoint "$mount_point" "$artifact" >/dev/null
    trap 'hdiutil detach "$mount_point" -force >/dev/null 2>&1 || true' EXIT
    app="$(find "$mount_point" -maxdepth 1 -name '*.app' -type d | head -n 1)"
    if [ -z "$app" ]; then
      echo "::error::No .app bundle found in ${artifact}"
      exit 1
    fi
    app_name="$(basename "$app")"
    executable="Contents/MacOS/${app_name%.app}"

    run_smoke "$app/$executable" "${app_name} run from the mounted DMG (read-only)"

    rm -rf "/Applications/${app_name}"
    ditto "$app" "/Applications/${app_name}"
    run_smoke "/Applications/${app_name}/${executable}" "${app_name} installed in /Applications"
    rm -rf "/Applications/${app_name}"
    ;;

  *)
    echo "unknown mode: ${mode}" >&2
    exit 2
    ;;
esac
