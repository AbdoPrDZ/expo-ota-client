'use strict';

const fs = require('fs');
const path = require('path');
const yazl = require('yazl');

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

/** Zips the contents of `sourceDir` under `prefix/` (forward slashes, as zip requires). */
function zipDirectory(sourceDir, outFile, prefix = 'dist') {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    let count = 0;

    for (const file of walk(sourceDir)) {
      const relative = path.relative(sourceDir, file).split(path.sep).join('/');
      zip.addFile(file, prefix ? `${prefix}/${relative}` : relative);
      count++;
    }

    zip.end();

    const out = fs.createWriteStream(outFile);
    zip.outputStream.pipe(out).on('close', () => resolve(count)).on('error', reject);
    zip.outputStream.on('error', reject);
  });
}

module.exports = { zipDirectory };
