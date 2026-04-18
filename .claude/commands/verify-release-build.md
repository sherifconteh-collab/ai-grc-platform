# /verify-release-build

After publishing a release tag:

1. Confirm `build-release.yml` ran green for the tag (Linux AppImage, macOS dmg, Windows exe).
2. Verify in-CI smoke `ControlWeave.exe --smoke-test` exited 0 (already wired around `build-release.yml:186-193`).
3. Confirm `ControlWeave.Setup.*.exe` artifact uploaded under `controlweave-windows-installer`.
4. Confirm electron-builder published the assets to the GitHub Release for the tag.
5. Trigger the manual `e2e.yml` workflow with input `spec=e2e/download.spec.ts` to download the actual installer and verify the PE header (`MZ` magic) and >1 MB size.
6. If any step fails, file an issue tagged `release-blocker` and roll back the tag.
