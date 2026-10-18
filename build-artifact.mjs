// Derive la version « artifact Claude » depuis index.html, pour eviter que les
// deux copies divergent. Le bac a sable des artifacts fournit deja le squelette
// HTML (doctype, head, viewport, reset) et bloque les service workers : on
// retire ce qui ne peut pas y servir.
//
// Le code reseau est CONSERVE : la CSP des artifacts bloque la requete, elle
// echoue proprement et l'app retombe sur sa table de secours, en l'annoncant.
// Le retirer demandait des expressions regulieres fragiles sur la logique
// metier, ce qui a deja casse la page une fois.
import { readFileSync, writeFileSync } from 'node:fs';

let s = readFileSync('index.html', 'utf8');

// 1. Squelette fourni par la plateforme. On GARDE </style> : le supprimer
//    laissait tout le document a l'interieur de la feuille de style.
const before = /^[\s\S]*?<title>/;
if (!before.test(s)) throw new Error('entete avant <title> introuvable');
s = '<title>' + s.replace(before, '');

const headEnd = /<\/style>\s*<\/head>\s*<body>/;
if (!headEnd.test(s)) throw new Error('fin de head introuvable');
s = s.replace(headEnd, '</style>');
s = s.replace(/<\/body>\s*<\/html>\s*$/, '');

// 2. Liens manifest / icones : absents du bac a sable, ils n'y donneraient
//    que des 404. theme-color reste, le code s'en sert.
s = s.replace(/^<link rel="manifest"[^>]*>\n/m, '');
s = s.replace(/^<link rel="(?:apple-touch-)?icon"[^>]*>\n/gm, '');
s = s.replace(/^<meta name="mobile-web-app-capable"[^>]*>\n/m, '');

// 3. Service worker : inoperant dans un cadre isole.
const sw = /\nif\("serviceWorker" in navigator\)\{[\s\S]*?\n\}\n/;
if (!sw.test(s)) throw new Error('enregistrement du service worker introuvable');
s = s.replace(sw, '\n');

// 4. Hauteur : dvh -> % (le squelette applique deja les marges d'ecran).
s = s.split('100dvh').join('100%');

// 5. Les marges d'ecran sont gerees par le squelette de la plateforme.
s = s.replace(/padding:calc\(env\(safe-area-inset-top\) \+ (\d+)px\)[\s\S]*?calc\(env\(safe-area-inset-left\) \+ 16px\);/g,
              'padding:$1px 16px;');
s = s.replace(/padding-top:calc\(env\(safe-area-inset-top\) \+ 8px\);padding-bottom:calc\(env\(safe-area-inset-bottom\) \+ 8px\)/,
              'padding-top:8px;padding-bottom:8px');

const out = process.argv[2] || 'eurocad-artifact.html';
writeFileSync(out, s.replace(/\n{3,}/g, '\n\n'));
console.log('genere :', out, Buffer.byteLength(s), 'octets');
