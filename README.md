# HerbautArbre

Jeu de données généalogiques extrait automatiquement du PDF « Famille Herbaut ».

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

## Tests manuels recommandés

1. Démarrer l'application (`npm start`) puis charger l'arbre dans un navigateur.
2. Ouvrir le panneau « Exploration ciblée » et saisir un nom, un prénom et/ou une date puis valider.
3. Vérifier que la modale de résultats affiche l'ensemble des correspondances (recherche insensible à la casse et par correspondances partielles).
4. Cliquer sur chaque résultat et confirmer que l'arbre recentre la personne sélectionnée, la met en évidence et ouvre sa fiche de détails.
5. Réinitialiser le formulaire pour effacer les critères et s'assurer que la modale se ferme.
