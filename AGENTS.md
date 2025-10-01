# Consignes générales du dépôt

## Structure recommandée
- `public/` : ressources statiques et assets partagés.
- `src/` : code applicatif principal (modules ES, composants UI, utilitaires).
- `scripts/` : scripts d'outillage (build, migration de données, automatisations).
- `data/` : sources de données, exports et sauvegardes (lecture seule en production).

## Règles de style
- Indentation standard de 2 espaces pour tous les fichiers (JS/TS, HTML, CSS, JSON, YAML, etc.).
- Utiliser exclusivement des modules ES (`import`/`export`) dans le code applicatif.
- Convention de nommage CSS selon BEM (`block__element--modifier`).

## Exigences fonctionnelles minimales
- Arbre interactif permettant d'explorer dynamiquement la structure familiale.
- Recherche multi-critère (nom, date, relation, etc.) avec filtrage instantané des résultats.
- Navigation fluide vers le nœud sélectionné dans l'arbre (mise en évidence et centrage).
- Conservation intégrale des données (aucune perte ou modification non intentionnelle lors des interactions).

## Consignes PR
- Le message de PR doit inclure :
  - Un résumé concis des changements majeurs.
  - Le détail des tests automatisés et manuels effectués.
  - Les impacts connus ou points d'attention éventuels.

## Tests manuels attendus
- Chargement local de l'application (vérifier que l'arbre et la recherche se chargent sans erreur).
- Vérifier la navigation vers un nœud sélectionné depuis les résultats de recherche.
