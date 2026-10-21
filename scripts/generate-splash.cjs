// Écrans de lancement iPhone (app ajoutée à l'écran d'accueil) : même fond et même logo que l'écran
// d'ouverture de la page, en clair « Farine » et en sombre « Meule ». Sans eux, iOS affiche un écran gris
// le temps que la page se charge. À relancer seulement si le logo, les couleurs ou les iPhone changent :
//   node scripts/generate-splash.cjs   (écrit splash/*.png et affiche les balises à mettre dans index.html)
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'splash');
// Largeur × hauteur en points CSS, densité : iPhone 8/SE → iPhone 17 Pro Max.
const devices = [[375,667,2],[414,896,2],[375,812,3],[414,896,3],[390,844,3],[428,926,3],[393,852,3],[430,932,3],[402,874,3],[420,912,3],[440,956,3]];
const themes = {
  light: { bg:'#F6F2E8', sq:'#17261F', ma:'#F6F2E8', md:'#E3A82B' },
  dark:  { bg:'#0E1713', sq:'#F3EEE2', ma:'#0E1713', md:'#C98A12' }
};
// Logo de 112 points, placé comme dans l'écran d'ouverture (au-dessus du texte « Connexion… »).
const logo = c => `<rect width="28" height="28" rx="7.5" fill="${c.sq}"/>
  <circle cx="14" cy="14" r="9.4" fill="none" stroke="${c.ma}" stroke-opacity=".2" stroke-width="2.4"/>
  <circle cx="14" cy="14" r="9.4" fill="none" stroke="${c.md}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="22 59.1" transform="rotate(-90 14 14)"/>
  <g transform="rotate(30 14 14)"><path d="M14 6.2C14.9 7.4 17.2 10 17.2 13.7 17.2 16.9 15.4 19.6 14 21.8 12.6 19.6 10.8 16.9 10.8 13.7 10.8 10 13.1 7.4 14 6.2Z" fill="${c.ma}"/>
  <path d="M14 9.6c-.4 2.8-.4 5.8 0 8.6" fill="none" stroke="${c.sq}" stroke-width="1" stroke-linecap="round"/></g>`;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const tags = [];
  for (const [w, h, dpr] of devices) for (const [name, c] of Object.entries(themes)) {
    const W = w * dpr, H = h * dpr, size = 112 * dpr, x = (W - size) / 2, y = H / 2 - size / 2 - 19 * dpr;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="${c.bg}"/>
  <g transform="translate(${x} ${y}) scale(${size / 28})">${logo(c)}</g></svg>`;
    const file = `splash/${name}-${W}x${H}.png`;
    await sharp(Buffer.from(svg)).png({ palette: true, compressionLevel: 9 }).toFile(path.join(root, file));
    tags.push(`  <link rel="apple-touch-startup-image" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait) and (prefers-color-scheme: ${name})" href="${file}?v=20261021-r1" />`);
  }
  console.log(tags.join('\n'));
})();
