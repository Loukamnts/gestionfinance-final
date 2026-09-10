# Audit de sécurité — Gestion finance

Rapport historique : 1 septembre 2026. Voir ci-dessous le complément du 10 septembre avant d'utiliser les anciennes instructions.

## Complément — correctif du 10 septembre 2026

Le nouveau déploiement sépare les scripts intégrés, refuse les handlers HTML (y compris ceux du tutoriel), vérifie SRI et ne publie que `dist`. Chart.js, Supabase et les polices sont hébergés localement avec versions verrouillées. SheetJS conserve une version officielle exacte et son empreinte SRI. `unsafe-inline` reste limité aux styles pour préserver les thèmes ; il n'est plus autorisé aux scripts.

La migration `supabase_security_hardening.sql` réserve les écritures de partage aux fonctions contrôlées, révoque les accès dans les deux sens et empêche la réactivation par une synchronisation périmée. Elle gère aussi les anciens doublons de relation. Les adresses d'invitation sont vérifiées dans Supabase Auth, pas dans un profil modifiable. Elle ne supprime aucun compte ni tableur personnel.

Avant publication, appliquer cette migration au projet existant. Pour une base neuve, suivre **l'ordre complet du GUIDE_DEPLOIEMENT_VERCEL.md**, qui remplace les instructions historiques ci-dessous. Le dépôt inclut 29 tests de sécurité/build/configuration ; le build les exécute et échoue si une protection régresse. Les vérifications locales ne prouvent pas à elles seules l'état de la base ou du déploiement en ligne.

Le contact public de `security.txt` doit être choisi par le propriétaire. Ne pas inventer une adresse, promettre une certification ni ajouter les anciens en-têtes XSS obsolètes pour améliorer artificiellement un score. L'hébergement Vercel gère le certificat et le domaine `vercel.app` ; les règles DNS d'un domaine appartenant à un tiers ne sont pas modifiables dans ce dépôt.

## Verdict

Le projet est nettement plus sûr après les corrections, mais il n'est pas possible de le déclarer parfaitement sécurisé. La sécurité finale dépend aussi de la configuration Supabase, du domaine Vercel, des dépendances CDN et de l'appareil de l'utilisateur.

## Corrigé dans cette version

- Les intégrations Google Drive / Google Sheets et le serveur local associé ne sont plus chargés par le site.
- Les données Notion et ses identifiants ne sont plus chargés par l'interface.
- La clé Supabase publishable est centralisée dans `supabase_config.json`; aucune clé de service ne doit se trouver dans le navigateur.
- La suppression de compte passe par une Edge Function qui vérifie le JWT, au lieu d'annoncer une suppression qu'un navigateur ne peut pas effectuer correctement.
- Le schéma Supabase contient désormais la table de synchronisation `finance_snapshots` et des règles RLS dédiées.
- Les droits d'ami sont contrôlés au niveau de la base. Seul le destinataire peut accepter une demande ; un ami ne lit qu'une copie filtrée par les mois et les lignes autorisés.
- Le mot de passe demandé dans l'interface est passé à 8 caractères minimum.
- Vercel applique des en-têtes CSP, anti-iframe, anti-MIME sniffing, permissions restreintes et referrer policy.

## À vérifier dans Supabase avant publication

1. Exécuter `supabase_schema.sql`, puis `supabase_granular_friend_sharing.sql`, sans modifier les règles RLS.
2. Confirmer que RLS est activé sur toutes les tables listées dans le script.
3. Ne jamais utiliser `service_role` dans `supabase_config.json`, Vercel, GitHub ou le navigateur.
4. Déployer `supabase/functions/delete-account/index.ts` et définir `ALLOWED_ORIGIN` avec le domaine de production exact.
5. Configurer les URLs de redirection de Supabase avant de tester l'e-mail de confirmation ou la réinitialisation de mot de passe.

## Risques résiduels et améliorations recommandées

- **Session navigateur :** elle est nécessaire à la connexion par e-mail et à la synchronisation. Elle est conservée dans le stockage du navigateur ; la déconnexion la détruit. La supprimer totalement supprimerait aussi la connexion persistante et le partage.
- **XSS :** le projet reste un grand fichier HTML avec des scripts intégrés. La CSP limite les sources externes, mais contient `unsafe-inline` pour que les scripts existants puissent fonctionner. Une amélioration majeure serait de séparer les scripts dans des fichiers externes, supprimer les gestionnaires `onclick` HTML, puis retirer `unsafe-inline`.
- **CDN :** Chart.js, SheetJS et Supabase sont chargés depuis CDN. Pour un projet sensible, verrouiller les versions, ajouter des attributs SRI lorsque possible, ou héberger des copies contrôlées.
- **Authentification :** dans Supabase, active la confirmation e-mail, configure le minimum de mot de passe à 8 ou 12 caractères, les limites de débit et CAPTCHA si le site devient public.
- **Partage :** teste les quatre cas : pas ami, ami sans droit, ami avec un seul mois/une seule ligne, ami après retrait du droit. Le snapshot complet du propriétaire reste privé ; le compte invité lit seulement une copie filtrée, distincte de la synchronisation personnelle.
- **Données locales :** les données restent aussi dans `localStorage`. Elles ne sont pas chiffrées au repos par l'application : ne partage pas un navigateur ou un profil Windows contenant des données financières.
- **Compte supprimé :** vérifie toujours ce parcours avec un compte de test. La suppression d'un utilisateur Supabase cascade vers ses données selon le schéma SQL.
