// Ouvre REELLEMENT la version artifact, enveloppee comme le fait la plateforme
// (doctype + head + body fournis par l'hote). Une verification de syntaxe JS ne
// suffit pas : une balise <style> non fermee passe le controle et donne une page
// blanche.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const body = readFileSync(process.argv[2], 'utf8');
const wrapped = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>:root{color-scheme:light}body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style>
</head><body>${body}</body></html>`;
writeFileSync('/tmp/wrapped.html', wrapped);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let bad = 0;
for (const scheme of ['light', 'dark']) {
  const ctx = await b.newContext({ viewport:{width:412,height:760}, deviceScaleFactor:2,
    isMobile:true, hasTouch:true, locale:'fr-CA', colorScheme:scheme });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file:///tmp/wrapped.html', { waitUntil: 'load' });

  const ok = async (name, got, want) => {
    const pass = String(got) === String(want);
    if (!pass) bad++;
    console.log(`  ${pass ? 'ok  ' : 'FAIL'} [${scheme}] ${name} -> ${got}`);
  };

  // La page rend-elle vraiment quelque chose ?
  await ok('champ visible', await p.isVisible('#amt'), true);
  await ok('resultat visible', await p.isVisible('#res'), true);
  await ok('7 touches', await p.locator('#keys button').count(), 7);
  await ok('bouton historique', await p.isVisible('#histBtn'), true);
  await ok('panneau masque au depart', await p.isHidden('#panel'), true);
  // Le style s'applique-t-il ? (si </style> manquait, tout serait inerte)
  await ok('CSS applique', await p.evaluate(() =>
    getComputedStyle(document.getElementById('res')).textAlign), 'right');
  await ok('fond peint', await p.evaluate(() =>
    getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)'), true);

  // Chemin complet : calcul, repli, enregistrement, historique.
  await p.fill('#amt', '100+50');
  await p.click('#eq');
  await ok('= replie', await p.inputValue('#amt'), '150');
  await p.click('#keys button[data-ins="/"]');
  await p.type('#amt', '2');
  await ok('conversion', (await p.textContent('#res')).trim(), '120,65');
  await p.fill('#note', 'souper');
  await p.click('#save');
  await p.click('#histBtn');
  await ok('panneau ouvert', await p.isVisible('#panel'), true);
  const t = (await p.textContent('#list')).replace(/\s+/g, ' ');
  await ok('calcul complet en historique', t.includes('(100+50)/2'), true);
  await ok('note en historique', t.includes('souper'), true);
  await p.click('#close');
  await p.click('#ac');
  await ok('C vide le champ', await p.inputValue('#amt'), '');

  await ok('aucune erreur JS', errs.length ? errs.join(' | ') : 'aucune', 'aucune');
  if (scheme === 'dark') await p.screenshot({ path: process.argv[3] || '/tmp/artifact.png' });
  await ctx.close();
}
await b.close();
console.log(bad ? `\n${bad} ECHEC(S)` : '\nversion artifact : tout passe');
process.exit(bad ? 1 : 0);
