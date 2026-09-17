# EuroCad

Convertisseur **EUR ↔ CAD** conçu pour une seule chose : donner le prix en 2 secondes,
debout dans un magasin, sans réseau.

👉 **https://benoleblanc.github.io/EuroCad/**

## Installation sur Android

1. Ouvrir le lien ci-dessus dans **Chrome**.
2. Menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »).
3. L'icône apparaît sur l'écran d'accueil et s'ouvre en plein écran, sans barre de navigateur.

Une fois installée, l'app n'a plus besoin du réseau.

## Ce qui la rend rapide

- **Rien à attendre.** Le dernier taux connu est affiché instantanément ; le taux
  du jour se met à jour en arrière-plan. L'interface n'attend jamais le réseau.
- **Rien à configurer.** Paire EUR/CAD figée, aucun menu de devises à ouvrir.
- **Rien à valider.** Le résultat se recalcule à chaque frappe, pas de bouton « convertir ».
- **Le champ est sélectionné à l'ouverture.** Tu tapes, ça remplace le montant précédent.
- **Fonctionne en mode avion**, avec le dernier taux récupéré.

## Fonctions

| | |
|---|---|
| `⇅` | Inverse le sens (EUR→CAD / CAD→EUR). Le choix est mémorisé. |
| `+ − × ÷` | Additionner des articles ou partager une addition : `12+34,90`, `86/4`. Ces touches existent parce que le clavier numérique d'Android n'a pas d'opérateurs. |
| `=` | Replie le calcul en cours : `100+50` puis `=` donne `150`, pour enchaîner `/2`. |
| `⌫` / `C` | Efface un caractère / vide le champ. |
| `carte` | Ajoute 2,5 % pour approcher ce que la carte bancaire facture réellement. |
| `◐` `☾` `☀` | Thème : automatique (suit le téléphone) → sombre → clair. Le choix est mémorisé. |
| Pastille | 🟢 taux du jour · 🟠 quelques jours · ⚪ hors-ligne ou taux de secours |
| **Enregistrer** | Range la conversion dans l'historique, avec la note facultative et le calcul s'il y en a eu. |
| **Historique** | Liste des conversions enregistrées, total par devise, suppression ligne à ligne. |

## Historique

Chaque ligne conserve le montant, le résultat, la note, le calcul et l'horodatage.
Un calcul replié par `=` est reconstitué en entier : taper `100+50`, `=`, `/2`
enregistre `(100+50)/2`, pas `150/2`.

Les totaux sont groupés par devise d'arrivée — additionner des conversions faites
dans les deux sens n'aurait aucun sens.

Le stockage est **local au navigateur** (`localStorage`, plafonné à 200 lignes) :
rien n'est envoyé nulle part, mais rien n'est synchronisé non plus. Vider les
données du site efface l'historique.

La virgule et le point sont acceptés indifféremment.

## Les taux

Source : [Frankfurter](https://www.frankfurter.app/), qui republie les taux de
référence de la **Banque centrale européenne**. Gratuit, sans clé d'API.

Deux limites à connaître :

- La BCE publie **une fois par jour, en semaine** vers 16 h CET. Un taux « de vendredi »
  affiché un dimanche est normal.
- Ce sont des taux de **référence**, pas ceux que facture ta banque. Une carte ajoute
  généralement 2 à 3 % de marge. C'est à ça que sert l'interrupteur `carte` — c'est une
  approximation, pas le taux exact de ton émetteur.

## Développement

```bash
npm install          # playwright, pour les tests et les icônes
npm run serve        # http://localhost:8765
npm test             # 91 vérifications : conversion, parseur, historique, hors-ligne, PWA
npm run build        # dérive la version artifact et vérifie qu'elle rend
npm run icons        # régénère icons/*.png
```

Le site est du statique pur. `index.html` contient le balisage, le CSS et le JS —
volontairement en un seul fichier : une requête HTTP, donc le démarrage à froid le
plus court possible.

| Fichier | Rôle |
|---|---|
| `index.html` | L'app entière (~13 Ko) |
| `sw.js` | Service worker : shell en cache, jamais le taux |
| `manifest.webmanifest` | Métadonnées d'installation |
| `test.mjs` | Suite de tests Playwright |
| `build-artifact.mjs` | Dérive la version « artifact Claude » depuis `index.html` |
| `verify-artifact.mjs` | Ouvre la version dérivée dans un navigateur et vérifie qu'elle rend |

Le calcul en ligne utilise un analyseur en descente récursive écrit à la main —
jamais `eval` ni `new Function`.

## Déploiement

Chaque push sur `claude/currency-converter-app-9g3z21` publie le site via GitHub Actions.

> ⚠️ **Réglage à faire une fois :** Settings → Pages → Source → **GitHub Actions**.
> Le workflow tente bien de l'activer seul (`enablement: true`), mais le
> `GITHUB_TOKEN` n'a pas le droit de créer un site Pages
> (« Resource not accessible by integration ») : ce premier réglage reste manuel.
>
> ⚠️ **Pages sur un dépôt privé demande un plan Pro ou Team.** Sur un compte
> gratuit, il faut rendre le dépôt public — l'app ne contient ni clé ni secret —
> ou l'héberger ailleurs (Netlify, Vercel), qui acceptent les dépôts privés.
