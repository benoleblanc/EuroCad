# BonVoyage$

Convertisseur **multi-devises** et suivi de budget de voyage, conçu pour donner
le prix en 2 secondes, debout dans un magasin, sans réseau.

👉 **https://benoleblanc.github.io/EuroCad/**

> Le dépôt s'appelle toujours `EuroCad`, nom d'origine du projet quand il ne
> convertissait qu'entre euro et dollar canadien. L'app a été renommée
> `BonVoyage$` une fois les ~160 devises ajoutées ; le dépôt, lui, a gardé son
> nom pour ne pas déplacer l'adresse du site ni casser les installations
> existantes. Les clés de stockage local restent `eurocad.*` pour la même
> raison : les renommer effacerait les historiques déjà enregistrés.

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

En touchant la ligne du taux, en haut, on force un essai de mise à jour et on
affiche la version réellement servie — utile pour lever un doute quand le cache
est en cause.

## Fonctions

| | |
|---|---|
| `EUR` `CAD` | Touche un code de devise pour en changer : recherche par code ou par nom, devises récentes épinglées en haut. ~160 devises. |
| `⇅` | Inverse le sens. La paire est mémorisée. |
| `+ − × ÷` | Additionner des articles ou partager une addition : `12+34,90`, `86/4`. Ces touches existent parce que le clavier numérique d'Android n'a pas d'opérateurs. |
| `=` | Replie le calcul en cours : `100+50` puis `=` donne `150`, pour enchaîner `/2`. |
| `⌫` / `C` | Efface un caractère / vide le champ. |
| `↗` | Partage l'application : sélecteur natif d'Android, ou copie du lien à défaut. |
| `carte` | Approche ce que la carte bancaire facture réellement : 2,5 % de marge sur le change. En partant de sa propre devise on reçoit moins à l'étranger ; en y revenant, la dépense coûte plus cher. |
| `◐` `☾` `☀` | Thème : automatique (suit le téléphone) → sombre → clair. Le choix est mémorisé. |
| Pastille | 🟢 taux du jour · 🟠 quelques jours · ⚪ hors-ligne ou taux de secours |
| **Enregistrer** | Range la conversion dans l'historique, avec la note facultative et le calcul s'il y en a eu. |
| **Historique** | Liste des conversions enregistrées, total par devise, suppression ligne à ligne. |

## Historique et suivi du budget

Quatre vues — **jour, semaine, mois, voyage** — chacune avec son sous-total. Un
budget facultatif affiche le reste à dépenser et la moyenne par jour.

Les totaux sont donnés dans une **devise de référence** (CAD par défaut, modifiable),
avec le détail par devise dépensée. Chaque ligne est figée au taux du jour de
l'achat : une dépense de juin n'est pas recalculée au taux d'octobre.

**Imprimer / PDF** passe par `window.print()` et une feuille de style dédiée :
sur Android, *Enregistrer au format PDF*. Aucune bibliothèque, fonctionne hors-ligne.

## Détails de l'historique

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

Source principale : [open.er-api.com](https://open.er-api.com/) (~160 devises),
avec [Frankfurter](https://www.frankfurter.app/) (taux de référence de la **Banque
centrale européenne**, ~31 devises) en secours.

**Les deux sont sans clé d'API, et c'est un choix délibéré.** EuroCad est un site
statique : toute clé qu'il contiendrait serait lisible dans le code source de la
page, donc utilisable par n'importe qui. Les services à clé (ExchangeRate-API,
Open Exchange Rates) exigeraient un serveur pour la protéger.

Une seule requête ramène **toute la table de taux**. Changer de devise ne coûte
ensuite aucun réseau, et le mode avion couvre toutes les paires.

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
npm test             # 104 vérifications : conversion, parseur, historique, hors-ligne, PWA
npm run test:sw      # le cycle de mise à jour du service worker
npm run test:all     # les deux
npm run icons        # régénère icons/*.png
```

Le site est du statique pur. `index.html` contient le balisage, le CSS et le JS —
volontairement en un seul fichier : une requête HTTP, donc le démarrage à froid le
plus court possible.

| Fichier | Rôle |
|---|---|
| `index.html` | L'app entière (~13 Ko) |
| `sw.js` | Service worker : page en réseau d'abord, ressources en cache |
| `scripts/sw-update.mjs` | Vérifie qu'un redéploiement atteint un utilisateur déjà installé |
| `manifest.webmanifest` | Métadonnées d'installation |
| `test.mjs` | Suite de tests Playwright |

Le calcul en ligne utilise un analyseur en descente récursive écrit à la main —
jamais `eval` ni `new Function`.

## Référencement

La page n'est **pas indexée** : `<meta name="robots" content="noindex">` dans
`index.html`. Tout le reste est en place pour le jour où ce serait souhaité —
titre descriptif, adresse canonique, données structurées `schema.org/WebApplication`,
balises Open Graph, page utilisable sans JavaScript côté description. **Retirer
cette seule ligne suffit à activer l'indexation.**

Un `robots.txt` serait sans effet ici : les robots ne le lisent qu'à la racine
du domaine (`benoleblanc.github.io/robots.txt`), pas dans le sous-dossier
`/EuroCad/`. Seule la balise fonctionne.

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
