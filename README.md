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
