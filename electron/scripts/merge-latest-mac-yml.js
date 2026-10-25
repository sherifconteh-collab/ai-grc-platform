'use strict';

// Usage: node scripts/merge-latest-mac-yml.js <output> <feed> [<feed> ...]
const fs = require('fs');
const { mergeFeeds } = require('../lib/updateFeed');

const [output, ...inputs] = process.argv.slice(2);
if (!output || inputs.length < 2) {
  console.error('Usage: merge-latest-mac-yml.js <output> <feed> <feed> [...]');
  process.exit(2);
}
const merged = mergeFeeds(inputs.map((file) => fs.readFileSync(file, 'utf8')));
fs.writeFileSync(output, merged);
console.log(`Wrote ${output} from ${inputs.length} feeds`);
