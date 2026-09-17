// Derive la version « artifact Claude » depuis index.html, pour eviter que les
// deux copies divergent. Le bac a sable des artifacts fournit deja le squelette
// HTML (doctype, head, viewport, reset) et bloque les service workers ainsi que
// les appels reseau sortants : on retire donc ce qui ne peut pas y servir.
import { readFileSync, writeFileSync } from 'node:fs';

let s = readFileSync('index.html', 'utf8');

const cut = (re, label) => {
  if (!re.test(s)) throw new Error('motif introuvable : ' + label);
  s = s.replace(re, '');
};

// 1. Squelette fourni par la plateforme.
cut(/^[\s\S]*?<title>/, 'entete avant <title>');
s = '<title>' + s;
// On retire </head><body> mais on GARDE </style> : le supprimer laissait tout
// le document a l'interieur de la feuille de style (page blanche).
s = s.replace(/<\/style>\s*<\/head>\s*<body>/, '</style>');
s = s.replace(/<\/body>\s*<\/html>\s*$/, '');

// 2. Le head retire emportait balises manifest / icones / theme-color : rien a faire.
// 3. Service worker : inoperant dans un cadre isole.
cut(/\nif\("serviceWorker" in navigator\)\{[\s\S]*?\n\}\n/, 'enregistrement du service worker');

// 4. Reseau : la CSP des artifacts bloque fetch vers l'API. On coupe l'appel et
//    on laisse le taux de secours, que l'interface signale deja en gris.
cut(/\/\* ---- Taux frais[\s\S]*?\n\}\);\n/, 'bloc de rafraichissement');
s = s.replace(/^refresh\(\);$/m, '');

// 5. Hauteur : dvh -> % (le squelette applique deja les marges d'ecran).
s = s.split('100dvh').join('100%');

// 6. Les marges d'ecran sont gerees par le squelette de la plateforme.
s = s.replace(/padding:calc\(env\(safe-area-inset-top\) \+ (\d+)px\)[\s\S]*?calc\(env\(safe-area-inset-left\) \+ 16px\);/g,
              'padding:$1px 16px;');
s = s.replace(/padding-top:calc\(env\(safe-area-inset-top\) \+ 8px\);padding-bottom:calc\(env\(safe-area-inset-bottom\) \+ 8px\)/,
              'padding-top:8px;padding-bottom:8px');

writeFileSync(process.argv[2] || 'eurocad-artifact.html', s.replace(/\n{3,}/g, '\n\n'));
console.log('genere :', (process.argv[2] || 'eurocad-artifact.html'), Buffer.byteLength(s), 'octets');
