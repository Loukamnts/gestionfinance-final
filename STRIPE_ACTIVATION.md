# Ouvrir les paiements Plus / Pro (3 étapes)

Le code est en place (fonctions Supabase `billing` et `stripe-webhook`). Tant que la clé Stripe n'est pas
enregistrée, le site reste en « période de lancement » : rien n'est vendu, rien n'est bloqué.

## 1. Clé Stripe (ouvre les ventes)
1. Stripe › Développeurs › Clés API › créer une **clé restreinte** « Meuniance » avec ces droits en écriture :
   Clients, Sessions Checkout, Sessions du portail client, Abonnements ; lecture : Prix, Charges.
2. Supabase › Edge Functions › Secrets › ajouter `STRIPE_SECRET_KEY` = cette clé.
   (Ne la partage nulle part : ni dans le code, ni dans une conversation.)
3. À l'ouverture suivante du site, les boutons « Passer à Plus / Pro » apparaissent et les limites s'appliquent.

## 2. Portail client
Stripe › Paramètres › Facturation › Portail client › activer : mise à jour du moyen de paiement,
historique des factures, résiliation. Sans cela, « Gérer / résilier » ne s'ouvre pas.

## 3. Webhook (coupe l'accès tout de suite en cas de résiliation, remboursement ou impayé)
1. Stripe › Développeurs › Webhooks › ajouter un point de terminaison :
   `https://agbogjpwnzkwrnsjfpkc.supabase.co/functions/v1/stripe-webhook`
2. Événements : `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`,
   `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`,
   `checkout.session.completed`, `charge.refunded`, `charge.dispute.created`, `customer.deleted`.
3. Copier le « secret de signature » (`whsec_…`) dans Supabase › Secrets › `STRIPE_WEBHOOK_SECRET`.

## Avant de vendre
Statut d'éditeur (micro-entreprise / SIRET), conditions générales de vente, mentions légales complétées,
médiateur de la consommation, TVA : voir le rapport de relecture. Tester d'abord avec une clé de **test**
(`rk_test_…`) et la carte 4242 4242 4242 4242.

## Offrir Plus ou Pro à quelqu'un
Table Supabase `billing_grants` (plan, starts_at, ends_at, reason) : un accès offert prime sur Stripe.
