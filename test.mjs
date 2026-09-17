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
  if (/^Failed to load resource: net::ERR_/.test(t)) return; // coupure reseau voulue
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

console.log('\n== Bouton = (addition puis partage) ==');
// Scenario reel : deux articles a 100 et 50, facture partagee en deux.
await page.fill('#amt', '');
await page.type('#amt', '100+50');
check('100+50 avant =', (await page.textContent('#res')).trim(), fr(150 * RATE));
await page.click('#eq');
check('= replie le total', await page.inputValue('#amt'), '150');
await page.click('#keys button[data-ins="/"]');
await page.type('#amt', '2');
check('puis /2 donne 75', (await page.textContent('#res')).trim(), fr(75 * RATE));
check('focus conserve', await page.evaluate(() => document.activeElement.id), 'amt');

await page.fill('#amt', '');
await page.type('#amt', '10/3');
await page.click('#eq');
check('= arrondit au centime', await page.inputValue('#amt'), '3,33');
await page.fill('#amt', '');
await page.type('#amt', '5/0');
await page.click('#eq');
check('= ne touche pas a une expression invalide', await page.inputValue('#amt'), '5/0');

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
const rateTxt = await page.textContent('#rate');
check('le taux affiche suit la marge', rateTxt.includes((RATE * 1.025).toLocaleString('fr-CA',
  { minimumFractionDigits: 2, maximumFractionDigits: 4 })), true);
check('la marge est signalee', rateTxt.includes('(carte)'), true);
await page.click('.sw');
check('retour au taux brut', (await page.textContent('#rate')).includes('(carte)'), false);

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

console.log('\n== Source de secours pour les taux ==');
// Frankfurter en panne : la seconde source doit prendre le relais.
await ctx.unroute('**/api.frankfurter.app/**');
await ctx.route('**/api.frankfurter.app/**', r => r.abort());
await ctx.route('**/open.er-api.com/**', r => r.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ result: 'success', base_code: 'EUR',
    time_last_update_utc: 'Thu, 17 Sep 2026 00:02:31 +0000', rates: { CAD: 1.8 } }),
}));
await page.evaluate(() => localStorage.removeItem('eurocad.rate'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => document.getElementById('rate').textContent.includes('1,80'),
  null, { timeout: 5000 });
check('la source de secours prend le relais', await type('10'), fr(10 * 1.8));
check('pastille fraiche', await page.getAttribute('#dot', 'class'), 'ok');
check('date de la source de secours', (await page.textContent('#asof')).includes('17 sept'), true);

// Les deux en panne : on garde le dernier taux connu, sans planter.
await ctx.unroute('**/open.er-api.com/**');
await ctx.route('**/open.er-api.com/**', r => r.abort());
await page.reload({ waitUntil: 'networkidle' });
check('dernier taux conserve si tout echoue', await type('10'), fr(10 * 1.8));

await ctx.unroute('**/open.er-api.com/**');

console.log('\n== Hors-ligne (mode avion) ==');
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 8000 });
await ctx.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
check('app affichee hors-ligne', await page.isVisible('#amt'), true);
check('conversion hors-ligne',   await type('10'), fr(10 * 1.8)); // dernier taux connu
await ctx.setOffline(false);

console.log('\n== Bouton C (tout effacer) ==');
await page.fill('#amt', '1234,56');
await page.click('#ac');
check('champ vide apres C', await page.inputValue('#amt'), '');
check('resultat remis a zero', (await page.textContent('#res')).trim(), fr(0));
check('focus conserve apres C', await page.evaluate(() => document.activeElement.id), 'amt');

console.log('\n== Historique ==');
// Les tests precedents ont injecte un taux de 1,70 via l'API simulee. On revient
// au taux de secours pour que les attentes ci-dessous restent sur RATE.
await ctx.unroute('**/api.frankfurter.app/**');
await ctx.route('**/api.frankfurter.app/**', r => r.abort());
await page.evaluate(() => {
  localStorage.removeItem('eurocad.hist');
  localStorage.removeItem('eurocad.rate');
});
await page.reload({ waitUntil: 'networkidle' });
check('taux revenu au secours', await page.evaluate(
  () => document.getElementById('rate').textContent.includes('1,6087')), true);
await page.click('#histBtn');
check('etat vide annonce', (await page.textContent('#list')).includes('Aucune conversion'), true);
await page.click('#close');
check('panneau referme', await page.isHidden('#panel'), true);

// Enregistre un calcul avec note.
await page.fill('#amt', '100+50');
await page.click('#eq');
await page.fill('#note', 'souper');
await page.click('#save');
check('compteur a 1', await page.textContent('#count'), '1');
check('champ note vide apres envoi', await page.inputValue('#note'), '');
check('retour visuel', (await page.textContent('#save')).includes('Enregistr'), true);

// Puis une conversion simple, sans note ni calcul.
await page.fill('#amt', '20');
await page.click('#save');
check('compteur a 2', await page.textContent('#count'), '2');

await page.click('#histBtn');
const items = page.locator('.item');
check('deux lignes', await items.count(), 2);
const recent = (await items.nth(0).textContent()).replace(/\s+/g, ' ');
check('la plus recente en premier', recent.includes('20,00 EUR'), true);
const older = (await items.nth(1).textContent()).replace(/\s+/g, ' ');
check('montant converti conserve', older.includes(fr(150 * RATE) + ' CAD'), true);
check('note conservee', older.includes('souper'), true);
check('calcul conserve malgre le repli par =', older.includes('100+50'), true);
check('pas de calcul sur une saisie simple', recent.includes('100+50'), false);
check('total affiche', (await page.textContent('#totals')).includes(fr(170 * RATE)), true);

// Persistance reelle : rechargement complet.
await page.reload({ waitUntil: 'networkidle' });
check('historique survit au rechargement', await page.textContent('#count'), '2');

// Suppression d'une ligne.
await page.click('#histBtn');
await page.locator('.item').nth(0).locator('.del').click();
check('une ligne supprimee', await page.locator('.item').count(), 1);
check('total recalcule', (await page.textContent('#totals')).includes(fr(150 * RATE)), true);

// Tout effacer (confirmation navigateur).
page.once('dialog', d => d.accept());
await page.click('#wipe');
check('historique vide', (await page.textContent('#list')).includes('Aucune conversion'), true);
check('compteur efface', await page.textContent('#count'), '');
await page.click('#close');

console.log('\n== Calcul enchaine conserve en entier ==');
await page.fill('#amt', '100+50');
await page.click('#eq');
await page.click('#keys button[data-ins="/"]');
await page.type('#amt', '2');
check('resultat du partage', (await page.textContent('#res')).trim(), fr(75 * RATE));
await page.click('#save');
await page.click('#histBtn');
const chain = (await page.locator('.item').nth(0).textContent()).replace(/\s+/g, ' ');
check('expression complete reconstituee', chain.includes('(100+50)/2'), true);
check('montant partage enregistre', chain.includes('75,00 EUR'), true);
page.once('dialog', d => d.accept());
await page.click('#wipe');
await page.click('#close');

console.log('\n== Enregistrement refuse si rien de valide ==');
await page.fill('#amt', '');
await page.click('#save');
check('champ vide non enregistre', await page.textContent('#count'), '');
await page.fill('#amt', '5/0');
await page.click('#save');
check('expression invalide non enregistree', await page.textContent('#count'), '');

console.log('\n== La note est traitee comme du texte, pas du balisage ==');
await page.fill('#amt', '10');
await page.fill('#note', '<img src=x onerror=alert(1)>');
await page.click('#save');
await page.click('#histBtn');
check('aucune balise injectee', await page.locator('#list img').count(), 0);
check('note affichee telle quelle', (await page.textContent('#list')).includes('<img src=x'), true);
page.once('dialog', d => d.accept());
await page.click('#wipe');
await page.click('#close');

console.log('\n== Interrupteur de theme ==');
const rootTheme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const bodyBg    = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const metaTc    = () => page.evaluate(() => document.getElementById('tc').getAttribute('content'));

await page.evaluate(() => localStorage.removeItem('eurocad.theme'));
await page.reload({ waitUntil: 'networkidle' });
check('automatique au depart', await rootTheme(), null);
check('glyphe automatique', (await page.textContent('#themeBtn')).trim(), '\u25D0');

await page.click('#themeBtn');
check('1er appui : sombre', await rootTheme(), 'dark');
check('fond sombre applique', await bodyBg(), 'rgb(14, 16, 20)');
check('barre d\'etat suit', await metaTc(), '#0e1014');

await page.click('#themeBtn');
check('2e appui : clair', await rootTheme(), 'light');
check('fond clair applique', await bodyBg(), 'rgb(233, 237, 244)');
check('barre d\'etat suit', await metaTc(), '#e9edf4');

await page.click('#themeBtn');
check('3e appui : retour automatique', await rootTheme(), null);

// Le choix doit survivre au rechargement.
await page.click('#themeBtn');
await page.reload({ waitUntil: 'networkidle' });
check('choix memorise', await rootTheme(), 'dark');
check('glyphe memorise', (await page.textContent('#themeBtn')).trim(), '\u263E');

// Un hote qui impose son propre theme ne doit pas gagner sur un choix explicite.
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
await page.waitForTimeout(80);
check('choix explicite reimpose', await rootTheme(), 'dark');

// En mode automatique, en revanche, on laisse faire.
await page.click('#themeBtn'); // light
await page.click('#themeBtn'); // auto
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
await page.waitForTimeout(80);
check('mode auto n\'impose rien', await rootTheme(), 'light');
await page.evaluate(() => {
  document.documentElement.removeAttribute('data-theme');
  localStorage.setItem('eurocad.theme', 'dark');
});
await page.reload({ waitUntil: 'networkidle' });

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
