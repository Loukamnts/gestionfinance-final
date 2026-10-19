/* ═══════════════════════════════════════════════════════════════
   onboarding.js — Wizard de configuration + Tutoriel + Système d'amis
   ═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const STORAGE = {
    onboarding: "personalFinanceDashboard.onboardingCompleted",
    profile: "personalFinanceDashboard.setupProfile",
    tutorial: "personalFinanceDashboard.tutorialCompleted",
    friendCode: "personalFinanceDashboard.friendCode",
  };

  const THEMES = [
    { id: "glass", name: "Ardoise", preview: "linear-gradient(135deg,#111114,#1B1B20,#2a2a31)" },
    { id: "editorial", name: "Édition", preview: "linear-gradient(135deg,#2a1a0e,#4a3220,#2a1a0e)" },
    { id: "brutal", name: "Contraste", preview: "linear-gradient(135deg,#0a0a0a,#1a1a1a,#0a0a0a)" },
  ];

  let currentStep = 0;
  let onboardingStartupInFlight = false;
  let wizardData = {
    startingCash: "",
    accounts: "",
    incomeAmount: "",
    incomeFreq: "mensuel",
    expenses: "",
    savingsGoal: "",
    theme: "glass",
    mode: "dark",
  };

  // === Utilitaires ===
  function store(k, v) { try { safeStore.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function load(k) { try { return JSON.parse(safeStore.getItem(k) || "null"); } catch (e) { return null; } }
  function del(k) { try { safeStore.removeItem(k); } catch (e) {} }

  function $(id) { return document.getElementById(id); }
  function create(tag, className, content) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (content !== undefined) el.innerHTML = content;
    return el;
  }

  // === Wizard ===
  function shouldShowOnboarding() {
    return !load(STORAGE.onboarding);
  }

  function wait(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); }
  async function restoreCloudBeforeOnboarding() {
    if (!shouldShowOnboarding() || onboardingStartupInFlight) return false;
    onboardingStartupInFlight = true;
    try {
      // Une session restaurée (ou Google) peut arriver quelques instants après le chargement.
      // On laisse donc le module de synchronisation récupérer le snapshot avant de toucher au tableur local.
      for (let attempt = 0; attempt < 8 && !(window.__account && window.__account.user); attempt++) await wait(250);
      if (window.__account && window.__account.user) {
        for (let attempt = 0; attempt < 3; attempt++) {
          if (window.__gfSync && window.__gfSync.pullFromCloud) {
            var pulled = await window.__gfSync.pullFromCloud();
            if (pulled) {
              store(STORAGE.onboarding, true);
              var overlay = $("onboardingOverlay"), blocker = $("wizardBlocker");
              if (overlay) overlay.classList.add("hidden");
              if (blocker) blocker.classList.add("hidden");
              document.body.classList.remove("onboarding-active");
              if (typeof window.setPage === "function") window.setPage("dashboard");
              return true;
            }
          }
          await wait(550);
        }
      }
      // Ne jamais effacer un tableur local simplement parce qu'un appareil
      // n'a pas encore de marqueur de tutoriel.
      startWizard(false);
      return false;
    } finally {
      onboardingStartupInFlight = false;
    }
  }

  function startWizard(clearData) {
    // Le questionnaire de configuration a été retiré : il imposait des choix
    // financiers avant même que l'utilisateur puisse explorer l'application.
    // Le tutoriel reste disponible et le solde de départ se règle dans le
    // tableur, quand la personne le souhaite.
    if (clearData) clearSpreadsheetData();
    store(STORAGE.onboarding, true);
    const overlay = $("onboardingOverlay"), blocker = $("wizardBlocker");
    if (overlay) overlay.classList.add("hidden");
    if (blocker) blocker.classList.add("hidden");
    document.body.classList.remove("onboarding-active");
    if (typeof window.setPage === "function") window.setPage("dashboard");
    (function waitHome(n){ if(document.body.classList.contains("gfh-ready")||n>30){ setTimeout(startTutorial, 250); return; } setTimeout(function(){ waitHome(n+1); }, 100); })(0);
  }

  // Vide toutes les données du tableur pour que le tutoriel soit visible
  function clearSpreadsheetData() {
    // 1. Efface les données persistées du tableur
    try { safeStore.removeItem("finance_sheet_v3"); } catch (e) {}
    try { safeStore.removeItem("finance_sheet_v2"); } catch (e) {}
    // 2. Réinitialise l'état de FinanceSheet avec les feuilles par défaut (années)
    if (typeof window.FinanceSheet !== "undefined" && window.FinanceSheet.resetToDefaultSheets) {
      try { window.FinanceSheet.resetToDefaultSheets(); } catch (e) {}
    } else if (typeof window.FinanceSheet !== "undefined" && window.FinanceSheet.clearDemoDataFS) {
      try { window.FinanceSheet.clearDemoDataFS(); } catch (e) {}
    }
    // 3. Sauvegarde l'état vide
    if (typeof window.FinanceSheet !== "undefined" && window.FinanceSheet.saveNow) {
      try { window.FinanceSheet.saveNow(); } catch (e) {}
    }
    // 4. Nettoie les règles de catégorisation et catégories détectées
    try { safeStore.removeItem("personalFinanceDashboard.categoryRules"); } catch (e) {}
    try { safeStore.removeItem("personalFinanceDashboard.customRules"); } catch (e) {}
    // 5. Nettoie l'état interne du dashboard (catégories détectées, mois, pages)
    // On utilise un événement global pour que index.html vide son état
    try { window.dispatchEvent(new CustomEvent("financeClearData")); } catch (e) {}
    // 6. Re-sync le dashboard
    if (typeof window.syncDashboardFromFinanceSheet === "function") {
      try { window.syncDashboardFromFinanceSheet({ silent: true }); } catch (e) {}
    }
  }

  function closeWizard() {
    const overlay = $("onboardingOverlay");
    if (overlay) overlay.classList.add("hidden");
    // Désactive le calque bloquant
    const blocker = $("wizardBlocker");
    if (blocker) blocker.classList.add("hidden");
    document.body.classList.remove("onboarding-active");
  }

  function renderWizardStep() {
    const content = $("wizardContent");
    if (!content) return;

    // Progress dots
    const dotsHtml = [0,1,2,3].map(i => {
      let cls = "wizard-dot";
      if (i < currentStep) cls += " done";
      if (i === currentStep) cls += " active";
      return `<span class="${cls}"></span>`;
    }).join("");

    const progress = $("wizardProgress");
    if (progress) progress.innerHTML = dotsHtml;

    const steps = [
      renderStepConnexion,
      renderStep1,
      renderStep2,
      renderStep4,
    ];

    content.innerHTML = steps[currentStep]();
    wireWizardControls(content);

    // Wire buttons
    const nextBtn = $("wizardNext");
    const prevBtn = $("wizardPrev");
    if (prevBtn) {
      if (currentStep > 0) prevBtn.style.display = "";
      else prevBtn.style.display = "none";
      prevBtn.onclick = () => { if (currentStep > 0) { currentStep--; renderWizardStep(); } };
    }
    if (nextBtn) {
      // Étape 0 (Connexion) : bouton "Plus tard" ou "Suivant" si connecté
      if (currentStep === 0) {
        if (wizardData.authConnected) {
          nextBtn.textContent = "Suivant →";
          nextBtn.classList.remove("wizard-btn-ghost");
          nextBtn.classList.add("wizard-btn-primary");
          nextBtn.onclick = () => { currentStep++; renderWizardStep(); };
        } else {
          nextBtn.textContent = "Plus tard";
          nextBtn.classList.remove("wizard-btn-primary");
          nextBtn.classList.add("wizard-btn-ghost");
          nextBtn.onclick = () => { wizardData.authConnected = false; currentStep++; renderWizardStep(); };
        }
      } else {
        nextBtn.textContent = "Suivant →";
        nextBtn.classList.remove("wizard-btn-ghost");
        nextBtn.classList.add("wizard-btn-primary");
        nextBtn.onclick = () => {
          // Valide les champs obligatoires de l'étape Situation financière (step 1)
          if (currentStep === 1) {
            var stepEl = document.getElementById("wizardContent");
            if (stepEl) {
              var requiredInputs = stepEl.querySelectorAll("input[required]");
              var allValid = true;
              for (var i = 0; i < requiredInputs.length; i++) {
                var inp = requiredInputs[i];
                if (!inp.checkValidity()) {
                  allValid = false;
                  inp.reportValidity();
                  break;
                }
              }
              if (!allValid) return;
            }
            // Conserve explicitement les valeurs avant que le rendu suivant
            // remplace les champs de la situation financière.
            var amountInput = document.getElementById("wbCurrentAmount");
            var monthInput = document.getElementById("wbStartingMonth");
            var accountsInput = document.getElementById("wbAccounts");
            var savingsInput = document.getElementById("wbSavings");
            if (amountInput) wizardData.currentAmount = amountInput.value.trim();
            if (monthInput) wizardData.startingMonth = monthInput.value;
            if (accountsInput) wizardData.accounts = accountsInput.value.trim();
            if (savingsInput) wizardData.savingsGoal = savingsInput.value.trim();
          }
          if (currentStep < 3) { currentStep++; renderWizardStep(); }
          else finishWizard();
        };
      }
    }
  }

  // Événements définis dans le script, jamais dans les attributs HTML (CSP stricte).
  function wireWizardControls(content) {
    const bind = (selector, event, handler) => content.querySelectorAll(selector).forEach(node => node.addEventListener(event, handler));
    bind('[data-onb-auth]', 'click', event => window.onbShowAuth(event.currentTarget.dataset.onbAuth));
    bind('#wbPwToggle', 'click', () => window.onbTogglePw());
    bind('#wbAuthSubmit', 'click', () => window.onbSubmitAuth());
    bind('#wbCurrentAmount', 'input', event => { wizardData.currentAmount = event.currentTarget.value; });
    bind('#wbStartingMonth', 'input', event => { wizardData.startingMonth = event.currentTarget.value; });
    bind('[data-onb-import]', 'click', event => { if (event.target.id !== 'wbImportFile') $('wbImportFile').click(); });
    bind('#wbImportFile', 'change', event => window.onbHandleImport(event.currentTarget));
    bind('[data-onb-empty]', 'click', () => window.onbSkipImport());
    bind('[data-onb-theme]', 'click', event => window.onbSelectTheme(event.currentTarget.dataset.onbTheme));
    bind('[data-onb-mode]', 'click', event => window.onbSelectMode(event.currentTarget.dataset.onbMode));
    bind('[role="button"][tabindex="0"]', 'keydown', event => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); }
    });
    // Valeurs affectées comme propriétés : aucun contenu importé n'est interprété en HTML.
    if ($('wbCurrentAmount')) $('wbCurrentAmount').value = wizardData.currentAmount || '';
    if ($('wbStartingMonth')) $('wbStartingMonth').value = wizardData.startingMonth || new Date().toISOString().slice(0,7);
  }

  // === Étape 0 : Connexion (créer un compte ou se connecter) — en première position ===
  function renderStepConnexion() {
    const d = wizardData;
    return `
      <div class="wizard-step active">
        <h3>Connexion</h3>
        <p class="step-desc">Crée un compte ou connecte-toi pour synchroniser tes données entre appareils et partager avec tes amis.</p>
        <div class="wizard-auth-choices">
          <div class="wizard-auth-choice" role="button" tabindex="0" data-onb-auth="signup">
            <svg viewBox="0 0 24 24" fill="none" width="24" height="24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8.5" cy="7" r="4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 8v6M23 11h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <h4>Créer un compte</h4>
            <p>Email et mot de passe</p>
          </div>
          <div class="wizard-auth-choice" role="button" tabindex="0" data-onb-auth="login">
            <svg viewBox="0 0 24 24" fill="none" width="24" height="24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 17l5-5-5-5M15 12H3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <h4>Se connecter</h4>
            <p>J'ai déjà un compte</p>
          </div>
        </div>
        <div class="wizard-auth-form" id="wizardAuthForm" style="display:none">
          <div class="wizard-field">
            <label>Email</label>
            <input type="email" id="wbAuthEmail" placeholder="toi@exemple.com">
          </div>
          <div class="wizard-field">
            <label>Mot de passe</label>
            <div class="wizard-pw-wrapper">
              <input type="password" id="wbAuthPw" placeholder="Au moins 6 caractères">
              <button type="button" class="wizard-eye-btn" id="wbPwToggle" aria-label="Afficher/masquer le mot de passe">
                <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>
              </button>
            </div>
          </div>
          <button type="button" class="wizard-auth-submit" id="wbAuthSubmit">Continuer</button>
          <p class="wizard-auth-status" id="wbAuthStatus"></p>
        </div>
        <div class="wizard-info-box">
          <strong>Synchronisation :</strong> tes données sont sauvegardées sur le cloud et accessibles depuis tous tes appareils.<br>
          <strong>Amis :</strong> invite tes proches par e-mail pour partager des infos financières.
        </div>
      </div>
    `;
  }

  function renderStep1() {
    const d = wizardData;
    var currentMonth = d.startingMonth || new Date().toISOString().slice(0,7);
    return `
      <div class="wizard-step active">
        <h3>Ton espace, à ton rythme</h3>
        <p class="step-desc">Ajoute un solde de départ maintenant, ou commence avec un tableur vide.</p>
        <div class="wizard-field">
          <label>Solde de départ (€) <span class="optional-mark">facultatif</span></label>
          <input type="number" id="wbCurrentAmount" min="0" step="0.01" inputmode="decimal" placeholder="Ex. 1 000">
          <p class="field-hint">Le montant disponible au début du mois choisi. Il sera ajouté à ton tableur sans modifier les autres données.</p>
        </div>
        <div class="wizard-field">
          <label>Mois du solde de départ</label>
          <input type="month" id="wbStartingMonth" class="wizard-month-input">
        </div>
        <div class="wizard-info-box wizard-start-info">
          <strong>Tout le reste se règle dans le tableur.</strong><br>
          Comptes, lignes, catégories et objectifs d’épargne restent modifiables quand tu le souhaites.
        </div>
        <div class="wizard-mini-list" aria-label="Ce qui est possible">
          <span>✓ Aucun compte imposé</span>
          <span>✓ Aucun objectif obligatoire</span>
          <span>✓ Solde modifiable plus tard</span>
        </div>
      </div>
    `;
  }

  function renderStep2() {
    return `
      <div class="wizard-step active">
        <h3>Import de données</h3>
        <p class="step-desc">Choisis comment démarrer ton tableur.</p>
        <div class="wizard-choice" role="button" tabindex="0" data-onb-import>
          <svg viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 8l-5-5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 3v12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <h4>Importer un fichier Excel</h4>
          <p>Charge un fichier .xlsx depuis ton ordinateur</p>
          <input type="file" id="wbImportFile" accept=".xlsx,.xls" style="display:none">
        </div>
        <div class="wizard-choice" role="button" tabindex="0" data-onb-empty>
          <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/><path d="M3 9h18M9 3v18" stroke="currentColor" stroke-width="2"/></svg>
          <h4>Commencer avec un tableau vide</h4>
          <p>Crée ton tableur de zéro</p>
        </div>
        <div class="wizard-info-box">
          Tu pourras importer un fichier plus tard depuis l'onglet Tableur.
        </div>
      </div>
    `;
  }

  function renderStep4() {
    const d = wizardData;
    return `
      <div class="wizard-step active">
        <h3>Personnalisation</h3>
        <p class="step-desc">Choisis le thème et le mode d'affichage.</p>
        <div class="wizard-theme-grid">
          ${THEMES.map(t => `
            <div class="wizard-theme-card ${d.theme === t.id ? 'selected' : ''}" role="button" tabindex="0" data-onb-theme="${t.id}">
              <div class="wizard-theme-preview" style="background: ${t.preview}"></div>
              <span>${t.name}</span>
            </div>
          `).join("")}
        </div>
        <div class="wizard-field" style="margin-top: 20px;">
          <label>Mode d'affichage</label>
          <div class="mode-segment" role="group" aria-label="Mode d'affichage">
            <button type="button" class="${d.mode === 'light' ? 'is-active' : ''}" data-onb-mode="light">Clair</button>
            <button type="button" class="${d.mode === 'dark' ? 'is-active' : ''}" data-onb-mode="dark">Sombre</button>
          </div>
        </div>
      </div>
    `;
  }

  function finishWizard() {
    // Relit les champs affichés : un clic immédiat sur « Terminer » ne doit
    // jamais faire perdre le dernier montant saisi par l'utilisateur.
    var currentAmountInput = document.getElementById("wbCurrentAmount");
    var startingMonthInput = document.getElementById("wbStartingMonth");
    if (currentAmountInput) wizardData.currentAmount = currentAmountInput.value.trim();
    if (startingMonthInput) wizardData.startingMonth = startingMonthInput.value;
    // Sauvegarde le montant actuel comme solde de départ
    if (wizardData.currentAmount !== "" && wizardData.currentAmount !== null && wizardData.currentAmount !== undefined) {
      wizardData.startingCash = wizardData.currentAmount;
      wizardData.currentCashDate = /^\d{4}-\d{2}$/.test(String(wizardData.startingMonth || ""))
        ? wizardData.startingMonth + "-01"
        : new Date().toISOString().slice(0, 10);
    }
    store(STORAGE.profile, wizardData);
    store(STORAGE.onboarding, true);
    // Apply theme
    if (typeof window.setTheme === "function") {
      window.setTheme(wizardData.theme);
    } else {
      document.body.setAttribute("data-theme", wizardData.theme);
    }
    // Apply mode
    if (typeof window.setMode === "function") {
      window.setMode(wizardData.mode || "dark");
    }
    closeWizard();
    // Nettoie le tableur seulement si aucun fichier n'a été importé
    if (wizardData.clearOnFinish && !wizardData.importedFile) {
      clearSpreadsheetData();
    }
    // Si un fichier a été importé, s'assurer qu'il est sauvegardé
    if (wizardData.importedFile && typeof window.FinanceSheet !== "undefined" && window.FinanceSheet.saveNow) {
      try { window.FinanceSheet.saveNow(); } catch (e) {}
    }
    // Les comptes et le solde saisis à l'étape « Situation financière »
    // deviennent des lignes du vrai tableur, y compris après un import.
    if (typeof window.FinanceSheet !== "undefined" && typeof window.FinanceSheet.applySetupProfile === "function") {
      try { window.FinanceSheet.applySetupProfile(wizardData); } catch (e) { console.warn("Impossible d’ajouter le profil au tableur", e); }
    }
    // Retour à la page d'accueil
    if (typeof window.setPage === "function") window.setPage("dashboard");
    // Les cartes du tableau de bord lisent le profil qui vient d'être enregistré.
    if (typeof window.FinanceSheet !== "undefined" && typeof window.FinanceSheet.updateSheetBalanceCards === "function") {
      try { window.FinanceSheet.updateSheetBalanceCards(); } catch (e) {}
    }
    // Start tutorial
    setTimeout(() => startTutorial(), 600);
  }

  // === Import handlers ===
  window.onbHandleImport = async function(input) {
    if (input.files && input.files[0]) {
      var file = input.files[0];
      try {
        // Le même importeur alimente désormais le tableur ET le dashboard :
        // aucune donnée n'est perdue lorsque le tutoriel se ferme.
        if (window.FinanceSheet && typeof window.FinanceSheet.importXlsx === "function") {
          var imported = await window.FinanceSheet.importXlsx(file, { mode: "replace", silent: true });
          if (!imported) return;
        } else if (typeof window.importFinanceFile === "function") {
          await window.importFinanceFile(file);
        } else {
          return;
        }
        wizardData.importedFile = true;
        store(STORAGE.profile, wizardData);
      } catch (e) {
        console.error("Erreur d'import pendant la configuration", e);
      }
    }
  };
  window.onbSkipImport = function() {
    // Just continue to next step
    if (currentStep < 3) { currentStep++; renderWizardStep(); }
  };

  // === Auth (email + mot de passe via Supabase) ===
  var authMode = "login";
  window.onbShowAuth = function(mode) {
    authMode = mode;
    var form = document.getElementById("wizardAuthForm");
    if (form) form.style.display = "";
    var submit = document.getElementById("wbAuthSubmit");
    if (submit) submit.textContent = mode === "signup" ? "Créer mon compte" : "Se connecter";
    var emailInput = document.getElementById("wbAuthEmail");
    if (emailInput) emailInput.focus();
  };

  function authErrorMessage(error) {
    var message = (error && error.message) || String(error || "");
    if (/invalid login credentials/i.test(message)) return "Email ou mot de passe incorrect.";
    if (/email not confirmed/i.test(message)) return "Confirme d'abord ton adresse email, puis reconnecte-toi.";
    if (/user already registered/i.test(message)) return "Un compte existe déjà avec cet email. Connecte-toi.";
    if (/password should be at least/i.test(message)) return "Le mot de passe doit comporter au moins 8 caractères.";
    return message || "Une erreur est survenue. Réessaie dans un instant.";
  }

  async function continueAfterSuccessfulAuth(statusEl) {
    if (wizardData.authRestoring) return;
    wizardData.authRestoring = true;
    wizardData.authConnected = true;
    if (statusEl) statusEl.textContent = "Connexion réussie — récupération de tes données…";
    // Un ancien compte ne doit jamais repartir dans le questionnaire : il peut
    // déjà posséder un snapshot complet dans le cloud, même sur un nouvel appareil.
    for (var attempt = 0; attempt < 3; attempt++) {
      if (window.__gfSync && window.__gfSync.pullFromCloud) {
        var pulled = await window.__gfSync.pullFromCloud();
        if (pulled) {
          store(STORAGE.onboarding, true);
          var overlay = $("onboardingOverlay"), blocker = $("wizardBlocker");
          if (overlay) overlay.classList.add("hidden");
          if (blocker) blocker.classList.add("hidden");
          document.body.classList.remove("onboarding-active");
          if (typeof window.setPage === "function") window.setPage("dashboard");
          return;
        }
      }
      await wait(500);
    }
    if (statusEl) statusEl.textContent = "Connecté ! Passage à la configuration…";
    setTimeout(function() { startWizard(false); }, 250);
  }

  window.onbSubmitAuth = function() {
    var email = (document.getElementById("wbAuthEmail").value || "").trim();
    var pw = document.getElementById("wbAuthPw").value || "";
    var statusEl = document.getElementById("wbAuthStatus");
    if (!email || !pw) { if (statusEl) statusEl.textContent = "Renseigne un email et un mot de passe."; return; }
    if (pw.length < 8) { if (statusEl) statusEl.textContent = "Le mot de passe doit comporter au moins 8 caractères."; return; }
    if (statusEl) { statusEl.textContent = authMode === "signup" ? "Création du compte..." : "Connexion..."; }
    var submitBtn = document.getElementById("wbAuthSubmit");
    if (submitBtn) submitBtn.disabled = true;
    var sb = window.__account && window.__account.client;
    if (!sb) {
      if (statusEl) statusEl.textContent = "Service non disponible. Tu peux te connecter plus tard dans les Paramètres.";
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    var redirectUrl = window.location.origin + window.location.pathname;
    if (authMode === "signup") {
      sb.auth.signUp({ email: email, password: pw, options: { emailRedirectTo: redirectUrl } }).then(function(res) {
        if (res.error) { if (statusEl) statusEl.textContent = authErrorMessage(res.error); if (submitBtn) submitBtn.disabled = false; return; }
        if (res.data.session) {
          // Définit l'utilisateur et notifie les autres modules
          if (res.data.session.user) window.__account.user = res.data.session.user;
          window.dispatchEvent(new CustomEvent("authStateChanged", { detail: { user: window.__account.user, event: "SIGNED_IN" } }));
          if (submitBtn) submitBtn.disabled = false;
          continueAfterSuccessfulAuth(statusEl);
        } else {
          if (statusEl) statusEl.textContent = "Un lien sécurisé vient d’être envoyé. Ouvre-le pour confirmer ton adresse ; tu reviendras ensuite connecté.";
          if (submitBtn) submitBtn.disabled = false;
        }
      }).catch(function(e) {
        if (statusEl) statusEl.textContent = authErrorMessage(e);
        if (submitBtn) submitBtn.disabled = false;
      });
    } else {
      sb.auth.signInWithPassword({ email: email, password: pw }).then(function(res) {
        if (res.error) { if (statusEl) statusEl.textContent = authErrorMessage(res.error); if (submitBtn) submitBtn.disabled = false; return; }
        // Définit l'utilisateur et notifie les autres modules
        if (res.data.session && res.data.session.user) window.__account.user = res.data.session.user;
        window.dispatchEvent(new CustomEvent("authStateChanged", { detail: { user: window.__account.user, event: "SIGNED_IN" } }));
        if (submitBtn) submitBtn.disabled = false;
        continueAfterSuccessfulAuth(statusEl);
      }).catch(function(e) {
        if (statusEl) statusEl.textContent = authErrorMessage(e);
        if (submitBtn) submitBtn.disabled = false;
      });
    }
  };

  window.onbSkipAuth = function() {
    wizardData.authConnected = false;
    startWizard(false);
  };

  // === Eye toggle for password ===
  window.onbTogglePw = function() {
    var pwInput = document.getElementById("wbAuthPw");
    var toggleBtn = document.getElementById("wbPwToggle");
    if (!pwInput || !toggleBtn) return;
    if (pwInput.type === "password") {
      pwInput.type = "text";
      toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    } else {
      pwInput.type = "password";
      toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>';
    }
  };

  // === Theme selection ===
  window.onbSelectTheme = function(themeId) {
    wizardData.theme = themeId;
    if (typeof window.setTheme === "function") window.setTheme(themeId);
    else document.body.setAttribute("data-theme", themeId);
    renderWizardStep();
  };
  window.onbSelectMode = function(mode) {
    wizardData.mode = mode;
    if (typeof window.setMode === "function") window.setMode(mode);
    renderWizardStep();
  };

  // Expose wizardData globally for inline handlers
  Object.defineProperty(window, "wizardData", { get: () => wizardData });

  // === Tutoriel ===
  const TUTORIAL_STEPS = [
    {
      title: "Ton solde",
      text: "Ton solde et son évolution sur l’année. Touche un mois pour l’afficher.",
      target: "#gfhHome .gfh-card",
      action: "Suivant",
      page: "dashboard",
    },
    {
      title: "Ajouter en un geste",
      text: "Ajoute une dépense, un revenu ou de l’épargne sans ouvrir le tableur.",
      target: "#gfhHome .gfh-add",
      action: "Suivant",
      page: "dashboard",
    },
    {
      title: "Ton mois en détail",
      text: "Ici : où part ton argent, tes dépenses fixes et tes objectifs. Au début, charge un exemple ou ouvre le tableur.",
      target: "#gfhHome .gfh-right",
      action: "Suivant",
      page: "dashboard",
    },
    {
      title: "Onglet Tableur",
      text: "Le tableur est la source de tout : chaque montant saisi met l’accueil à jour.",
      target: ".studio-sidebar-nav [data-page='sheet'], .desktop-nav [data-page='sheet'], .bottom-nav [data-page='sheet']",
      action: "Aller au Tableur",
      navigateTo: "sheet",
      page: "dashboard",
    },
    {
      title: "Une feuille = une année",
      text: "Choisis l’année ici, ajoute la précédente ou la suivante avec +. Les mois sont en colonnes, tes lignes à gauche.",
      target: "#sheetPage .sheet-years",
      action: "Suivant",
      ensureVisible: true,
      page: "sheet",
    },
    {
      title: "Mon espace",
      text: "Tes objectifs, le partage avec tes proches et les nouveautés de Meuniance.",
      // Menu latéral sur ordinateur : Mon espace y est découpé en trois rubriques.
      textFor: { ".studio-sidebar-nav [data-page='sharing']": "Mon espace est dans ce menu : Objectifs, Partage et amis, Nouveautés." },
      target: ".bottom-nav #personalNavButton, .desktop-nav [data-space='1'], .studio-sidebar-nav [data-page='sharing']",
      action: "Suivant",
      page: "sheet",
    },
    {
      title: "Paramètres",
      text: "L’engrenage : ton compte, l’apparence, les notifications et tes données.",
      textFor: { ".studio-sidebar-nav [data-page='settings']": "Paramètres : ton compte, l’apparence, les notifications et tes données." },
      target: ".app-header .mobile-settings-button, .studio-sidebar-nav [data-page='settings']",
      action: "Terminer",
      isLast: true,
    },
  ];

  let tutorialIndex = 0;

  function startTutorial() {
    tutorialIndex = 0;
    const overlay = $("tutorialOverlay");
    if (!overlay) return;
    document.body.classList.add("tutorial-active");
    overlay.classList.remove("hidden");
    // Active le calque bloquant
    const blocker = $("tutorialBlocker");
    if (blocker) blocker.classList.remove("hidden");
    // Sync le dashboard pour afficher le graphique avec les données démo ou importées
    if (typeof window.syncDashboardFromFinanceSheet === "function") {
      try { window.syncDashboardFromFinanceSheet({ silent: true }); } catch (e) {}
    }
    renderTutorialStep();
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && document.body.classList.contains("tutorial-active")) { var skip = $("tutorialSkip"); if (skip) skip.click(); }
  });

  function closeTutorial() {
    const overlay = $("tutorialOverlay");
    if (overlay) overlay.classList.add("hidden");
    // Désactive le calque bloquant — le site redevient cliquable
    const blocker = $("tutorialBlocker");
    if (blocker) blocker.classList.add("hidden");
    document.body.classList.remove("tutorial-active");
    store(STORAGE.tutorial, true);
    // Nettoie les références pour arrêter le repositionnement au scroll
    currentTutorialTarget = null;
    currentTutorialStep = null;
    currentTutorialOverlay = null;
    // Restaurer le hidden sur les éléments qu'on a rendus visibles pendant le tutoriel
    restoreHiddenElements();
    // Si un fichier a été importé, re-sync le dashboard avec les données réelles
    if (wizardData.importedFile && typeof window.syncDashboardFromFinanceSheet === "function") {
      try { window.syncDashboardFromFinanceSheet({ silent: true }); } catch (e) {}
    }
    setTimeout(function(){ if (typeof window.showLatestUpdate === "function") window.showLatestUpdate(); }, 250);
  }

  // Liste des éléments qu'on a rendus visibles pendant le tutoriel
  var madeVisibleElements = [];

  function restoreHiddenElements() {
    madeVisibleElements.forEach(function(el) {
      if (el && el.parentNode) {
        el.setAttribute("hidden", "");
        el.style.display = "";
      }
    });
    madeVisibleElements = [];
  }

  function renderTutorialStep() {
    const overlay = $("tutorialOverlay");
    if (!overlay) return;

    const step = TUTORIAL_STEPS[tutorialIndex];
    if (!step) { closeTutorial(); return; }

    // Find target element — support multiple selectors, pick the first VISIBLE one with meaningful size
    var target = null;
    var studioMobile = document.body.dataset.interface === "studio" && window.innerWidth <= 780;
    var selectors = (studioMobile && step.navigateTo === "sheet" ? ".studio-mobile-menu-button" : studioMobile && step.isLast ? ".studio-mobile-menu-button" : step.target).split(",");
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i].trim());
      if (!el) continue;
      var r = el.getBoundingClientRect();
      var style = getComputedStyle(el);
      // Ne jamais guider vers un bouton masqué, inerte ou sorti de l'écran.
      if (r.width > 20 && r.height > 20 && r.right > 0 && r.left < window.innerWidth && style.display !== "none" && style.visibility !== "hidden" && !el.closest("[hidden], [inert]")) {
        target = el;
        step._matched = selectors[i].trim();
        break;
      }
    }
    if (!target) {
      tutorialIndex++;
      if (tutorialIndex < TUTORIAL_STEPS.length) renderTutorialStep();
      else closeTutorial();
      return;
    }

    // Rendre visible si nécessaire (enlever le hidden)
    if (step.ensureVisible && target.hasAttribute("hidden")) {
      target.removeAttribute("hidden");
      target.style.display = "block";
      madeVisibleElements.push(target);
    }

    // La bulle est construite d'abord : sa hauteur décide de la place laissée à l'élément expliqué
    step._rescrolled = false;
    buildTutorialTooltip(overlay, step);
    scrollTutorialTarget(target, overlay);
    setTimeout(function() {
      positionTutorialElements(overlay, target, step);
    }, 380);
  }

  // Variable pour stocker la cible courante et la repositionner au scroll
  var currentTutorialTarget = null;
  var currentTutorialStep = null;
  var currentTutorialOverlay = null;

  function tutorialNavHeight() {
    var nav = document.querySelector(".bottom-nav");
    if (!nav || !nav.getClientRects().length) return 0;
    var r = nav.getBoundingClientRect();
    return r.top < window.innerHeight ? window.innerHeight - r.top : 0;
  }
  function tutorialDocked() { return window.innerWidth <= 560; }
  function tutorialEn() { return !!(window.GFI18n && typeof window.GFI18n.getLanguage === "function" && window.GFI18n.getLanguage() === "en"); }
  // Sur téléphone, la bulle est ancrée en bas (au-dessus de la barre de navigation)
  function tutorialTooltipTop(tooltip) {
    return window.innerHeight - tutorialNavHeight() - 12 - tooltip.offsetHeight;
  }
  function tutorialIsInNav(target) { return !!(target && target.closest && target.closest(".bottom-nav")); }

  function buildTutorialTooltip(overlay, step) {
    var tooltip = overlay.querySelector(".tutorial-tooltip");
    if (!tooltip) {
      tooltip = create("div", "tutorial-tooltip");
      tooltip.setAttribute("role", "dialog");
      tooltip.setAttribute("aria-live", "polite");
      overlay.appendChild(tooltip);
    }
    var total = TUTORIAL_STEPS.length;
    var dotsHtml = TUTORIAL_STEPS.map(function(_, i) {
      var cls = "tutorial-progress-dot";
      if (i < tutorialIndex) cls += " done";
      if (i === tutorialIndex) cls += " active";
      return '<span class="' + cls + '"></span>';
    }).join("");
    var text = document.body.dataset.interface === "studio" && window.innerWidth <= 780 && step.isLast ? "Ouvre la navigation pour retrouver ton profil et les réglages." : (step.textFor && step._matched && step.textFor[step._matched]) || step.text;
    tooltip.innerHTML =
      '<div class="tutorial-head"><span class="tutorial-count">' + (tutorialEn() ? 'Step ' + (tutorialIndex + 1) + ' of ' + total : 'Étape ' + (tutorialIndex + 1) + ' sur ' + total) + '</span>' +
      '<button class="tutorial-skip" id="tutorialSkip" type="button" aria-label="' + (tutorialEn() ? 'Close the tour' : 'Fermer le tutoriel') + '">×</button></div>' +
      '<h4 id="tutorialTitle">' + step.title + '</h4>' +
      '<p>' + text + '</p>' +
      '<div class="tutorial-foot"><div class="tutorial-progress" aria-hidden="true">' + dotsHtml + '</div>' +
      '<div class="tutorial-actions">' + (tutorialIndex > 0 ? '<button class="tutorial-back" id="tutorialBack" type="button">Précédent</button>' : '') +
      '<button class="tutorial-btn" id="tutorialNext" type="button">' + step.action + '</button></div></div>';
    tooltip.setAttribute("aria-labelledby", "tutorialTitle");
    if (window.GFI18n && typeof window.GFI18n.apply === "function") { try { window.GFI18n.apply(tooltip); } catch (e) {} }
    var tooltipWidth = tutorialDocked() ? window.innerWidth - 24 : Math.min(360, window.innerWidth - 40);
    tooltip.style.width = tooltipWidth + "px";
    wireTutorialButtons(step);
    return tooltip;
  }

  // Fait défiler pour que l'élément soit centré dans la zone laissée libre par la bulle
  function scrollTutorialTarget(target, overlay) {
    if (tutorialIsInNav(target)) return;
    var tooltip = overlay.querySelector(".tutorial-tooltip");
    var rect = target.getBoundingClientRect();
    var areaTop = 16, areaBottom = tutorialDocked() && tooltip ? tutorialTooltipTop(tooltip) - 16 : window.innerHeight - tutorialNavHeight() - 16;
    var room = areaBottom - areaTop;
    var offset = rect.height >= room ? areaTop : areaTop + (room - rect.height) / 2;
    var body = document.body;
    // Page verrouillée pendant le tutoriel (body en position fixe) : on déplace le décalage du verrou
    if (getComputedStyle(body).position === "fixed") {
      var current = -(parseFloat(body.style.top) || 0);
      var max = Math.max(0, body.scrollHeight - window.innerHeight + tutorialNavHeight());
      var next = Math.max(0, Math.min(max, current + rect.top - offset));
      body.style.transition = "top .35s cubic-bezier(.2,.8,.2,1)";
      body.style.top = (-next) + "px";
      setTimeout(function () { body.style.transition = ""; }, 400);
      return;
    }
    var y = window.scrollY + rect.top - offset;
    try { window.scrollTo({ top: Math.max(0, y), behavior: "smooth" }); } catch (e) { window.scrollTo(0, Math.max(0, y)); }
  }

  function positionTutorialElements(overlay, target, step) {
    if ((!target || !target.isConnected) && step && step.target) { var fresh = Array.prototype.find.call(document.querySelectorAll(step.target), function (n) { return n.getClientRects().length; }); if (fresh) target = fresh; }
    currentTutorialTarget = target;
    currentTutorialStep = step;
    currentTutorialOverlay = overlay;

    var tooltip = overlay.querySelector(".tutorial-tooltip") || buildTutorialTooltip(overlay, step);
    var rect = target.getBoundingClientRect();
    var padding = 6;
    var docked = tutorialDocked();
    var tooltipTop = docked ? tutorialTooltipTop(tooltip) : 0;
    // Au démarrage, la page se verrouille pendant le premier défilement et l'annule : si l'élément
    // n'est pas entièrement visible au-dessus de la bulle, on refait défiler une fois.
    var limit = docked ? tooltipTop - 10 : window.innerHeight - tutorialNavHeight() - 10;
    if (!tutorialIsInNav(target) && !step._rescrolled && rect.height < limit - 16 && (rect.top < 8 || rect.bottom > limit)) {
      step._rescrolled = true;
      scrollTutorialTarget(target, overlay);
      setTimeout(function () { positionTutorialElements(overlay, target, step); }, 420);
      return;
    }

    // Zone éclairée : l'élément, coupé à la place disponible pour ne jamais passer sous la bulle
    var top = rect.top - padding, bottom = rect.bottom + padding;
    if (docked && !tutorialIsInNav(target)) bottom = Math.min(bottom, tooltipTop - 10);
    var spotlight = overlay.querySelector(".tutorial-spotlight");
    if (!spotlight) {
      spotlight = create("div", "tutorial-spotlight");
      overlay.insertBefore(spotlight, overlay.firstChild);
    }
    var radius = parseFloat(getComputedStyle(target).borderTopLeftRadius) || 12;
    spotlight.style.top = top + "px";
    spotlight.style.left = (rect.left - padding) + "px";
    spotlight.style.width = (rect.width + padding * 2) + "px";
    spotlight.style.height = Math.max(24, bottom - top) + "px";
    spotlight.style.borderRadius = (radius + padding) + "px";

    // Bulle : ancrée en bas sur téléphone, sinon sous (ou au-dessus de) l'élément
    if (docked) {
      tooltip.style.left = "12px";
      tooltip.style.top = tooltipTop + "px";
    } else {
      // Dessous, sinon dessus, sinon à droite, sinon à gauche de l'élément ; jamais par-dessus.
      var tw = tooltip.offsetWidth, th = tooltip.offsetHeight, W = window.innerWidth, H = window.innerHeight;
      var centeredLeft = Math.max(20, Math.min(W - tw - 20, rect.left + rect.width / 2 - tw / 2));
      var sideTop = Math.max(16, Math.min(H - th - 16, rect.top + rect.height / 2 - th / 2));
      var below = rect.bottom + padding + 14, above = rect.top - th - padding - 14;
      var right = rect.right + padding + 14, left = rect.left - tw - padding - 14;
      var place;
      if (below + th <= H - 16) place = [centeredLeft, below];
      else if (above >= 16) place = [centeredLeft, above];
      else if (right + tw <= W - 16) place = [right, sideTop];
      else if (left >= 16) place = [left, sideTop];
      else {
        // Élément trop grand de tous côtés : bulle en bas à droite, zone éclairée coupée au-dessus d'elle.
        place = [W - tw - 20, H - th - 16];
        spotlight.style.height = Math.max(24, Math.min(bottom, place[1] - 10) - top) + "px";
      }
      tooltip.style.left = place[0] + "px";
      tooltip.style.top = place[1] + "px";
    }
    tooltip.classList.add("is-placed");
  }

  function wireTutorialButtons(step) {
    var nextBtn = $("tutorialNext");
    var backBtn = $("tutorialBack");
    var skipBtn = $("tutorialSkip");
    if (nextBtn) {
      nextBtn.onclick = function() {
        // Restaurer le hidden avant de changer d'étape
        restoreHiddenElements();
        if (step.navigateTo) {
          if (typeof window.setPage === "function") window.setPage(step.navigateTo);
          else {
            var selectors = step.target.split(",");
            for (var s = 0; s < selectors.length; s++) {
              var navBtn = document.querySelector(selectors[s].trim());
              if (navBtn) { navBtn.click(); break; }
            }
          }
          setTimeout(function() { tutorialIndex++; renderTutorialStep(); }, 500);
        } else if (step.isLast) {
          closeTutorial();
          // Fin du tutoriel : retour à l'accueil, en haut
          if (typeof window.setPage === "function") window.setPage("dashboard");
          try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { window.scrollTo(0, 0); }
        } else {
          tutorialIndex++;
          renderTutorialStep();
        }
      };
      // Focus clavier seulement avec souris/clavier : sur écran tactile il dessinerait un contour inutile
      if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) { try { nextBtn.focus({ preventScroll: true }); } catch (e) {} }
    }
    if (backBtn) {
      backBtn.onclick = function() {
        restoreHiddenElements();
        tutorialIndex = Math.max(0, tutorialIndex - 1);
        var prev = TUTORIAL_STEPS[tutorialIndex];
        if (prev && prev.page && document.body.dataset.page !== prev.page && typeof window.setPage === "function") {
          window.setPage(prev.page);
          setTimeout(renderTutorialStep, 500);
        } else renderTutorialStep();
      };
    }
    if (skipBtn) {
      skipBtn.onclick = function() {
        closeTutorial();
        if (typeof window.setPage === "function" && document.body.dataset.page !== "dashboard") window.setPage("dashboard");
      };
    }
  }

  // Repositionne le tutoriel au scroll/resize
  function onTutorialScroll() {
    if (currentTutorialTarget && currentTutorialStep && currentTutorialOverlay) {
      var rect = currentTutorialTarget.getBoundingClientRect();
      // Si la cible est hors de l'écran, repositionner
      positionTutorialElements(currentTutorialOverlay, currentTutorialTarget, currentTutorialStep);
    }
  }

  // Throttle pour éviter trop de repositionnement
  var scrollThrottleTimer = null;
  function onTutorialScrollThrottled() {
    if (scrollThrottleTimer) return;
    scrollThrottleTimer = setTimeout(function() {
      scrollThrottleTimer = null;
      onTutorialScroll();
    }, 100);
  }

  // === Admin: restart onboarding avec confirmation ===
  function restartOnboarding() {
    // Affiche une modal de confirmation
    showConfirmModal(
      "Réinitialiser le compte ?",
      "Tu seras déconnecté et la copie locale de cet espace sera effacée sur cet appareil. Les données déjà synchronisées dans ton compte restent disponibles. Le tutoriel recommencera.",
      "Réinitialiser le compte",
      async function() {
        // Le compte distant reste intact. Seule sa copie sur cet appareil est effacée.
        var previousOwner = window.__account && window.__account.user && window.__account.user.id;
        var sb = window.__account && window.__account.client;
        if (previousOwner && sb) {
          try { if (window.GFReminders && window.GFReminders.forgetDevice) await window.GFReminders.forgetDevice(); } catch(e) {}
          try {
            var result = await sb.auth.signOut();
            if (result && result.error) throw result.error;
          } catch(e) {
            alert("La déconnexion a échoué. Tes données locales n'ont pas été effacées.");
            return;
          }
          window.__account.user = null;
          window.dispatchEvent(new CustomEvent("authStateChanged", { detail: { user: null, event: "SIGNED_OUT" } }));
          if (safeStore.clearFinancialOwnerData) safeStore.clearFinancialOwnerData(previousOwner);
        }
        // Nettoie tout
        del(STORAGE.onboarding);
        del(STORAGE.tutorial);
        del(STORAGE.profile);
        del(STORAGE.friendCode);
        clearSpreadsheetData();
        // Va à la page d'accueil
        if (typeof window.setPage === "function") window.setPage("dashboard");
        else {
          var nav = document.querySelector('[data-nav="dashboard"]');
          if (nav) nav.click();
        }
        // Démarre le wizard avec nettoyage
        setTimeout(function() { startWizard(true); }, 300);
      }
    );
  }

  // === Modal de confirmation générique ===
  function showConfirmModal(title, message, confirmLabel, onConfirm) {
    // Crée l'overlay
    var modal = document.createElement("div");
    modal.className = "onboarding-overlay";
    modal.style.zIndex = "100000";
    modal.innerHTML = 
      '<div class="wizard-card" style="max-width: 420px; text-align: center;">' +
      '<h2 style="margin-bottom: 12px;">' + title + '</h2>' +
      '<p style="color: var(--text-muted, #9ca3af); margin-bottom: 24px; line-height: 1.6;">' + message + '</p>' +
      '<div class="wizard-buttons" style="justify-content: center; gap: 12px;">' +
      '<button class="wizard-btn wizard-btn-ghost" id="confirmCancel">Annuler</button>' +
      '<button class="wizard-btn wizard-btn-primary" id="confirmOk" style="background: linear-gradient(135deg, #ef4444, #dc2626);">' + confirmLabel + '</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(modal);

    // Wire buttons
    document.getElementById("confirmCancel").onclick = function() {
      document.body.removeChild(modal);
    };
    document.getElementById("confirmOk").onclick = function() {
      document.body.removeChild(modal);
      if (onConfirm) onConfirm();
    };
  }

  // === Init ===
  function init() {
    // Create overlay elements if they don't exist
    if (!$("onboardingOverlay")) {
      const overlay = create("div", "onboarding-overlay hidden");
      overlay.id = "onboardingOverlay";
      overlay.innerHTML = `
        <div class="wizard-card">
          <div class="wizard-header">
            <h2>Bienvenue sur Meuniance</h2>
            <p>Configurons ton tableau de bord en quelques étapes.</p>
          </div>
          <div class="wizard-progress" id="wizardProgress"></div>
          <div id="wizardContent"></div>
          <div class="wizard-buttons">
            <button class="wizard-btn wizard-btn-ghost" id="wizardPrev">← Retour</button>
            <button class="wizard-btn wizard-btn-primary" id="wizardNext">Suivant →</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    if (!$("tutorialOverlay")) {
      const tutOverlay = create("div", "tutorial-overlay hidden");
      tutOverlay.id = "tutorialOverlay";
      document.body.appendChild(tutOverlay);
    }

    // Calque bloquant pour empêcher les clics sur le site pendant le wizard
    if (!$("wizardBlocker")) {
      const wizBlocker = create("div", "wizard-blocker hidden");
      wizBlocker.id = "wizardBlocker";
      document.body.appendChild(wizBlocker);
    }

    // Calque bloquant pour empêcher les clics sur le site pendant le tutoriel
    if (!$("tutorialBlocker")) {
      const blocker = create("div", "tutorial-blocker hidden");
      blocker.id = "tutorialBlocker";
      document.body.appendChild(blocker);
    }

    // Check if onboarding should show
    if (shouldShowOnboarding()) setTimeout(restoreCloudBeforeOnboarding, 700);
    window.addEventListener("authStateChanged", function(event) {
      if (event.detail && event.detail.user && shouldShowOnboarding() && !$("onboardingOverlay")?.classList.contains("hidden")) {
        continueAfterSuccessfulAuth($("wbAuthStatus"));
      }
    });

    // Event listeners pour repositionner le tutoriel au scroll/resize
    window.addEventListener("scroll", onTutorialScrollThrottled, true);
    window.addEventListener("resize", onTutorialScrollThrottled);

    // Add reset button to settings
    const settingsPage = $("settingsPage");
    if (settingsPage) {
      const resetBtn = $("settingsResetBtn");
      if (resetBtn) {
        resetBtn.onclick = restartOnboarding;
      }
      const deleteBtn = $("settingsDeleteBtn");
      if (deleteBtn) {
        deleteBtn.onclick = deleteAccount;
      }
    }
  }

  // === Suppression définitive du compte Supabase ===
  function deleteAccount() {
    showConfirmModal(
      "Supprimer définitivement le compte ?",
      "Attention : ton compte sera définitivement supprimé du cloud, ainsi que toutes les données associées (amis, permissions, sauvegardes). Cette action est IRRÉVERSIBLE. Tes données locales seront aussi effacées.",
      "Supprimer définitivement",
      async function() {
        try {
          var sb = window.__account && window.__account.client;
          if (sb && window.__account.user) {
            // La clé service Supabase ne doit jamais être exposée au navigateur :
            // la fonction Edge vérifie le JWT puis supprime auth.users côté serveur.
            var result = await sb.functions.invoke("delete-account");
            if (result.error) {
              alert(window.GFI18n?window.GFI18n.t("La suppression du compte a échoué. Vérifie que la fonction Supabase « delete-account » est déployée."):"La suppression du compte a échoué. Vérifie que la fonction Supabase « delete-account » est déployée.");
              return;
            }
            window.__account.user = null;
            window.dispatchEvent(new CustomEvent("authStateChanged", { detail: { user: null, event: "SIGNED_OUT" } }));
          }
        } catch(e) {
          alert(window.GFI18n?window.GFI18n.t("La suppression du compte a échoué. Réessaie plus tard."):"La suppression du compte a échoué. Réessaie plus tard.");
          return;
        }
        // Nettoie tout en local
        del(STORAGE.onboarding);
        del(STORAGE.tutorial);
        del(STORAGE.profile);
        del(STORAGE.friendCode);
        clearSpreadsheetData();
        // Va à la page d'accueil
        if (typeof window.setPage === "function") window.setPage("dashboard");
        else {
          var nav = document.querySelector('[data-nav="dashboard"]');
          if (nav) nav.click();
        }
        // Démarre le wizard avec nettoyage
        setTimeout(function() { startWizard(true); }, 300);
      }
    );
  }

  // Expose globally
  window.Onboarding = {
    startWizard,
    startTutorial,
    restartOnboarding,
    shouldShowOnboarding,
  };

  // Init on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
