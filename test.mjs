import { chromium } from 'playwright';

const BASE = 'http://localhost:8765/';
const RATE = 1.6087; // taux de secours embarque, utilise quand le reseau est coupe
let pass = 0, fail = 0;
function check(name, got, want){
  if (String(got) === String(want)) { pass++; console.log(`  ok   ${name}  -> ${got}`); }
  else { fail++; console.log(`  FAIL ${name}  attendu ${want}, obtenu ${got}`); }
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({
  viewport: { width: 412, height: 915 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, locale: 'fr-CA',
});

// Par defaut on coupe l'API : les tests s'appuient sur le taux de secours, donc deterministes.
await ctx.route('**/api.frankfurter.app/**', r => r.abort());

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/net::ERR_(FAILED|INTERNET_DISCONNECTED|ABORTED)/.test(t)) return; // coupure reseau voulue
  errors.push(t);
});

async function type(v){
  await page.fill('#amt', '');
  await page.type('#amt', v);
  return (await page.textContent('#res')).trim();
}
const fr = n => n.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

await page.goto(BASE, { waitUntil: 'networkidle' });

console.log('\n== Conversion et saisie ==');
check('34,90 (virgule)',   await type('34,90'), fr(34.90 * RATE));
check('34.90 (point)',     await type('34.90'), fr(34.90 * RATE));
check('addition 12+34,90', await type('12+34,90'), fr(46.90 * RATE));
check('produit 3*12,50',   await type('3*12,50'), fr(37.50 * RATE));
check('division 60/4',     await type('60/4'), fr(15 * RATE));
check('parentheses (2+3)*10', await type('(2+3)*10'), fr(50 * RATE));
check('parenthese non fermee', await type('(2+3'), fr(5 * RATE));

console.log('\n== Cas limites ==');
check('champ vide',           await type(''), fr(0));
check('operateur en attente', await type('12+'), fr(12 * RATE));
check('virgule seule',        await type('12,'), fr(12 * RATE));
check('division par zero',    await type('5/0'), '—');
check('texte refuse',         await type('abc'), '—');
check('point multiple',       await type('1.2.3'), '—');

console.log('\n== Barre d\'operateurs (clavier decimal Android) ==');
await page.fill('#amt', '');
await page.type('#amt', '12');
await page.click('#keys button[data-ins="+"]');
await page.type('#amt', '8');
check('saisie via boutons', (await page.textContent('#res')).trim(), fr(20 * RATE));
check('champ garde le focus', await page.evaluate(() => document.activeElement.id), 'amt');
await page.click('#clr');
check('retour arriere', (await page.textContent('#res')).trim(), fr(12 * RATE));

console.log('\n== Selection au focus (retaper sans effacer) ==');
await page.fill('#amt', '1234,56');
await page.evaluate(() => document.getElementById('amt').blur());
await page.click('#amt');
check('montant selectionne au focus', await page.evaluate(() => {
  const a = document.getElementById('amt');
  return a.selectionStart === 0 && a.selectionEnd === a.value.length;
}), true);
await page.keyboard.type('20');
check('la frappe remplace tout', (await page.textContent('#res')).trim(), fr(20 * RATE));

console.log('\n== Repere de calcul mental ==');
check('repere affiche sur taux non rond', (await page.textContent('#rate')).includes('≈ ×1,6'), true);

console.log('\n== Inversion du sens ==');
await page.fill('#amt', '');
await page.type('#amt', '100');
await page.click('#swap');
check('devise source', await page.textContent('#curFrom'), 'CAD');
check('devise cible',  await page.textContent('#curTo'), 'EUR');
check('100 CAD -> EUR', (await page.textContent('#res')).trim(), fr(100 / RATE));

console.log('\n== Marge carte ==');
await page.click('#swap'); // retour EUR -> CAD
await page.click('.sw');
check('100 EUR + 2,5 %', (await page.textContent('#res')).trim(), fr(100 * RATE * 1.025));
await page.click('.sw');

console.log('\n== Persistance ==');
await page.click('#swap');
await page.reload({ waitUntil: 'networkidle' });
check('sens memorise apres rechargement', await page.textContent('#curFrom'), 'CAD');
await page.click('#swap');

console.log('\n== Mise a jour du taux depuis l\'API ==');
await ctx.unroute('**/api.frankfurter.app/**');
await ctx.route('**/api.frankfurter.app/**', r => r.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ amount: 1, base: 'EUR', date: '2026-09-17', rates: { CAD: 1.7000 } }),
}));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => document.getElementById('rate').textContent.includes('1,70'), null, { timeout: 5000 });
check('taux rafraichi', await type('10'), fr(10 * 1.70));
check('pastille fraiche', await page.getAttribute('#dot', 'class'), 'ok');
check('date affichee', (await page.textContent('#asof')).includes('17 sept'), 'true');
check('repere masque sur taux rond', (await page.textContent('#rate')).includes('≈'), false);

console.log('\n== Hors-ligne (mode avion) ==');
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 8000 });
await ctx.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
check('app affichee hors-ligne', await page.isVisible('#amt'), true);
check('conversion hors-ligne',   await type('10'), fr(10 * 1.70)); // dernier taux connu
await ctx.setOffline(false);

console.log('\n== PWA ==');
const man = await page.evaluate(async () => {
  const r = await fetch('manifest.webmanifest');
  return { ok: r.ok, j: await r.json() };
});
check('manifest servi', man.ok, true);
check('manifest start_url relatif', man.j.start_url, '.');
check('icone maskable presente', man.j.icons.some(i => i.purpose === 'maskable'), true);
for (const i of man.j.icons) {
  const st = await page.evaluate(u => fetch(u).then(r => r.status), i.src);
  check(`icone ${i.src}`, st, 200);
}

console.log('\n== Erreurs console ==');
check('aucune erreur JS', errors.length ? errors.join(' | ') : 'aucune', 'aucune');

await page.fill('#amt', '34,90');
await page.screenshot({ path: 'screenshot.png' });

await browser.close();
console.log(`\n${pass} reussis, ${fail} echecs`);
process.exit(fail ? 1 : 0);
