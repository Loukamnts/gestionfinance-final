# Déployer Gestion Finance sur Vercel

Mise à jour du 9 septembre 2026. Le site reste statique et les sources restent à la racine. Un build prépare désormais un dossier public `dist`. Ne publie plus directement la racine : elle contient les migrations SQL et les outils de test.

## Projet existant

Conserve le dépôt `Loukamnts/gestionfinance-final` et le projet Vercel actuel.

| Réglage | Valeur |
| --- | --- |
| Root Directory | `.` |
| Framework Preset | Other |
| Install Command | `npm ci --ignore-scripts --include=dev` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js | 22.x ou 24.x |

Ces commandes sont définies dans `vercel.json`. Désactive les anciens overrides vides ou pointant sur `.` dans Vercel. Le dépôt contient `package.json`, `package-lock.json`, `scripts`, `tests` et toutes les sources. Ne pousse ni `node_modules` ni `dist` : Vercel les recrée.

Le build teste les protections, copie uniquement les fichiers publics, extrait les scripts intégrés et calcule leurs empreintes SRI. Les polices, Chart.js et Supabase sont servis par le site. SheetJS est chargé depuis sa distribution officielle avec version exacte et SRI. Aucun SQL, outil de test ou document interne n'est inclus.

## Mise à jour Supabase

Pour le projet existant, qui possède déjà le partage granulaire et son correctif de lecture, exécute **uniquement** `supabase_security_hardening.sql` dans SQL Editor. Applique-le avant de publier le nouveau client : Retirer un ami utilise désormais la fonction atomique `remove_friendship`.

Le script est transactionnel et réexécutable. Aucun compte ni tableur personnel n'est supprimé. Les droits orphelins, sans amitié acceptée, sont désactivés ; les partages valides sont conservés.

Ne rejoue pas le schéma initial ni `supabase_granular_friend_sharing.sql` lors d'une mise à jour : cette ancienne migration réinitialise les permissions.

Pour une base entièrement neuve, exécute dans cet ordre :

1. `supabase_schema.sql`.
2. `supabase_granular_friend_sharing.sql`.
3. `supabase_fix_secure_sharing_access.sql`.
4. `supabase_fix_shared_snapshot_read.sql`.
5. `supabase_security_hardening.sql`.

Cet ordre est couvert par les tests PostgreSQL. Ne rejoue pas ensuite les autres réparations historiques : elles peuvent réintroduire d'anciens droits.

## Authentification

Garde Email et **Confirm email** activés. Configure la Site URL exacte dans Authentication → URL Configuration, ainsi que les URLs de confirmation et récupération réellement utilisées. Évite les jokers couvrant des déploiements non fiables.

La configuration publique contient seulement l'URL du projet et une clé publishable ou ancienne clé anon. Le build refuse les clés administrateur reconnues, y compris un JWT de rôle `service_role`. Ne pousse jamais de mot de passe, de clé secrète ou de fichier `.env`.

Un changement de projet Supabase exige aussi de mettre à jour les origines exactes de `connect-src` dans `vercel.json`. Le build vérifie leur cohérence.

Configure côté Supabase les limites de débit et la politique de mots de passe. Un CAPTCHA exige ses propres clés et l'intégration du formulaire : ne l'active pas sans préparer le site, sinon les inscriptions échoueront.

## Suppression de compte

La fonction `supabase/functions/delete-account/index.ts` reste déployée dans Supabase, pas dans Vercel. Elle vérifie la session et ne supprime que son utilisateur.

```sh
supabase login
supabase link --project-ref TON_PROJECT_REF
supabase secrets set ALLOWED_ORIGIN=https://ton-domaine-de-production
supabase functions deploy delete-account
```

L'origine doit correspondre exactement au site, sans slash final. Ne copie jamais la clé de service dans le navigateur. Teste la suppression uniquement avec un compte explicitement jetable.

## Vérifications

En local, avec Node 22 ou 24 :

```sh
npm ci --ignore-scripts --include=dev
npm test
npm run build
```

Après le déploiement Vercel marqué Ready :

- parcours de configuration, connexion, thèmes, langues et modales légales fonctionnels ;
- graphiques, import et export Excel testés avec un fichier fictif ;
- aucun partage initial ; destinataire limité aux mois/lignes autorisés ; tiers refusé ;
- retrait d'ami : accès coupés dans les deux sens ; réinvitation : aucun ancien accès rétabli ;
- `/supabase_schema.sql`, `/.git/config`, `/.env` et `/package.json` répondent 404 ;
- aucune erreur CSP/SRI, aucun `unsafe-inline` dans `script-src` ;
- `/.well-known/security.txt` accessible une fois le contact public choisi.

## Dépannage et retour arrière

En cas de build en erreur, lis les logs et vérifie Node, le lockfile et les sources. Ne retire pas les tests ou en-têtes pour masquer l'échec.

Si SRI bloque SheetJS, vérifie les octets depuis sa distribution officielle avant de changer version et empreinte ; ne supprime pas `integrity`.

Si Retirer un ami échoue, vérifie la migration de durcissement. Le client ne retombe pas sur une suppression partielle.

Pour revenir à une ancienne version, restaure un commit GitHub/Vercel compatible. Ne rétablis pas les écritures directes Supabase pour faire fonctionner un ancien bouton.

La session et le tableur restent stockés sur l'appareil. N'utilise pas un profil de navigateur partagé pour des données privées. Ces tests ne constituent pas une garantie d'invulnérabilité.

Références : [build Vercel](https://vercel.com/docs/builds/configure-a-build), [configuration Vercel](https://vercel.com/docs/project-configuration/vercel-json), [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [URLs de redirection](https://supabase.com/docs/guides/auth/redirect-urls).
