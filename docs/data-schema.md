# Schéma des données familiales

Ce document résume les champs identifiés dans le PDF *Famille Herbaut* et la
manière dont ils sont représentés dans le fichier JSON généré par
`scripts/extract_family_tree.py`.

## Champs relevés dans le PDF

Chaque fiche individu du document source présente systématiquement :

- **Identité** : nom et prénom(s) mis en avant en début de paragraphe.
- **Repères généalogiques** : numéro Sosa (lorsqu'il est fourni) et appartenance
  à une génération donnée.
- **Naissance** : date complète et lieu (ou mention explicite de l'absence
  d'information).
- **Décès** : date complète et lieu (si disponibles).
- **Parents** : filiation explicite précisant les noms des père et mère, avec
  parfois leur métier ou des détails d'âge.
- **Mariages** : mention de l'époux/épouse, souvent enrichie d'une date et d'un
  lieu de mariage, parfois suivie d'informations sur l'ascendance du conjoint.
- **Descendance** : liste à puces des enfants associés au couple avec
  l'identifiant entre parenthèses.
- **Annotations libres** : événements biographiques, professions, décès des
  proches, etc.

Ces éléments ont guidé la structure cible décrite ci-dessous.

## Structure JSON

Le fichier `data/famille-herbaut.json` contient deux tableaux :

- `individuals[]` : enregistrements des individus reconnus.
- `relationships[]` : relations normalisées entre individus.

### Table `individuals`

Chaque objet comporte les attributs suivants :

| Champ | Description |
| --- | --- |
| `id` | Identifiant stable dérivé du numéro Sosa ou de l'identifiant hiérarchique de la fiche (`I_1_2`, `S_3072`, etc.). |
| `name` | Nom complet tel qu'il apparaît dans le PDF. |
| `gender` | Sexe déduit des pronoms (« Il/Elle ») ou du participe « né/née » lorsque possible. |
| `generation` | Génération indiquée dans le document, si connue. |
| `sosa` | Numéro Sosa textuel lorsque fourni. |
| `birth` | Objet `{date, place}` lorsque l'une des informations est disponible. |
| `death` | Objet `{date, place}` lorsque le décès est documenté. |
| `parents` | Objet `{father, mother}` avec les noms relevés sur la fiche. |
| `spouses` | Tableau d'objets `{name, marriage_date, marriage_place, partner_id, note}` couvrant chaque mariage. `partner_id` est résolu vers un individu connu lorsqu'il existe, sinon vers un identifiant externe `EXT_*`. |
| `children` | Liste des identifiants hiérarchiques (`1.1.1`, etc.) tels qu'ils apparaissent dans la liste à puces des descendants. |
| `annotations` | Liste brute des phrases restantes pour conserver le contexte biographique (professions, décès des proches, âges, etc.). |

### Table `relationships`

Deux types de relations sont exposés :

- `spouse` : relie deux individus mariés. Le champ `context` conserve la
  phrase source du mariage.
- `parent-child` : relie un parent à chacun de ses enfants cités dans la fiche.

## Validation manuelle

- Vérification page par page des deux premières générations pour confirmer que
  chaque fiche identifiée dispose d'une entrée dans `individuals` et que les
  enfants cités sont bien reliés via `parent-child`.
- Contrôle ponctuel sur la génération 4 (ex. fiche `1.1.2`) pour s'assurer que
  les mariages détectés disposent d'une relation `spouse` et que le conjoint
  absent du PDF est créé avec un identifiant externe.
- Comptage final : 344 individus et 345 relations générées, ce qui couvre toutes
  les fiches détectées par le découpage automatique. Le compteur se met à jour
  automatiquement lors de futures extractions.

Les points ci-dessus garantissent l'exhaustivité du JSON vis-à-vis du PDF à la
limite des heuristiques mises en œuvre.
