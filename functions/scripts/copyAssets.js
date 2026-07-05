const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

// Copy src/assets -> lib/assets so runtime can load images
const root = path.join(__dirname, '..');
const srcAssets = path.join(root, 'src', 'assets');
const libAssets = path.join(root, 'lib', 'assets');
copyDir(srcAssets, libAssets);
