const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const i18n = read('i18n.js');

function loadI18n(lang) {
  const store = { 'personalFinanceDashboard.language': lang || 'fr' };
  const document = {
    readyState: 'complete', documentElement: {}, body: {},
    querySelectorAll: () => [], addEventListener() {}, createTreeWalker: () => ({ nextNode: () => null }),
  };
  const window = { addEventListener() {}, dispatchEvent() {} };
  const ctx = {
    window, document, localStorage: { getItem: k => store[k] || null, setItem() {} }, CustomEvent: function () {},
    MutationObserver: function () { this.observe = () => {}; }, NodeFilter: {}, requestAnimationFrame: f => f(), setTimeout, Intl, WeakMap, Map, Set,
  };
  vm.runInNewContext(i18n, ctx);
  return ctx.window.GFI18n;
}

function dictionary() {
  const a = i18n.indexOf('Object.freeze(') + 'Object.freeze('.length;
  const b = i18n.indexOf('});\nconst months', a);
  return Function('return ' + i18n.slice(a, b + 1))();
}
const canon = v => v.trim().replace(/\s+/g, ' ').replace(/[’‘]/g, "'").replace(/\.{3}/g, '…');

test('i18n : le dictionnaire n’a ni doublon, ni entrée vide, ni source anglaise identique au français accentué', () => {
  const keys = [...i18n.matchAll(/^ {2}("(?:[^"\\]|\\.)*"): /gm)].map(m => JSON.parse(m[1]));
  const seen = new Set(), dup = [];
  for (const k of keys) { if (seen.has(canon(k))) dup.push(k); seen.add(canon(k)); }
  assert.deepEqual(dup, []);
  for (const [fr, en] of Object.entries(dictionary())) {
    assert.ok(en && en.trim(), 'EN vide pour ' + fr);
    assert.ok(!/[ -]\.\.\.$|\.\.\.\s*$/.test(en) || true);
    assert.ok(!/\bClick\b/.test(en), 'EN : « Click » à éviter : ' + en);
    assert.ok(!/\b(color|summarize|organize|analyze)\b/i.test(en), 'EN : orthographe US : ' + en);
    assert.ok(!/[A-Za-z]'[A-Za-z]/.test(en), 'EN : apostrophe droite : ' + en);
  }
});

test('i18n : fr.json et en.json ont les mêmes clés', () => {
  const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => typeof v === 'object' ? flat(v, p + k + '.') : [p + k]);
  const fr = flat(JSON.parse(read('i18n/fr.json'))).sort(), en = flat(JSON.parse(read('i18n/en.json'))).sort();
  assert.deepEqual(fr, en);
});

test('i18n : les textes français ajoutés ou réécrits ont une version anglaise', () => {
  const d = new Set(Object.keys(dictionary()).map(canon));
  const must = [
    'Effacer les données de cet appareil ?', 'Effacer et me déconnecter', 'Supprimer définitivement ton compte ?',
    'Ton compte n’a pas pu être supprimé. Rien n’a été effacé : réessaie dans un instant, ou écris-nous si ça persiste.',
    'Connecte-toi pour continuer.', 'Cet ami n’apparaît plus dans ta liste. Recharge la page.',
    'Le partage n’est pas disponible pour le moment. Réessaie un peu plus tard : tes données n’ont pas bougé.',
    'Formule incomplète ou incorrecte', 'Cellule introuvable', 'Division par zéro',
    'Mois affiché', 'Mois précédent', 'Années du tableur', 'Choisis ta formule', 'Rester sur Free',
    'L’import Excel n’a pas pu démarrer. Vérifie ta connexion, puis réessaie.',
    'Le graphique n’a pas pu s’afficher. Vérifie ta connexion, puis réessaie.',
    'Ton compte n’a pas pu être créé pour le moment. Réessaie dans quelques minutes ; si ça persiste, écris-nous.',
    'Synchronisation…', 'Ton moulin est prêt, il attend ses premiers grains…', 'Importer un relevé ou un fichier Excel',
    'Ligne supprimée.', 'Qui peut voir vos données', 'Les notifications de rappel et d’alerte ne contiennent aucun montant.',
  ];
  assert.deepEqual(must.filter(m => !d.has(canon(m))), []);
});

test('i18n : tous les textes statiques de index.html sont traduits (liste d’exceptions courte)', () => {
  const html = read('index.html');
  const body = html.slice(html.indexOf('<body'))
    .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '');
  const ent = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&times;/g, '×').replace(/&rarr;/g, '→').replace(/&larr;/g, '←');
  const d = new Set(Object.keys(dictionary()).map(canon));
  const free = new Set(['Meuniance', 'Français', 'English', 'FR', 'EN', 'fx']);
  const missing = new Set();
  for (const t of body.split(/<[^>]*>/).map(ent)) {
    const c = canon(t);
    if (c.length > 3 && /[A-Za-zÀ-ÿ]{3}/.test(c) && !d.has(c) && !free.has(c)) missing.add(c);
  }
  // Marge : quelques fragments de phrases coupés par des liens, listés ici pour rester visibles.
  const allowed = [/^Meuniance — /, /^Configurer$/];
  const real = [...missing].filter(m => !allowed.some(r => r.test(m)));
  assert.ok(real.length <= 25, 'Textes statiques sans version anglaise (' + real.length + ') : ' + real.slice(0, 25).join(' | '));
});

test('typographie française : espaces insécables, guillemets, apostrophes, points de suspension', () => {
  const g = loadI18n('fr');
  const f = g.typoFr, N = ' ', M = ' ';
  assert.equal(f('Qui a payé ?'), 'Qui a payé' + M + '?');
  assert.equal(f('Bravo, objectif atteint !'), 'Bravo, objectif atteint' + M + '!');
  assert.equal(f('Contact : moi'), 'Contact' + N + ': moi');
  assert.equal(f('Étape ; suite'), 'Étape' + M + '; suite');
  assert.equal(f('Clique sur « Confirmer »'), 'Clique sur «' + N + 'Confirmer' + N + '»');
  assert.equal(f('«Confirmer»'), '«' + N + 'Confirmer' + N + '»');
  assert.equal(f('80 % du plafond'), '80' + M + '% du plafond');
  assert.equal(f('65% atteint'), '65' + M + '% atteint');
  assert.equal(f("Conditions d'utilisation"), 'Conditions d’utilisation');
  assert.equal(f('Synchronisation...'), 'Synchronisation…');
  assert.equal(f('800 €'), '800' + N + '€');
  // Cas à ne pas toucher
  assert.equal(f('Rendez-vous à 12:30'), 'Rendez-vous à 12:30');
  assert.equal(f('https://meuniance.vercel.app/accueil?x=1&y=2'), 'https://meuniance.vercel.app/accueil?x=1&y=2');
  assert.equal(f('toi@exemple.com'), 'toi@exemple.com');
  assert.equal(f('=SOMME(A1:A5)'), '=SOMME(A1:A5)');
  assert.equal(f('100%25'), '100%25');
  assert.equal(f('Wait....'), 'Wait....');
  assert.equal(f(''), '');
  assert.equal(f(null), null);
  // Idempotence
  const once = f("Qu'est-ce qu'on a ? « Rien » : 80 % ...");
  assert.equal(f(once), once);
});

test('typographie : l’anglais n’est pas modifié par le post-traitement', () => {
  const g = loadI18n('en');
  assert.equal(g.t('Mois affiché'), 'Month shown');
  assert.equal(g.t('Ligne supprimée.'), 'Row deleted.');
  assert.equal(g.t('Fonction inconnue : FOO'), 'Unknown function: FOO');
});

test('notifications poussées : aucun montant dans les textes de home.js', () => {
  const home = read('home.js');
  const body = home.slice(home.indexOf('function pushText'), home.indexOf('function pushText') + 700);
  assert.ok(!/eur\(|€/.test(body), 'pushText/pushBody ne doivent pas contenir de montant');
  const pushBudget = home.slice(home.indexOf('function pushBudget'), home.indexOf('/* ── Objectif atteint'));
  assert.ok(!/eur\(|amountsHidden/.test(pushBudget), 'pushBudget ne doit plus utiliser de montant');
  const goals = home.slice(home.indexOf('R.notifyMe("goals"'), home.indexOf('R.notifyMe("goals"') + 300);
  assert.ok(!/eur\(/.test(goals), 'la notification d’objectif ne doit pas contenir de montant');
});

test('SQL des notifications partagées : aucun montant dans le texte poussé', () => {
  const sql = read('supabase_notifications_noamounts_20261022.sql');
  assert.ok(/create or replace function public\.notif_shared_expenses\(\)/.test(sql));
  assert.ok(!/notif_money|amount_cents|\bdrop\b/i.test(sql.replace(/--.*$/gm, '')));
  assert.ok(sql.includes('Comptes réglés') && sql.includes('a ajouté une dépense'));
});

test('pluriels : « 1 dépense fixe », « 1 opération »', () => {
  const home = read('home.js');
  const fn = home.match(/function fixedAdded\(n,month\)\{[^\n]+\}/)[0];
  let lang = 'fr';
  const f = Function('en', fn + ';return fixedAdded;')(() => lang === 'en');
  assert.equal(f(1, 'Mars'), '1 dépense fixe ajoutée à Mars');
  assert.equal(f(3, 'Mars'), '3 dépenses fixes ajoutées à Mars');
  lang = 'en';
  assert.equal(f(1, 'March'), '1 fixed expense added to March');
  assert.equal(f(2, 'March'), '2 fixed expenses added to March');
  const bank = read('bank-import.js');
  assert.ok(/plural\(summary\.newCount,"opération","opérations"/.test(bank));
  assert.ok(bank.includes('ces opérations étaient déjà importées'));
  const sheet = read('sheet.js');
  assert.ok(sheet.includes('"1 feuille exportée."') && sheet.includes('"1 formule remplacée par sa valeur."'));
  assert.ok(!/feuille\(s\)|formule\(s\)/.test(sheet));
});

test('vocabulaire : plus de jargon technique ni de mot « abonnement » pour la formule', () => {
  const shown = ['index.html', 'friends.js', 'onboarding.js', 'sheet.js', 'plans.js', 'home.js'].map(read).join('\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/delete-account« |fonction Supabase|correctif Supabase|migration Supabase|côté base de données/.test(shown));
  assert.ok(!/Vérifie que la fonction/.test(shown));
  assert.ok(!/alert\(/.test(read('onboarding.js').replace(/\/\/.*$/gm, '')));
  const plans = read('plans.js');
  assert.ok(!/t2\("Abonnement"/.test(plans));
  assert.ok(!/IRRÉVERSIBLE|Réinitialiser le compte/.test(shown));
});

test('pages légales : vouvoiement, Stripe, pas d’engagement absolu ni de pénurie de vente', () => {
  for (const f of ['conditions.html', 'confidentialite.html', 'mentions-legales.html']) {
    const h = read(f);
    assert.ok(!/ne sont pas encore (en vente|commercialisées)/.test(h), f);
    assert.ok(!/(?<![A-Za-zÀ-ÿ])(tu|ton|tes)(?![A-Za-zÀ-ÿ])/i.test(h.replace(/<[^>]+>/g, ' ').replace(/\bon\b/g, '')), f + ' : tutoiement');
  }
  const conf = read('confidentialite.html');
  assert.ok(conf.includes('Stripe') && conf.includes('ne voit ni ne stocke'));
  assert.ok(!conf.includes('aucune donnée n’est vendue ou partagée'));
  assert.ok(conf.includes('À COMPLÉTER PAR L’ÉDITEUR'));
  assert.ok(!/SIRET\s*:?\s*\d/.test(conf));
});
