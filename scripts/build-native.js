const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

const assets = [
  'index.html',
  'app.js',
  'manifest.json',
  'sw.js',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png'
];

function copyFile(name) {
  const source = path.join(root, name);
  const target = path.join(dist, name);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing required native asset: ${name}`);
  }
  if (name === 'index.html') {
    const html = fs.readFileSync(source, 'utf8');
    const nativeHtml = html.includes('src="capacitor.js"')
      ? html
      : html.replace('<script src="app.js"></script>', '<script src="capacitor.js"></script>\n<script src="app.js"></script>');
    fs.writeFileSync(target, nativeHtml);
    return;
  }
  fs.copyFileSync(source, target);
}

function ensureCleanDist() {
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
}

ensureCleanDist();
assets.forEach(copyFile);

const marker = {
  app: 'Perq',
  generatedAt: new Date().toISOString(),
  source: 'scripts/build-native.js'
};
fs.writeFileSync(path.join(dist, 'native-build.json'), JSON.stringify(marker, null, 2));

console.log(`Built native web bundle with ${assets.length} files in ${path.relative(root, dist)}/`);
