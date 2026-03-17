const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');
const latestPath = path.join(distDir, 'latest.yml');

if (!fs.existsSync(latestPath)) {
  throw new Error('latest.yml was not generated');
}

const latestContents = fs.readFileSync(latestPath, 'utf8');
const match = latestContents.match(/^path:\s*(.+)$/m);
if (!match) {
  throw new Error('latest.yml is missing a path entry');
}

const referencedBasename = match[1]
  .trim()
  .replace(/^['"]|['"]$/g, '')
  .split(/[\\/]/)
  .pop();

const referencedPath = path.join(distDir, referencedBasename);
if (!fs.existsSync(referencedPath)) {
  throw new Error(`latest.yml references missing Windows artifact: ${referencedBasename}`);
}

console.log(`Validated latest.yml -> ${referencedBasename}`);
