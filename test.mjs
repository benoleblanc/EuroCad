import { chromium } from 'playwright';

const BASE = 'http://localhost:8765/';
// Table simulee : l'API reelle est inatteignable depuis le bac a sable, dont le
// proxy bloque ces domaines. Les valeurs sont rondes pour des attentes lisibles.
const RATES = { EUR:1, CAD:1.6, USD:1.1, GBP:0.8, CHF:0.9, JPY:170, MXN:20, THB:37, AUD:1.75 };
const ER_API = {
  result:'success', base_code:'EUR',
  time_last_update_utc:'Sat, 18 Oct 2026 00:02:31 +0000', rates: RATES,
};

let pass = 0, fail = 0;
function check(name, got, want){
  if (String(got) === String(want)) { pass++; console.log(`  ok   ${name}  -> ${got}`); }
  else { fail++; console.log(`  FAIL ${name}  attendu ${want}, obtenu ${got}`); }
}
const fr = (n, d = 2) => n.toLocaleString('fr-CA', { minimumFractionDigits:d, maximumFractionDigits:d });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({
  viewport:{ width:412, height:915 }, deviceScaleFactor:2,
  isMobile:true, hasTouch:true, locale:'fr-CA',
});
const okApi = r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(ER_API) });
await ctx.route('**/open.er-api.com/**', okApi);
await ctx.route('**/api.frankfurter.app/**', r => r.abort());

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/^Failed to load resource: net::ERR_/.test(t)) return;  // coupure reseau voulue
  errors.push(t);
});

const type = async v => { await page.fill('#amt',''); await page.type('#amt', v); return (await page.textContent('#res')).trim(); };
const reset = async (extra = {}) => {
  await page.evaluate(o => { localStorage.clear(); for (const k in o) localStorage.setItem(k, o[k]); }, extra);
  await page.reload({ waitUntil:'networkidle' });
  await page.waitForFunction(() => document.getElementById('asof').textContent.startsWith('taux du'), null, { timeout:6000 });
};
const pickCur = async (which, code) => {
  await page.click(which === 'from' ? '#curFrom' : '#curTo');
  await page.fill('#search', code);
  await page.locator(`.curItem[data-code="${code}"]`).first().click();
};

await page.goto(BASE, { waitUntil:'networkidle' });
await reset();

console.log('\n== Conversion et saisie ==');
check('table de taux chargee',  (await page.textContent('#asof')).includes('18 oct'), true);
check('100 EUR -> CAD',         await type('100'), fr(160));
check('34,90 (virgule)',        await type('34,90'), fr(34.90 * 1.6));
check('34.90 (point)',          await type('34.90'), fr(34.90 * 1.6));
check('addition 12+34,90',      await type('12+34,90'), fr(46.90 * 1.6));
check('produit 3*12,50',        await type('3*12,50'), fr(37.50 * 1.6));
check('parenthese non fermee',  await type('(2+3'), fr(5 * 1.6));

console.log('\n== Cas limites ==');
check('champ vide',           await type(''), fr(0));
check('operateur en attente', await type('12+'), fr(12 * 1.6));
check('division par zero',    await type('5/0'), '—');
check('texte refuse',         await type('abc'), '—');
check('point multiple',       await type('1.2.3'), '—');

console.log('\n== Touches = / C ==');
await page.fill('#amt','100+50');
await page.click('#eq');
check('= replie le total', await page.inputValue('#amt'), '150');
await page.click('#keys button[data-ins="/"]');
await page.type('#amt','2');
check('puis /2', (await page.textContent('#res')).trim(), fr(75 * 1.6));
await page.click('#ac');
check('C vide le champ', await page.inputValue('#amt'), '');
check('focus conserve', await page.evaluate(() => document.activeElement.id), 'amt');

console.log('\n== Selecteur de devises ==');
await page.click('#curTo');
check('selecteur ouvert',    await page.isVisible('#pick'), true);
check('toutes les devises',  await page.locator('.curItem').count(), Object.keys(RATES).length);
await page.fill('#search','mex');
check('recherche par nom',   await page.locator('.curItem').count(), 1);
check('code trouve',         await page.locator('.curItem b').first().textContent(), 'MXN');
await page.fill('#search','jp');
check('recherche par code',  await page.locator('.curItem b').first().textContent(), 'JPY');
await page.locator('.curItem[data-code="JPY"]').first().click();
check('selecteur referme',   await page.isHidden('#pick'), true);
check('devise d\'arrivee',   await page.textContent('#curTo'), 'JPY');
check('100 EUR -> JPY',      await type('100'), fr(100 * 170, 0));  // le yen n'a pas de decimales
await pickCur('from','USD');
check('USD -> JPY', await type('11'), fr(11 / 1.1 * 170, 0));
await page.click('#curFrom');
check('recentes epinglees', (await page.textContent('#curList')).includes('Récentes'), true);
await page.click('#pickClose');

// Choisir pour « from » la devise deja en « to » doit echanger, pas dupliquer.
await pickCur('from','JPY');
check('paire identique evitee (from)', await page.textContent('#curTo'), 'USD');
check('nouvelle devise de depart',     await page.textContent('#curFrom'), 'JPY');

console.log('\n== Inversion et marge carte ==');
await reset();
await page.click('#swap');
check('sens inverse', (await page.textContent('#curFrom')) + '->' + (await page.textContent('#curTo')), 'CAD->EUR');
check('100 CAD -> EUR', await type('100'), fr(100 / 1.6));
await page.click('#swap');
await page.click('.sw');
check('100 EUR + 2,5 %', await type('100'), fr(100 * 1.6 * 1.025));
check('taux affiche la marge', (await page.textContent('#rate')).includes('(carte)'), true);
await page.click('.sw');

console.log('\n== Persistance de la paire ==');
await pickCur('to','GBP');
await page.reload({ waitUntil:'networkidle' });
check('paire memorisee', await page.textContent('#curTo'), 'GBP');

console.log('\n== Migration depuis l\'ancien format ==');
await reset({
  'eurocad.dir':  'CADEUR',
  'eurocad.rate': JSON.stringify({ rate:1.6087, date:'2026-09-20', fetched: Date.now() - 864e5 }),
  'eurocad.hist': JSON.stringify([
    { ts: Date.parse('2026-09-20T12:00:00'), from:'EUR', to:'CAD', amount:34.9, result:56.14, expr:'', fee:false, note:'musée' },
    { ts: Date.parse('2026-09-20T19:30:00'), from:'EUR', to:'CAD', amount:75,   result:120.65, expr:'(100+50)/2', fee:true, note:'souper' },
  ]),
});
check('sens ancien converti', (await page.textContent('#curFrom')) + '->' + (await page.textContent('#curTo')), 'CAD->EUR');
check('historique conserve', await page.textContent('#count'), '2');
await page.click('#histBtn');
check('totaux recalcules', (await page.textContent('#totals')).includes(fr(176.79) + ' CAD'), true);
check('calcul conserve',   (await page.textContent('#list')).includes('(100+50)/2'), true);
check('note conservee',    (await page.textContent('#list')).includes('souper'), true);
await page.click('#close');

console.log('\n== Historique : enregistrement ==');
await reset();
await page.fill('#amt','100+50');
await page.click('#eq');
await page.fill('#note','souper partagé');
await page.click('#save');
check('compteur a 1',        await page.textContent('#count'), '1');
check('note videe',          await page.inputValue('#note'), '');
await page.fill('#amt','20');
await page.click('#save');
check('compteur a 2',        await page.textContent('#count'), '2');
await page.click('#histBtn');
check('deux lignes',         await page.locator('.item').count(), 2);
const older = (await page.locator('.item').nth(1).textContent()).replace(/\s+/g,' ');
check('calcul complet',      older.includes('100+50'), true);
check('montant converti',    older.includes(fr(150 * 1.6) + ' CAD'), true);

console.log('\n== Totaux : reference + par devise ==');
check('total en reference', (await page.textContent('#totals')).includes('Total ' + fr(170 * 1.6) + ' CAD'), true);
check('detail en EUR',      (await page.textContent('#totals')).includes(fr(170) + ' EUR'), true);

console.log('\n== Budget ==');
page.once('dialog', d => d.accept('500'));
await page.click('#setBudget');
let b = (await page.textContent('#budget')).replace(/\s+/g,' ');
check('budget enregistre',  b.includes('Budget ' + fr(500) + ' CAD'), true);
check('reste calcule',      b.includes(fr(500 - 170 * 1.6) + ' CAD restants'), true);
page.once('dialog', d => d.accept('100'));
await page.click('#setBudget');
b = (await page.textContent('#budget')).replace(/\s+/g,' ');
check('depassement signale', b.includes(fr(170 * 1.6 - 100) + ' CAD de dépassement'), true);
check('barre saturee',       await page.evaluate(() => document.getElementById('barFill').className), 'over');
page.once('dialog', d => d.accept(''));
await page.click('#setBudget');
check('budget retire', (await page.textContent('#budget')).includes('Aucun budget'), true);

console.log('\n== Marge carte selon le sens ==');
// Partir de la devise de reference : on recoit MOINS a l'etranger.
await reset();
await page.click('.sw');
await pickCur('to','CHF');
await pickCur('from','CAD');          // sinon on resterait sur EUR->CHF
check('depart en devise de reference', await page.textContent('#curFrom'), 'CAD');
check('CAD->CHF : marge en moins', await type('100'), fr(100 / 1.6 * 0.9 / 1.025));
await pickCur('from','CHF'); await pickCur('to','CAD');
check('CHF->CAD : marge en plus', await type('100'), fr(100 / 0.9 * 1.6 * 1.025));
await pickCur('from','EUR'); await pickCur('to','CHF');
check('EUR->CHF : marge en plus', await type('100'), fr(100 * 0.9 * 1.025));
await page.click('.sw');

console.log('\n== Detail par devise etrangere, des deux cotes ==');
// Le scenario de Ben : des achats en EUR, et des conversions partant du CAD.
await reset({ 'eurocad.hist': JSON.stringify([
  { ts: Date.parse('2026-10-18T07:45:00'), from:'CAD', to:'CHF', amount:35,  result:20.91,  home:'CAD', homeAmount:35,  expr:'', fee:true,  note:'dîner' },
  { ts: Date.parse('2026-10-18T07:38:00'), from:'CAD', to:'GBP', amount:258, result:140.36, home:'CAD', homeAmount:258, expr:'', fee:true,  note:'bateau' },
  { ts: Date.parse('2026-10-18T06:39:00'), from:'EUR', to:'CAD', amount:56,  result:91.26,  home:'CAD', homeAmount:91.26, expr:'', fee:true,  note:'café' },
])});
await page.click('#histBtn');
const t = (await page.textContent('#totals')).replace(/\s+/g,' ');
check('devise de depart etrangere', t.includes('dont ' + fr(56) + ' EUR'), true);
check('devise d\'arrivee etrangere (CHF)', t.includes('dont ' + fr(20.91) + ' CHF'), true);
check('devise d\'arrivee etrangere (GBP)', t.includes('dont ' + fr(140.36) + ' GBP'), true);
check('trois devises listees', await page.locator('.total').count(), 4);

// Le total ne doit PAS gonfler les montants deja en devise de reference.
check('total sans marge indue', t.includes('Total ' + fr(35 + 258 + 91.26) + ' CAD'), true);
check('sous-total du jour', (await page.locator('.grp').first().textContent()).includes(fr(384.26) + ' CAD'), true);
console.log('\n== Vues jour / semaine / mois / voyage ==');
await page.click('#close');
await reset({ 'eurocad.hist': JSON.stringify([
  { ts: Date.parse('2026-10-15T10:00:00'), from:'EUR', to:'CAD', amount:10, result:16, home:'CAD', homeAmount:16, expr:'', fee:false, note:'a' },
  { ts: Date.parse('2026-10-14T10:00:00'), from:'EUR', to:'CAD', amount:20, result:32, home:'CAD', homeAmount:32, expr:'', fee:false, note:'b' },
  { ts: Date.parse('2026-10-06T10:00:00'), from:'EUR', to:'CAD', amount:30, result:48, home:'CAD', homeAmount:48, expr:'', fee:false, note:'c' },
  { ts: Date.parse('2026-09-28T10:00:00'), from:'EUR', to:'CAD', amount:40, result:64, home:'CAD', homeAmount:64, expr:'', fee:false, note:'d' },
])});
await page.click('#histBtn');
check('vue jour : 4 groupes',    await page.locator('.grp').count(), 4);
await page.click('#views button[data-view="week"]');
check('vue semaine : 3 groupes', await page.locator('.grp').count(), 3);
check('sous-total semaine',      (await page.locator('.grp').first().textContent()).includes(fr(48) + ' CAD'), true);
await page.click('#views button[data-view="month"]');
check('vue mois : 2 groupes',    await page.locator('.grp').count(), 2);
check('libelle du mois',         (await page.locator('.grp').first().textContent()).includes('octobre 2026'), true);
check('sous-total octobre',      (await page.locator('.grp').first().textContent()).includes(fr(96) + ' CAD'), true);
await page.click('#views button[data-view="trip"]');
check('vue voyage : 1 groupe',   await page.locator('.grp').count(), 1);
check('total du voyage',         (await page.locator('.grp').first().textContent()).includes(fr(160) + ' CAD'), true);
await page.reload({ waitUntil:'networkidle' });
await page.click('#histBtn');
check('vue memorisee', await page.locator('#views button.on').textContent(), 'Voyage');

console.log('\n== Suppression et purge ==');
await page.click('#views button[data-view="day"]');
await page.locator('.item').first().locator('.del').click();
check('ligne supprimee', await page.locator('.item').count(), 3);
page.once('dialog', d => d.accept());
await page.click('#wipe');
check('historique vide', (await page.textContent('#list')).includes('Aucune conversion'), true);
check('compteur efface', await page.textContent('#count'), '');

console.log('\n== La note est traitee comme du texte ==');
await page.click('#close');
await page.fill('#amt','10');
await page.fill('#note','<img src=x onerror=alert(1)>');
await page.click('#save');
await page.click('#histBtn');
check('aucune balise injectee',   await page.locator('#list img').count(), 0);
check('note affichee telle quelle', (await page.textContent('#list')).includes('<img src=x'), true);

console.log('\n== Impression ==');
await page.emulateMedia({ media:'print' });
check('en-tete de document visible', await page.isVisible('#printHead'), true);
check('titre imprime',              (await page.textContent('#printHead h1')), 'Historique et suivi du budget de voyage');
check('boutons masques',            await page.isHidden('#pfoot'), true);
check('selecteur de vue masque',    await page.isHidden('#views'), true);
check('bouton fermer masque',       await page.isHidden('#close'), true);
check('liste deroulante liberee',   await page.evaluate(() => getComputedStyle(document.getElementById('list')).overflowY), 'visible');
check('ecran principal masque',     await page.isHidden('main'), true);
await page.emulateMedia({ media:'screen' });
page.once('dialog', d => d.accept());
await page.click('#wipe');
await page.click('#close');

console.log('\n== Sources de taux ==');
await ctx.unroute('**/open.er-api.com/**');
await ctx.route('**/open.er-api.com/**', r => r.abort());
await ctx.unroute('**/api.frankfurter.app/**');
await ctx.route('**/api.frankfurter.app/**', r => r.fulfill({ status:200, contentType:'application/json',
  body: JSON.stringify({ amount:1, base:'EUR', date:'2026-10-18', rates:{ CAD:1.7, USD:1.2 } }) }));
await page.evaluate(() => { localStorage.removeItem('eurocad.rates'); localStorage.removeItem('eurocad.rate'); });
await page.reload({ waitUntil:'networkidle' });
await page.waitForFunction(() => document.getElementById('rate').textContent.includes('1,70'), null, { timeout:6000 });
check('source de secours utilisee', await type('10'), fr(17));

await ctx.unroute('**/api.frankfurter.app/**');
await ctx.route('**/api.frankfurter.app/**', r => r.abort());
await page.evaluate(() => { localStorage.removeItem('eurocad.rates'); localStorage.removeItem('eurocad.rate'); });
await page.reload({ waitUntil:'networkidle' });
check('repli sur le taux de secours', (await page.textContent('#asof')).includes('taux de secours'), true);
check('EUR/CAD reste convertible',    await type('10'), fr(16.087));
// Une paire memorisee en ligne (EUR->MXN) alors que seule la table de secours
// est disponible : l'interface ne propose plus MXN, mais la paire est stockee.
await page.evaluate(() => {
  localStorage.removeItem('eurocad.rates');
  // La paire n'est lue que si les DEUX cles existent : sinon l'app retombe sur
  // la migration de l'ancien sens unique.
  localStorage.setItem('eurocad.from', 'EUR');
  localStorage.setItem('eurocad.to', 'MXN');
});
await page.reload({ waitUntil:'networkidle' });
check('paire devenue inconvertible', await type('10'), 'taux manquant');
check('le probleme est nomme', (await page.textContent('#rate')).includes('indisponible'), true);
await page.click('#curTo');
check('selecteur limite au cache', await page.locator('.curItem').count(), 2);
check('explication affichee', (await page.textContent('#curList')).includes('Connecte-toi une fois'), true);
await page.click('#pickClose');
await page.evaluate(() => localStorage.setItem('eurocad.to', 'CAD'));

console.log('\n== Hors-ligne ==');
await ctx.unroute('**/open.er-api.com/**');
await ctx.route('**/open.er-api.com/**', okApi);
await reset();
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout:10000 });
await ctx.setOffline(true);
await page.reload({ waitUntil:'domcontentloaded' });
check('app affichee hors-ligne', await page.isVisible('#amt'), true);
check('conversion hors-ligne',   await type('10'), fr(16));
await page.click('#curTo');
check('toutes les devises hors-ligne', await page.locator('.curItem').count(), Object.keys(RATES).length);
await page.click('#pickClose');
await ctx.setOffline(false);

console.log('\n== Theme ==');
await page.evaluate(() => localStorage.removeItem('eurocad.theme'));
await page.reload({ waitUntil:'networkidle' });
const rootTheme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
check('automatique au depart', await rootTheme(), null);
await page.click('#themeBtn');
check('1er appui : sombre', await rootTheme(), 'dark');
check('fond sombre',        await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(14, 16, 20)');
await page.click('#themeBtn');
check('2e appui : clair',   await rootTheme(), 'light');
await page.click('#themeBtn');
check('3e appui : auto',    await rootTheme(), null);

console.log('\n== Identite de l\'app ==');
check('titre de la page',        await page.title(), 'BonVoyage$');
check('nom sur l\'ecran d\'accueil', (await page.evaluate(async () =>
  (await (await fetch('manifest.webmanifest')).json()).short_name)), 'BonVoyage$');
// Les cles de stockage gardent le prefixe d'origine : les renommer effacerait
// les historiques deja enregistres sur les appareils.
check('cles de stockage inchangees', await page.evaluate(() =>
  Object.keys(localStorage).every(k => k.indexOf('eurocad.') === 0)), true);

// Ce que lit un outil qui n'execute pas le JavaScript : titre de page, nombre
// de devises, et apercu de lien. Sans ca, la page passe pour une calculatrice
// EUR/CAD, puisque ce sont les seuls codes presents dans le HTML brut.
const h1 = await page.locator('h1.sr').textContent();
check('titre de page present',   h1.includes('BonVoyage$'), true);
check('titre mentionne 160 devises', h1.includes('160 devises'), true);
// isVisible() de Playwright considere un element de 1x1 px comme visible : on
// verifie donc qu'il n'occupe aucune place et ne decale rien a l'ecran.
const boxH1 = await page.locator('h1.sr').boundingBox();
check('titre sans emprise visuelle', boxH1.width <= 1 && boxH1.height <= 1, true);
check('mise en page intacte', await page.evaluate(() =>
  document.getElementById('amt').getBoundingClientRect().width > 150), true);
const meta = n => page.evaluate(s => {
  const e = document.querySelector(s);
  return e ? e.getAttribute('content') : null;
}, n);
check('description mentionne 160', (await meta('meta[name="description"]')).includes('160 devises'), true);
check('apercu de lien : titre',    (await meta('meta[property="og:title"]')).includes('BonVoyage$'), true);
check('apercu de lien : image',    (await meta('meta[property="og:image"]')).endsWith('icons/icon-512.png'), true);
check('apercu de lien : adresse',  await meta('meta[property="og:url"]'), 'https://benoleblanc.github.io/EuroCad/');
check('message sans JavaScript',   (await page.locator('noscript').innerHTML()).includes('160 devises'), true);

console.log('\n== PWA ==');
const man = await page.evaluate(async () => { const r = await fetch('manifest.webmanifest'); return { ok:r.ok, j: await r.json() }; });
check('manifest servi',           man.ok, true);
check('start_url relatif',        man.j.start_url, '.');
check('icone maskable presente',  man.j.icons.some(i => i.purpose === 'maskable'), true);
for (const i of man.j.icons) {
  check(`icone ${i.src}`, await page.evaluate(u => fetch(u).then(r => r.status), i.src), 200);
}

console.log('\n== Erreurs console ==');
check('aucune erreur JS', errors.length ? errors.join(' | ') : 'aucune', 'aucune');

await browser.close();
console.log(`\n${pass} reussis, ${fail} echecs`);
process.exit(fail ? 1 : 0);
