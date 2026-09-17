// Vérifie qu'un redéploiement atteint réellement un utilisateur déjà installé.
//
// La v1 du service worker servait index.html depuis le cache sans jamais
// consulter le réseau : une fois l'app installée, aucune mise à jour ne pouvait
// plus l'atteindre. Ce test simule exactement ce cas — installation, puis
// modification du site, puis rechargement — et vérifie aussi que le mode
// hors-ligne continue de fonctionner et qu'aucune boucle de rechargement
// n'apparaît.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const DIR  = process.env.SW_TEST_DIR;
const BASE = process.env.SW_TEST_URL;
const MARQUEUR = 'NOUVELLE-VERSION';

let bad = 0;
const ok = (n, got, want) => {
  const pass = String(got) === String(want);
  if (!pass) bad++;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${n} -> ${got}`);
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-CA' });
// Les taux ne doivent pas interférer : seul le cycle de mise à jour est testé.
await ctx.route('**/api.frankfurter.app/**', r => r.abort());
await ctx.route('**/open.er-api.com/**', r => r.abort());
const p = await ctx.newPage();

// 1) Première visite : le service worker s'installe et prend la main.
await p.goto(BASE, { waitUntil: 'networkidle' });
await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10000 });
ok('service worker actif', true, true);

// 2) Le site est redéployé pendant que l'app est installée.
const orig = readFileSync(`${DIR}/index.html`, 'utf8');
writeFileSync(`${DIR}/index.html`, orig.replace(
  '<span id="asof">taux de secours</span>',
  `<span id="asof">taux de secours</span><i id="neuf" hidden>${MARQUEUR}</i>`));

// 3) Au rechargement, la nouvelle page doit arriver — pas celle du cache.
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(500);
ok('la nouvelle version est servie', await p.locator('#neuf').count(), 1);

// 4) Hors ligne, le cache prend le relais — avec la version la plus récente.
await ctx.setOffline(true);
await p.reload({ waitUntil: 'domcontentloaded' });
ok('hors-ligne : app toujours affichee', await p.isVisible('#amt'), true);
ok('hors-ligne : derniere version en cache', await p.locator('#neuf').count(), 1);
await ctx.setOffline(false);

// 5) Le rechargement automatique ne doit jamais boucler.
const avant = await p.evaluate(() => performance.getEntriesByType('navigation').length);
await p.waitForTimeout(1500);
ok('aucune boucle de rechargement',
   await p.evaluate(() => performance.getEntriesByType('navigation').length), avant);

writeFileSync(`${DIR}/index.html`, orig);
await b.close();
console.log(bad ? `\n${bad} ECHEC(S)` : '\nmise a jour : tout passe');
process.exit(bad ? 1 : 0);
