# Audit de sécurité — Gestion Finance

Dernière validation : 10 septembre 2026.

## Verdict

La version publiée est nettement durcie et les vulnérabilités techniques identifiées dans le périmètre du dépôt ont été corrigées ou encadrées. Il reste impossible de déclarer un site « parfaitement sécurisé » : la sécurité dépend aussi de Supabase, de Vercel, des comptes utilisateurs, des appareils et des futures modifications.

## Protections vérifiées

- Le site public est construit dans `dist` ; migrations SQL, tests, lockfile, fichiers d'environnement et métadonnées Git ne sont pas déployés.
- Les scripts applicatifs sont externes, sans gestionnaires `onclick` dans le HTML et sans autorisation `unsafe-inline` ou `unsafe-eval` dans `script-src`.
- Les 14 scripts publics ont une empreinte SHA-384 vérifiée au chargement.
- Supabase, Chart.js et les polices sont servis localement avec des versions verrouillées. SheetJS conserve une version exacte et une empreinte SRI.
- Les en-têtes CSP, HSTS, anti-iframe, anti-MIME sniffing, COOP, COEP, CORP, Referrer-Policy et Permissions-Policy sont actifs en production.
- La configuration publique accepte uniquement l'URL du projet et une clé publishable/anon ; le build refuse les clés `service_role` connues ou encodées.
- La confirmation d'e-mail Supabase reste activée et l'interface propose connexion/inscription par mot de passe.
- La suppression de compte passe par une Edge Function qui vérifie la session ; aucune clé administrateur n'est exposée au navigateur.
- Les données Google Drive, Google Sheets, Notion et leurs anciennes intégrations ne sont plus chargées.

## Partage et amis

La migration `supabase_security_hardening.sql` a été appliquée au projet de production après confirmation du propriétaire. Elle ne supprime ni compte ni tableur personnel.

- Seul le destinataire peut accepter une invitation en attente.
- L'adresse invitée est résolue depuis Supabase Auth et doit être confirmée ; un e-mail de profil modifiable ne suffit pas.
- Une amitié acceptée n'accorde aucun accès par défaut.
- Le propriétaire partage une copie filtrée par années, mois et lignes ; son instantané personnel complet reste privé.
- Les écritures directes dans les relations et autorisations sont refusées au client ; elles passent par des fonctions contrôlées.
- Une sélection périmée ne peut pas réactiver un accès retiré.
- Retirer un ami supprime la relation dans les deux sens et révoque les autorisations bilatérales, y compris pour d'anciens doublons inverses.
- Une nouvelle invitation ne restaure pas d'anciens droits.

## Données locales

Le tableur est aussi conservé dans le stockage du navigateur afin de fonctionner localement et hors connexion. Ce stockage n'est pas chiffré par l'application. Il faut donc utiliser un profil navigateur et un appareil protégés, surtout pour des données financières.

La session navigateur est nécessaire à la connexion persistante et à la synchronisation. La déconnexion détruit la session côté client. Supprimer totalement cette session empêcherait la reconnexion transparente et le partage.

## Vérifications réalisées

- 29 tests automatisés de sécurité, base simulée, build et tutoriel : réussis.
- 40 contrôles automatisés d'interface, traduction, partage et calcul : réussis.
- `npm audit`, dépendances de production puis dépôt complet : 0 vulnérabilité signalée.
- Build public : 13 fichiers applicatifs, 3 scripts extraits, aucun SQL publié.
- Production : CSP, marqueur de version et intégrité des 14 scripts conformes.
- Les chemins sensibles contrôlés (`.env`, `.git/config`, SQL, tests et lockfile) répondent 404.
- La migration Supabase est installée ; les compteurs de comptes et instantanés sont restés identiques avant/après.

Le détail reproductible se trouve dans `work/security-audit-20260909/validation-correctifs.md` dans l'espace de validation local. Ce rapport ne contient aucune donnée financière d'utilisateur.

## Vérifications opérationnelles encore nécessaires

- Rejouer périodiquement le parcours avec deux comptes de test réels : invitation, acceptation, aucun droit par défaut, partage d'une ligne et d'un mois, consultation, révocation, puis réinvitation.
- Tester la suppression uniquement avec un compte jetable. Cette action supprime réellement le compte Supabase et ses données liées.
- Activer des limites de débit adaptées et un CAPTCHA seulement après avoir intégré son jeton au formulaire ; l'activer côté Supabase seul bloquerait les inscriptions.
- Mettre à jour régulièrement les dépendances, puis reconstruire et repasser tous les tests avant publication.
- Publier `/.well-known/security.txt` lorsque le propriétaire aura choisi une adresse de contact destinée à être publique.

## Contact de sécurité

Aucun contact n'est publié par supposition. L'adresse d'un compte personnel visible dans une console d'administration ne doit pas devenir automatiquement un contact public. Une fois l'adresse dédiée fournie, ajouter `security.txt` avec au minimum `Contact`, `Expires`, `Canonical` et, si disponible, `Preferred-Languages: fr, en`.

