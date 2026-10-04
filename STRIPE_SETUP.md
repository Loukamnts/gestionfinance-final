# Activation des abonnements Meuniance

Le code est préparé pour Stripe Checkout hébergé, le portail client Stripe et
des webhooks signés. Les paiements restent bloqués tant que la configuration
Stripe, Supabase et les informations légales ne sont pas complètes.

## Avant toute activation

Renseigner l'identité juridique du vendeur, son adresse, un e-mail de support
et le médiateur de la consommation compétent. Ces informations sont obligatoires
pour activer le serveur de facturation. Compléter aussi les mentions légales
avec le statut de l'éditeur, son numéro d'immatriculation lorsqu'il existe et
les autres informations applicables à sa situation.

Déterminer le traitement de la TVA avec un professionnel. Les deux prix attendus
par le code sont 4,99 € TTC par mois pour Plus et 7,99 € TTC par mois pour Pro.
La taxe automatique Stripe ne doit pas être activée avant d'avoir confirmé les
immatriculations et obligations fiscales.

## Mise en place dans le bac à sable Stripe

1. Utiliser un bac à sable Stripe séparé de la production.
2. Créer un produit Plus et un produit Pro.
3. Créer un prix récurrent mensuel en euros pour chaque produit. Régler le
   comportement fiscal du prix sur inclusif.
4. Copier les identifiants `price_...` dans les variables Vercel prévues.
5. Configurer le portail client avec la modification du moyen de paiement,
   l'historique des factures et la résiliation en ligne.
6. Ajouter un webhook vers
   `https://gestion-finance-coral.vercel.app/api/stripe/webhook`.

Utiliser une clé Stripe restreinte dédiée à Meuniance. Elle doit seulement
autoriser la lecture des prix et la gestion de Checkout, des clients, des
abonnements et du portail client. Activer une clé d’accès forte ou une
application d’authentification pour les comptes qui accèdent au tableau de bord
Stripe. Utiliser des clés différentes pour le bac à sable et la production.

Événements à écouter :

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.deleted`

## Base Supabase

Exécuter `supabase_stripe_billing.sql` dans l'éditeur SQL du projet. Cette
migration ajoute des registres privés pour les clients, abonnements, webhooks,
limites de création de paiement et abonnements offerts. Les rôles du navigateur
n'ont aucun accès direct à ces tables.

## Variables Vercel

Copier les noms de `.env.example` dans Production, Preview et Development avec
des valeurs adaptées à chaque environnement. Commencer avec
`BILLING_ENABLED=false`. Après les essais complets dans le bac à sable, passer
la valeur à `true` uniquement dans l'environnement voulu.

La clé secrète Stripe, le secret du webhook et la clé `service_role` Supabase
restent des variables serveur. Elles ne doivent jamais être préfixées par
`VITE_`, `NEXT_PUBLIC_` ou copiées dans un fichier servi au navigateur.

## Moyens de paiement et cartes

Checkout utilise les moyens de paiement dynamiques de Stripe. Apple Pay et
Google Pay apparaissent automatiquement lorsque le compte, le navigateur, le
pays et l'appareil sont éligibles. Aucun numéro complet de carte ou cryptogramme
ne passe par Meuniance.

Apple Pay ne demande pas d’intégration supplémentaire avec Checkout hébergé.
Google Pay ne demande pas de code supplémentaire non plus. Les deux moyens
doivent rester autorisés dans les réglages des moyens de paiement Stripe. Leur
présence doit être testée sur un appareil compatible avec un portefeuille déjà
configuré.

Le bouton « Gérer ou résilier » ouvre le portail Stripe. L'utilisateur peut y
mettre à jour ou retirer un moyen de paiement lorsque son abonnement le permet.
Les factures et écritures soumises à une durée légale de conservation ne sont
pas supprimées avec la carte.

## Vérifications avant la production

- achat Plus réussi dans le bac à sable
- achat Pro réussi dans le bac à sable
- paiement refusé et paiement différé
- webhook reçu une seule fois malgré une livraison répétée
- accès retiré après résiliation ou impayé selon la politique choisie
- portail client, facture, changement de carte et résiliation
- suppression de compte avec arrêt préalable du client Stripe
- affichage français et anglais sur téléphone et ordinateur
- contrôle du prix, de la TVA, de l'identité du vendeur et de la médiation

Le passage aux clés réelles doit être fait seulement après cette liste et un
achat réel de faible montant contrôlé de bout en bout.
