// Patch script to work around eslint / ajv version mismatch.
// Some eslint plugins bundle their own ajv copy whose draft-04 schema
// support may conflict with the project-level ajv.  This script ensures
// the necessary meta-schema file exists; if it already does, this is a
// no-op.
'use strict';

const fs = require('fs');
const path = require('path');

try {
  const ajvDir = path.dirname(require.resolve('ajv/package.json'));
  const draft04 = path.join(ajvDir, 'lib', 'refs', 'json-schema-draft-04.json');
  if (!fs.existsSync(draft04)) {
    // Create a minimal draft-04 meta-schema stub so ajv won't throw
    const stub = {
      id: 'http://json-schema.org/draft-04/schema#',
      $schema: 'http://json-schema.org/draft-04/schema#',
      description: 'Core schema meta-schema (stub)',
      type: 'object'
    };
    fs.mkdirSync(path.dirname(draft04), { recursive: true });
    fs.writeFileSync(draft04, JSON.stringify(stub, null, 2) + '\n');
  }
} catch (_) {
  // ajv not installed or path inaccessible – skip silently
}
