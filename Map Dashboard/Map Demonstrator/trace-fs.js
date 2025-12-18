const fs = require('fs');

const originalReadFileSync = fs.readFileSync;

fs.readFileSync = function patchedRead(path, ...args) {
  try {
    const printable =
      typeof path === 'string'
        ? path
        : path && path.path
        ? path.path
        : path && path.href
        ? path.href
        : path;
    process.stderr.write(`[trace-fs] readFileSync -> ${printable}\n`);
  } catch {
    process.stderr.write('[trace-fs] readFileSync -> <unprintable>\n');
  }
  return originalReadFileSync.call(this, path, ...args);
};


