import { chromium } from 'playwright';

// scale : proportion du canvas occupee par le glyphe.
// La variante maskable reduit le glyphe pour rester dans la zone de securite
// Android (cercle central de 80 %), sinon l'icone adaptative le rogne.
function html(size, scale, radius){
  const f = size * 0.40 * (scale / 0.78);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:transparent}
  .w{width:${size}px;height:${size}px;overflow:hidden;border-radius:${radius}px;
     background:linear-gradient(140deg,#2563eb 0%,#1d4ed8 45%,#0ea5e9 100%);
     display:flex;align-items:center;justify-content:center}
  .g{font-family:"DejaVu Sans",system-ui,sans-serif;font-weight:700;color:#fff;
     font-size:${f}px;line-height:1;letter-spacing:${-f*0.04}px;
     text-shadow:0 ${size*0.012}px ${size*0.03}px rgba(0,0,0,.28)}
  </style></head><body><div class="w"><span class="g">€$</span></div></body></html>`;
}

const targets = [
  { file: 'icons/icon-192.png',          size: 192, scale: 0.78, radiusRatio: 0.22 },
  { file: 'icons/icon-512.png',          size: 512, scale: 0.78, radiusRatio: 0.22 },
  { file: 'icons/icon-maskable-512.png', size: 512, scale: 0.52, radiusRatio: 0    },
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const t of targets) {
  const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
  await page.setContent(html(t.size, t.scale, t.size * t.radiusRatio));
  await page.screenshot({ path: t.file, omitBackground: true });
  await page.close();
  console.log('ecrit', t.file);
}
await browser.close();
