# Console d'administration locale

Cette console est volontairement séparée du site public. Le serveur écoute
uniquement sur `127.0.0.1`, vérifie chaque jeton Supabase et refuse tout compte
autre que l’adresse configurée localement dans `ADMIN_EMAIL`.

1. Dans Supabase, ouvre **Project Settings > API Keys > Secret keys** et copie
   une clé secrète destinée uniquement à cette console locale.
2. Copie `admin.env.example` vers `admin.env` puis colle la clé après
   `SUPABASE_SERVICE_ROLE_KEY=` et ton adresse après `ADMIN_EMAIL=`.
3. À la racine du projet, lance `npm run admin`.
4. Ouvre `http://127.0.0.1:4175` et connecte-toi avec ton compte administrateur.

Le fichier `admin.env` est ignoré par Git. Il ne part ni sur GitHub ni sur
Vercel. Toute suppression exige de retaper une confirmation précise et le
compte administrateur ne peut pas être supprimé depuis cette console.

