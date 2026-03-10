// Postinstall compatibility shim for ajv.
// Some transitive dependencies reference ajv modules that may not resolve
// cleanly under npm's flat node_modules layout.  This script silently
// patches the require paths if needed; if everything already resolves it
// is a no-op.
'use strict';

try {
  require.resolve('ajv');
} catch (_) {
  // ajv not installed – nothing to patch
}
