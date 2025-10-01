# Déploiement sur GitHub Pages

Ce guide décrit pas à pas la mise en ligne de l'application telle qu'elle est configurée dans ce dépôt. Il détaille la préparation du code, la configuration de GitHub Pages et le lancement du workflow de publication.

## Prérequis

1. Un fork ou un dépôt GitHub contenant le code du projet.
2. Les droits d'administrateur ou de mainteneur sur ce dépôt pour modifier les paramètres et déclencher des workflows.
3. Node.js installé en local si vous souhaitez vérifier le build avant de pousser (facultatif mais recommandé).

## 1. Préparer le projet pour GitHub Pages

1. Vérifiez que la configuration Vite définit le chemin de base de publication :
   - Le fichier [`vite.config.js`](../vite.config.js) contient `base: '/HerbautArbre/'`, ce qui garantit que les assets et le JavaScript seront servis depuis le sous-répertoire GitHub Pages.
2. Confirmez que les données sont chargées à partir de ce même chemin :
   - Dans [`src/main.js`](../src/main.js), l'URL des données est construite avec `import.meta.env.BASE_URL`, ce qui permet au fetch de fonctionner après le déploiement.
3. Validez localement que `npm install` puis `npm run build` s'exécutent sans erreur (optionnel mais utile pour éviter des échecs de workflow).

## 2. Configurer GitHub Pages

1. Ouvrez le dépôt sur GitHub et rendez-vous dans **Settings → Pages**.
2. Dans la section **Build and deployment**, choisissez **GitHub Actions** comme source. Cette option autorise l'utilisation du workflow déjà fourni (`.github/workflows/deploy.yml`).
3. Aucun secret personnalisé n'est nécessaire : le workflow consomme le jeton `secrets.GITHUB_TOKEN` intégré que GitHub crée automatiquement pour chaque exécution. Ne créez pas de secret manuel `GITHUB_TOKEN`.

## 3. Déclencher le déploiement

1. Assurez-vous que vos derniers changements sont fusionnés sur la branche `main`.
2. Poussez (`git push`) la branche `main` vers GitHub. Chaque push sur `main` déclenche automatiquement le workflow **Deploy**.
3. Pour un déclenchement manuel, accédez à **Actions → Deploy → Run workflow** et choisissez la branche `main`.
4. Lors de l'exécution, le workflow :
   - installe les dépendances avec `npm ci`,
   - lance `npm run build` pour produire le dossier `dist/`,
   - publie ce dossier sur la branche `gh-pages` via `peaceiris/actions-gh-pages` en utilisant le `GITHUB_TOKEN` fourni par GitHub.

## 4. Vérifier la publication

1. Sur la page **Actions**, attendez que le job **Deploy** passe au statut **✅ Success**.
2. Retournez dans **Settings → Pages** : l'interface doit afficher `https://<votre-compte>.github.io/HerbautArbre/` comme URL publiée.
3. Ouvrez cette URL dans un navigateur et vérifiez que l'application se charge correctement (arbre, recherche et données).

## 5. Dépannage rapide

- **Le workflow échoue pendant le build** : exécutez `npm run build` en local pour reproduire l'erreur et corrigez-la avant de pousser.
- **Le site affiche des 404 sur les assets** : confirmez que la clé `base` de `vite.config.js` pointe bien vers `/HerbautArbre/` et que les fichiers ont été reconstruits.
- **Les données JSON ne se chargent pas** : assurez-vous que l'URL de fetch dans `src/main.js` utilise `import.meta.env.BASE_URL` et que `data/famille-herbaut.json` est présent dans le dépôt.
- **Besoin de régénérer le site sans nouveau commit** : déclenchez le workflow manuellement depuis l'onglet **Actions**.

En suivant ces étapes, la version actuelle de l'application est publiée automatiquement sur GitHub Pages à chaque mise à jour de la branche `main`.
