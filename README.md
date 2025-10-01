# HerbautArbre

Jeu de données généalogiques extrait automatiquement du PDF « Famille Herbaut ».

## Installation

```bash
git clone https://github.com/<votre-compte>/HerbautArbre.git
cd HerbautArbre
npm ci
```

## Développement local

```bash
npm run dev
```

Le serveur Vite est disponible sur [http://localhost:5173](http://localhost:5173).

## Build de production

```bash
npm run build
```

La sortie optimisée est générée dans `dist/` et servie telle quelle sur GitHub Pages.

## Déploiement

Le workflow GitHub Actions `deploy.yml` publie automatiquement `dist/` sur la branche `gh-pages` après chaque `push` sur `main`. Le site est ensuite disponible à l'adresse suivante :

```
https://<votre-compte>.github.io/HerbautArbre/
```

## Extraction des données

```bash
python scripts/extract_family_tree.py
```

Le script s'appuie sur `pdfplumber` pour découper le PDF en fiches individu,
reconstruire une entrée structurée et produire `data/famille-herbaut.json`.
L'opération crée au passage des identifiants stables (`I_*`, `S_*`, `EXT_*`) et
les relations `spouse`/`parent-child` correspondantes.

Le schéma détaillé et la méthodologie de validation manuelle sont documentés dans
`docs/data-schema.md`.

## Contribution

1. Mettre à jour les données dans `data/famille-herbaut.json` à l'aide du script d'extraction ou via une édition manuelle documentée.
2. Vérifier que `npm run build` termine sans erreur et que l'arbre se charge correctement en local (`npm run dev`).
3. Après déploiement sur `gh-pages`, effectuer une vérification manuelle du site publié (navigation dans l'arbre et recherche multi-critère).
4. Ajouter ou mettre à jour une capture d'écran de l'arbre (dans `docs/` ou `public/`) dès qu'une version représentative est disponible, puis référencer l'image dans cette documentation.

## Tests manuels recommandés

1. Démarrer l'application (`npm start`) puis charger l'arbre dans un navigateur.
2. Ouvrir le panneau « Exploration ciblée » et saisir un nom, un prénom et/ou une date puis valider.
3. Vérifier que la modale de résultats affiche l'ensemble des correspondances (recherche insensible à la casse et par correspondances partielles).
4. Cliquer sur chaque résultat et confirmer que l'arbre recentre la personne sélectionnée, la met en évidence et ouvre sa fiche de détails.
5. Réinitialiser le formulaire pour effacer les critères et s'assurer que la modale se ferme.
