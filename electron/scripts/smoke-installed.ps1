# Install the built Windows installer silently, the way a user's default
# install does (per-user, %LOCALAPPDATA%\Programs), then boot the installed
# ControlWeave.exe with --smoke-test (full stack, sign-in, shutdown).
#
#   pwsh electron/scripts/smoke-installed.ps1 -Installer <ControlWeave.Setup.x.exe>
#
# A run passes only when the app exits 0 and its desktop.log says the smoke
# test passed. On failure the tail of desktop.log is printed.
param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [int]$TimeoutSeconds = 600
)
$ErrorActionPreference = 'Stop'

$installer = (Resolve-Path $Installer).Path
Write-Host "Installing $installer silently"
$setup = Start-Process -FilePath $installer -ArgumentList '/S' -PassThru -Wait
if ($setup.ExitCode -ne 0) {
  throw "Installer exited with code $($setup.ExitCode)."
}

# The assisted NSIS installer ignores /D= in silent mode, so locate the
# installed executable instead of assuming a folder name.
$exe = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Programs') -Filter 'ControlWeave.exe' -Recurse -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not $exe) {
  throw "ControlWeave.exe was not found under $env:LOCALAPPDATA\Programs after installing."
}
Write-Host "Installed at $($exe.FullName)"

$dataDir = Join-Path $env:RUNNER_TEMP ("cw-smoke-" + [guid]::NewGuid().ToString('N'))
$log = Join-Path (Join-Path $dataDir 'logs') 'desktop.log'
$process = Start-Process -FilePath $exe.FullName -ArgumentList '--smoke-test', '--smoke-data-dir', "`"$dataDir`"" -PassThru
$process | Wait-Process -Timeout $TimeoutSeconds -ErrorAction SilentlyContinue

if (-not $process.HasExited) {
  Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  if (Test-Path $log) { Get-Content $log -Tail 80 }
  throw "Smoke test timed out after $TimeoutSeconds seconds."
}
if ($process.ExitCode -ne 0) {
  if (Test-Path $log) { Get-Content $log -Tail 80 } else { Write-Host '(no desktop.log was written)' }
  throw "Smoke test failed with exit code $($process.ExitCode)."
}
# Exit code 0 alone is not proof: require the app's own pass line.
if (-not ((Test-Path $log) -and (Select-String -Path $log -Pattern 'Smoke test passed' -Quiet))) {
  if (Test-Path $log) { Get-Content $log -Tail 80 }
  throw 'The app exited 0 but its log does not say the smoke test passed.'
}
Get-Content $log | Select-String -Pattern '\[(INFO|WARN|ERROR)\]' | Select-String -NotMatch 'exited code' | Select-Object -Last 10
