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
#   smoke-installed.sh binary <app executable>
#       Runs an app executable directly, e.g. an unpacked build.
#
# A run passes only when the app exits 0 AND its own desktop.log says the
# smoke test passed, so a script error can never report success without the
# app having been booted. On failure the tail of desktop.log is printed.
# Written for bash 3.2, which macOS ships.
set -euo pipefail

usage='usage: smoke-installed.sh appimage|dmg|binary <file>'
mode="${1:?$usage}"
artifact="${2:?$usage}"
extra_args=()
PASS_LINE='Smoke test passed'

run_smoke() {
  local binary="$1" label="$2"
  local data_dir
  data_dir="$(mktemp -d)"
  echo "::group::Smoke test: ${label}"
  echo "binary: ${binary}"
  local status=0
  # bash 3.2 treats an empty array as unset under set -u; expand it only when set.
  "$binary" ${extra_args[@]+"${extra_args[@]}"} --smoke-test --smoke-data-dir "$data_dir" || status=$?
  echo "::endgroup::"
  local log="$data_dir/logs/desktop.log"
  if [ "$status" -eq 0 ] && ! grep -q "$PASS_LINE" "$log" 2>/dev/null; then
    echo "::error::${label} exited 0 but its log does not say the smoke test passed"
    status=1
  fi
  if [ "$status" -ne 0 ]; then
    echo "::error::Smoke test failed for ${label} (exit ${status})"
    tail -n 80 "$log" 2>/dev/null || echo "(no desktop.log was written)"
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
    # Keep the script's exit code: bash 3.2 otherwise exits with the trap's
    # last status, which turned a failed run into a pass.
    trap 'rc=$?; hdiutil detach "$mount_point" -force >/dev/null 2>&1; exit $rc' EXIT
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

  binary)
    run_smoke "$artifact" "$(basename "$artifact")"
    ;;

  *)
    echo "unknown mode: ${mode}" >&2
    exit 2
    ;;
esac
