# Publier Gestion finance sur Vercel

Cette version est un site statique : `index.html`, CSS et JavaScript sont à la racine. Il n'y a aucun dossier `dist`, `build` ou serveur Node à détecter. Le fichier `vercel.json` est déjà présent et applique les en-têtes de sécurité du site.

## 1. Préparer le dépôt GitHub

1. Crée un nouveau dépôt GitHub vide, par exemple `gestion-finance`.
2. Envoie **le contenu du dossier du projet**, pas le dossier parent et pas l'archive ZIP. À la racine du dépôt, tu dois voir au minimum :

   ```text
   index.html
   sheet.js
   sheet.css
   onboarding.js
   onboarding.css
   friends.js
   supabase_config.json
   supabase_schema.sql
   vercel.json
   ```

3. Ne publie jamais une clé `service_role`, un mot de passe ou un fichier `.env`. La clé `anonKey`/publishable dans `supabase_config.json` est conçue pour être exposée au navigateur ; sa sécurité dépend des règles RLS de Supabase.

## 2. Préparer Supabase

Conserve ton projet Supabase actuel ou crée-en un nouveau.

1. Dans **SQL Editor**, exécute entièrement `supabase_schema.sql`.
2. Dans **Authentication → Providers**, active Email. Garde la confirmation d'e-mail activée en production.
3. Dans **Authentication → URL Configuration** :
   - `Site URL` : `https://ton-domaine.fr` ou l'URL Vercel de production ;
   - `Redirect URLs` : ajoute l'URL de production suivie de `/**` ;
   - pour tester les aperçus Vercel, ajoute `https://*-ton-compte.vercel.app/**`.
4. Dans `supabase_config.json`, renseigne l'URL de ton projet et sa **publishable/anon key**, accessibles dans **Settings → API**. Ne mets jamais de clé secrète ici.

### Fonction de suppression de compte

Le navigateur ne peut pas supprimer un utilisateur Supabase directement sans exposer une clé secrète. La fonction Edge incluse réalise cette action côté serveur après vérification de la session.

Avec la CLI Supabase installée et connectée :

```bash
supabase login
supabase link --project-ref TON_PROJECT_REF
supabase secrets set ALLOWED_ORIGIN=https://ton-domaine.fr
supabase functions deploy delete-account
```

`ALLOWED_ORIGIN` doit correspondre exactement à l'URL de production, sans `/` final. Les secrets `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont disponibles dans l'environnement des Edge Functions ; ne les copie jamais dans Vercel ni dans le dépôt.

Si tu changes de domaine plus tard, mets à jour `ALLOWED_ORIGIN`, puis teste la suppression avec un compte de test.

## 3. Déployer dans Vercel

1. Ouvre [Vercel](https://vercel.com/new) puis importe le dépôt GitHub.
2. Dans **Root Directory**, laisse `.`. Si ton dépôt contient ce projet dans un sous-dossier, sélectionne uniquement ce sous-dossier.
3. Dans **Framework Preset**, choisis **Other**.
4. Active l'override du **Build Command** et laisse le champ vide : ce site ne nécessite aucune compilation.
5. Vérifie que **Output Directory** vaut `.` (ou désactive son override). Il ne doit pas viser `dist`, `build` ou un dossier vide.
6. Clique sur **Deploy**.
7. Ouvre l'URL de production, puis ajoute-la à la configuration des URLs Supabase ci-dessus.

Chaque nouveau push sur la branche de production déclenchera un redéploiement automatique. Les branches et pull requests obtiennent une URL d'aperçu.

## 4. Vérification après publication

Teste dans cet ordre :

1. le premier parcours : **Argent actuel** apparaît avant l'objectif d'épargne ;
2. le tableur : l'objectif d'épargne est modifiable dans le tableur ;
3. les paramètres : catégories, règles et apparence sont visibles ici, pas dans le tableur ni sur l'accueil ;
4. un changement de thème clair/sombre ;
5. création de compte, confirmation par e-mail, connexion et déconnexion ;
6. synchronisation sur un second navigateur ;
7. suppression avec un compte de test seulement ;
8. le partage entre amis, avec les trois permissions activées puis désactivées.

## Dépannage Vercel

**Une page 404 ou une page vide**

- Assure-toi que le dépôt contient `index.html` en minuscules à la racine sélectionnée.
- Dans Vercel, remets le Framework Preset sur **Other**, le Build Command vide et l'Output Directory sur `.`.
- Consulte les logs du dernier déploiement après chaque correction.

**La confirmation d'e-mail renvoie vers localhost ou une mauvaise URL**

- Mets à jour `Site URL` et les `Redirect URLs` dans Supabase, puis renvoie l'e-mail de confirmation.

**Le bouton « Supprimer mon compte » échoue**

- Vérifie que la fonction `delete-account` est déployée.
- Vérifie que le secret `ALLOWED_ORIGIN` correspond exactement à l'URL de production.
- Teste depuis l'URL de production, pas une URL d'aperçu.

## Limites de sécurité à connaître

Les corrections réduisent les risques importants, mais aucun site ne peut être déclaré « parfaitement sécurisé ». Garde Supabase, ses règles RLS et les bibliothèques CDN à jour. Les données locales et la session sont stockées dans le navigateur : un appareil compromis, une extension malveillante ou une faille XSS reste un risque. Pour un produit public, ajoute ensuite la limitation de débit et CAPTCHA côté Supabase Auth, une politique de mot de passe renforcée dans Supabase, ainsi que la surveillance des logs et alertes.

Références officielles : [configurer un build statique Vercel](https://vercel.com/docs/builds/configure-a-build), [déploiements Git Vercel](https://vercel.com/docs/git/vercel-for-github), [URLs de redirection Supabase](https://supabase.com/docs/guides/auth/redirect-urls), [secrets des Edge Functions](https://supabase.com/docs/guides/functions/secrets).
