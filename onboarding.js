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
    { id: "glass", name: "Glass", preview: "linear-gradient(135deg,#1e1b4b,#312e81,#1e1b4b)" },
    { id: "editorial", name: "Éditorial", preview: "linear-gradient(135deg,#2a1a0e,#4a3220,#2a1a0e)" },
    { id: "brutal", name: "Brutal", preview: "linear-gradient(135deg,#0a0a0a,#1a1a1a,#0a0a0a)" },
  ];

  let currentStep = 0;
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

  function startWizard(clearData) {
    currentStep = 0;
    wizardData = { startingCash: "", accounts: "", incomeAmount: "", incomeFreq: "mensuel", expenses: "", savingsGoal: "", theme: "glass", mode: "dark", startingMonth: "", currentAmount: "" };

    // Vider le tableur si demandé (bouton admin ou premier lancement)
    if (clearData) {
      clearSpreadsheetData();
    }

    const overlay = $("onboardingOverlay");
    if (!overlay) return;
    overlay.classList.remove("hidden");
    // Active le calque bloquant pendant le wizard
    const blocker = $("wizardBlocker");
    if (blocker) blocker.classList.remove("hidden");
    renderWizardStep();
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

  // === Données démo pour le tutoriel (non persistées) ===
  var demoDataInjected = false;

  function injectDemoData() {
    if (demoDataInjected) return;
    demoDataInjected = true;
    if (typeof window.FinanceSheet === "undefined" || !window.FinanceSheet.loadDemoData) return;

    try {
      window.FinanceSheet.loadDemoData({
        headers: ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin"],
        rowHeaders: ["Salaire", "Loyer", "Courses", "Revolut", "Épargne"],
        values: [
          [1650, -750, -320, -180, 256],
          [1650, -750, -280, -150, 300],
          [1700, -750, -350, -200, 350],
          [1700, -750, -300, -180, 400],
          [1700, -750, -290, -160, 380],
          [1750, -780, -310, -190, 420],
        ]
      });
      // NE PAS appeler syncDashboardFromFinanceSheet — les données démo ne doivent pas polluer le dashboard
    } catch (e) {}
  }

  function clearDemoData() {
    demoDataInjected = false;
    // 1. Vide le FinanceSheet sans notifier le dashboard
    if (typeof window.FinanceSheet !== "undefined" && window.FinanceSheet.clearDemoDataFS) {
      try { window.FinanceSheet.clearDemoDataFS({ notify: false }); } catch (e) {}
    }
    // 2. Vide l'état interne du dashboard (catégories, mois, pages)
    try { window.dispatchEvent(new CustomEvent("financeClearData")); } catch (e) {}
    // 3. Retour à la page d'accueil
    if (typeof window.setPage === "function") {
      try { window.setPage("dashboard"); } catch (e) {}
    }
  }

  function closeWizard() {
    const overlay = $("onboardingOverlay");
    if (overlay) overlay.classList.add("hidden");
    // Désactive le calque bloquant
    const blocker = $("wizardBlocker");
    if (blocker) blocker.classList.add("hidden");
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
          }
          if (currentStep < 3) { currentStep++; renderWizardStep(); }
          else finishWizard();
        };
      }
    }
  }

  // === Étape 0 : Connexion (créer un compte ou se connecter) — en première position ===
  function renderStepConnexion() {
    const d = wizardData;
    return `
      <div class="wizard-step active">
        <h3>Connexion</h3>
        <p class="step-desc">Crée un compte ou connecte-toi pour synchroniser tes données entre appareils et partager avec tes amis.</p>
        <div class="wizard-auth-choices">
          <div class="wizard-auth-choice" onclick="window.onbShowAuth('signup')">
            <svg viewBox="0 0 24 24" fill="none" width="24" height="24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8.5" cy="7" r="4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 8v6M23 11h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <h4>Créer un compte</h4>
            <p>Email et mot de passe</p>
          </div>
          <div class="wizard-auth-choice" onclick="window.onbShowAuth('login')">
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
              <button type="button" class="wizard-eye-btn" id="wbPwToggle" onclick="window.onbTogglePw()" aria-label="Afficher/masquer le mot de passe">
                <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>
              </button>
            </div>
          </div>
          <button class="wizard-auth-submit" id="wbAuthSubmit" onclick="window.onbSubmitAuth()">Continuer</button>
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
        <h3>Situation financière</h3>
        <p class="step-desc">Quelques informations pour personnaliser ton tableau de bord.</p>
        <div class="wizard-field">
          <label>Mois de départ <span class="required-mark">*</span></label>
          <input type="month" id="wbStartingMonth" required value="${currentMonth}" oninput="wizardData.startingMonth=this.value" class="wizard-month-input">
          <p class="field-hint">Le solde ne sera calculé qu'à partir de ce mois. Les données antérieures seront ignorées.</p>
        </div>
        <div class="wizard-field">
          <label>Comptes utilisés <span class="required-mark">*</span></label>
          <input type="text" id="wbAccounts" required placeholder="Ex : Revolut, BoursoBank, Livret A" value="${d.accounts}" oninput="wizardData.accounts=this.value">
        </div>
        <div class="wizard-field">
          <label>Argent actuel (€)</label>
          <input type="number" id="wbCurrentAmount" min="0" step="0.01" placeholder="Ex : 1000" value="${d.currentAmount || ''}" oninput="wizardData.currentAmount=this.value">
          <p class="field-hint">Ce montant sera utilisé comme solde de départ dans le tableur.</p>
        </div>
        <div class="wizard-field">
          <label>Objectif d'épargne (€) <span class="required-mark">*</span></label>
          <input type="number" id="wbSavings" required min="0" step="0.01" placeholder="Ex : 500" value="${d.savingsGoal}" oninput="wizardData.savingsGoal=this.value">
        </div>
      </div>
    `;
  }

  function renderStep2() {
    return `
      <div class="wizard-step active">
        <h3>Import de données</h3>
        <p class="step-desc">Choisis comment démarrer ton tableur.</p>
        <div class="wizard-choice" onclick="document.getElementById('wbImportFile').click()">
          <svg viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 8l-5-5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 3v12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <h4>Importer un fichier Excel</h4>
          <p>Charge un fichier .xlsx depuis ton ordinateur</p>
          <input type="file" id="wbImportFile" accept=".xlsx,.xls" style="display:none" onchange="window.onbHandleImport(this)">
        </div>
        <div class="wizard-choice" onclick="window.onbSkipImport()">
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
            <div class="wizard-theme-card ${d.theme === t.id ? 'selected' : ''}" onclick="window.onbSelectTheme('${t.id}')">
              <div class="wizard-theme-preview" style="background: ${t.preview}"></div>
              <span>${t.name}</span>
            </div>
          `).join("")}
        </div>
        <div class="wizard-field" style="margin-top: 20px;">
          <label>Mode d'affichage</label>
          <div class="mode-segment" role="group" aria-label="Mode d'affichage">
            <button type="button" class="${d.mode === 'light' ? 'is-active' : ''}" onclick="window.onbSelectMode('light')">Clair</button>
            <button type="button" class="${d.mode === 'dark' ? 'is-active' : ''}" onclick="window.onbSelectMode('dark')">Sombre</button>
          </div>
        </div>
      </div>
    `;
  }

  function finishWizard() {
    // Sauvegarde le montant actuel comme solde de départ
    if (wizardData.currentAmount) {
      wizardData.startingCash = wizardData.currentAmount;
      wizardData.currentCashDate = new Date().toISOString().slice(0, 10);
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
    if (!wizardData.importedFile) {
      clearSpreadsheetData();
    }
    // Si un fichier a été importé, s'assurer qu'il est sauvegardé
    if (wizardData.importedFile && typeof window.FinanceSheet !== "undefined" && window.FinanceSheet.saveNow) {
      try { window.FinanceSheet.saveNow(); } catch (e) {}
    }
    // Retour à la page d'accueil
    if (typeof window.setPage === "function") window.setPage("dashboard");
    // Start tutorial
    setTimeout(() => startTutorial(), 600);
  }

  // === Import handlers ===
  window.onbHandleImport = function(input) {
    if (input.files && input.files[0]) {
      if (typeof window.importFinanceFile === "function") {
        window.importFinanceFile(input.files[0]);
      }
      store(STORAGE.profile, Object.assign(wizardData, { importedFile: true }));
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

  window.onbSubmitAuth = function() {
    var email = (document.getElementById("wbAuthEmail").value || "").trim();
    var pw = document.getElementById("wbAuthPw").value || "";
    var statusEl = document.getElementById("wbAuthStatus");
    if (!email || !pw) { if (statusEl) statusEl.textContent = "Renseigne un email et un mot de passe."; return; }
    if (pw.length < 6) { if (statusEl) statusEl.textContent = "Le mot de passe doit faire au moins 6 caractères."; return; }
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
        if (res.error) { if (statusEl) statusEl.textContent = res.error.message; if (submitBtn) submitBtn.disabled = false; return; }
        if (res.data.session) {
          if (statusEl) statusEl.textContent = "Compte créé ! Connecté.";
          wizardData.authConnected = true;
          // Définit l'utilisateur et notifie les autres modules
          if (res.data.session.user) window.__account.user = res.data.session.user;
          window.dispatchEvent(new CustomEvent("authStateChanged", { detail: { user: window.__account.user, event: "SIGNED_IN" } }));
          if (submitBtn) submitBtn.disabled = false;
          renderWizardStep(); // Met à jour le bouton en "Suivant →"
        } else {
          if (statusEl) statusEl.textContent = "Compte créé ! Vérifie ton email pour confirmer.";
          wizardData.authConnected = true;
          if (submitBtn) submitBtn.disabled = false;
          renderWizardStep(); // Met à jour le bouton en "Suivant →"
        }
      }).catch(function(e) {
        if (statusEl) statusEl.textContent = e.message || "Erreur.";
        if (submitBtn) submitBtn.disabled = false;
      });
    } else {
      sb.auth.signInWithPassword({ email: email, password: pw }).then(function(res) {
        if (res.error) { if (statusEl) statusEl.textContent = res.error.message; if (submitBtn) submitBtn.disabled = false; return; }
        if (statusEl) statusEl.textContent = "Connecté !";
        wizardData.authConnected = true;
        // Définit l'utilisateur et notifie les autres modules
        if (res.data.session && res.data.session.user) window.__account.user = res.data.session.user;
        window.dispatchEvent(new CustomEvent("authStateChanged", { detail: { user: window.__account.user, event: "SIGNED_IN" } }));
        if (submitBtn) submitBtn.disabled = false;
        renderWizardStep(); // Met à jour le bouton en "Suivant →"
      }).catch(function(e) {
        if (statusEl) statusEl.textContent = e.message || "Erreur.";
        if (submitBtn) submitBtn.disabled = false;
      });
    }
  };

  window.onbSkipAuth = function() {
    wizardData.authConnected = false;
    if (currentStep < 3) { currentStep++; renderWizardStep(); }
    else finishWizard();
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
      title: "Cartes de synthèse",
      text: "Voici tes statistiques : salaire moyen, total épargné et mois les plus/moins dépensiers.",
      target: ".metrics",
      action: "Suivant",
    },
    {
      title: "Bouton Recharger",
      text: "Clique ici pour recharger les données du tableur vers le tableau de bord.",
      target: "#syncSheetButton",
      action: "Suivant",
    },
    {
      title: "Graphique",
      text: "Le graphique affiche la répartition de tes finances pour le mois sélectionné.",
      target: ".chart-panel",
      action: "Suivant",
    },
    {
      title: "Onglet Tableur",
      text: "Clique sur Tableur pour accéder à ton tableur et saisir tes données.",
      target: "[data-page='sheet'], #sheetButton, .nav-item:nth-child(2)",
      action: "Aller au Tableur",
      navigateTo: "sheet",
    },
    {
      title: "Tableau de saisie",
      text: "Saisis tes transactions ici. Les mois sont en haut et les catégories (Revolut, Loyer...) à gauche.",
      target: ".sheet-wrap, #sheetPage, .sheet-page",
      action: "Suivant",
      ensureVisible: true,
    },
    {
      title: "Bouton Paramètres",
      text: "Clique ici pour accéder aux paramètres, changer de thème et gérer tes amis.",
      target: "[data-page='settings'], #settingsButton, .nav-item:nth-child(3)",
      action: "Terminer",
      isLast: true,
    },
  ];

  let tutorialIndex = 0;

  function startTutorial() {
    tutorialIndex = 0;
    const overlay = $("tutorialOverlay");
    if (!overlay) return;
    overlay.classList.remove("hidden");
    // Active le calque bloquant
    const blocker = $("tutorialBlocker");
    if (blocker) blocker.classList.remove("hidden");
    // Injecte les données démo pour le tutoriel (graphique + tableur)
    // seulement si aucun fichier n'a été importé pendant le wizard
    if (!wizardData.importedFile) {
      injectDemoData();
    }
    // Sync le dashboard pour afficher le graphique avec les données démo ou importées
    if (typeof window.syncDashboardFromFinanceSheet === "function") {
      try { window.syncDashboardFromFinanceSheet({ silent: true }); } catch (e) {}
    }
    renderTutorialStep();
  }

  function closeTutorial() {
    const overlay = $("tutorialOverlay");
    if (overlay) overlay.classList.add("hidden");
    // Désactive le calque bloquant — le site redevient cliquable
    const blocker = $("tutorialBlocker");
    if (blocker) blocker.classList.add("hidden");
    store(STORAGE.tutorial, true);
    // Nettoie les références pour arrêter le repositionnement au scroll
    currentTutorialTarget = null;
    currentTutorialStep = null;
    currentTutorialOverlay = null;
    // Restaurer le hidden sur les éléments qu'on a rendus visibles pendant le tutoriel
    restoreHiddenElements();
    // Nettoie les données démo injectées pendant le tutoriel (uniquement si elles ont été injectées)
    if (demoDataInjected) clearDemoData();
    // Si un fichier a été importé, re-sync le dashboard avec les données réelles
    if (wizardData.importedFile && typeof window.syncDashboardFromFinanceSheet === "function") {
      try { window.syncDashboardFromFinanceSheet({ silent: true }); } catch (e) {}
    }
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
    var selectors = step.target.split(",");
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i].trim());
      if (!el) continue;
      var r = el.getBoundingClientRect();
      var style = getComputedStyle(el);
      // Prefer elements with real dimensions and not hidden
      if (r.width > 80 && r.height > 40 && style.display !== "none" && style.visibility !== "hidden") {
        target = el;
        break;
      }
    }
    // Fallback: first element that exists at all
    if (!target) {
      for (var j = 0; j < selectors.length; j++) {
        target = document.querySelector(selectors[j].trim());
        if (target) break;
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

    // Scroll la cible en vue avant de positionner le tooltip
    try {
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    } catch (e) {
      try { target.scrollIntoView(); } catch (e2) {}
    }

    // Attend que le scroll se stabilise avant de positionner
    setTimeout(function() {
      positionTutorialElements(overlay, target, step);
    }, 400);
  }

  // Variable pour stocker la cible courante et la repositionner au scroll
  var currentTutorialTarget = null;
  var currentTutorialStep = null;
  var currentTutorialOverlay = null;

  function positionTutorialElements(overlay, target, step) {
    currentTutorialTarget = target;
    currentTutorialStep = step;
    currentTutorialOverlay = overlay;

    var rect = target.getBoundingClientRect();
    var padding = 8;

    // Spotlight
    var spotlight = overlay.querySelector(".tutorial-spotlight");
    if (!spotlight) {
      spotlight = create("div", "tutorial-spotlight");
      overlay.appendChild(spotlight);
    }
    spotlight.style.top = (rect.top - padding) + "px";
    spotlight.style.left = (rect.left - padding) + "px";
    spotlight.style.width = (rect.width + padding * 2) + "px";
    spotlight.style.height = (rect.height + padding * 2) + "px";

    // Tooltip position : au-dessus ou en-dessous de la cible
    var tooltip = overlay.querySelector(".tutorial-tooltip");
    if (!tooltip) {
      tooltip = create("div", "tutorial-tooltip");
      overlay.appendChild(tooltip);
    }

    var tooltipWidth = Math.min(340, window.innerWidth - 40);
    var tooltipHeight = 180; // estimation
    var tooltipX = (window.innerWidth - tooltipWidth) / 2;
    var tooltipY;

    // Si la cible est dans la moitié supérieure, on met le tooltip en-dessous
    if (rect.top < window.innerHeight / 2) {
      tooltipY = rect.bottom + padding + 16;
      // Si dépasse en bas, on met au-dessus
      if (tooltipY + tooltipHeight > window.innerHeight - 20) {
        tooltipY = Math.max(20, rect.top - tooltipHeight - padding - 16);
      }
    } else {
      // Sinon on met au-dessus
      tooltipY = rect.top - tooltipHeight - padding - 16;
      // Si dépasse en haut, on met en-dessous
      if (tooltipY < 20) {
        tooltipY = rect.bottom + padding + 16;
      }
    }

    // Mobile : centrer horizontalement avec marges
    if (window.innerWidth <= 480) {
      tooltipX = Math.max(20, (window.innerWidth - tooltipWidth) / 2);
    }

    tooltip.style.width = tooltipWidth + "px";
    tooltip.style.left = tooltipX + "px";
    tooltip.style.top = tooltipY + "px";
    tooltip.style.animation = "tooltipIn 0.3s ease";

    // Progress dots
    var dotsHtml = TUTORIAL_STEPS.map(function(_, i) {
      var cls = "tutorial-progress-dot";
      if (i < tutorialIndex) cls += " done";
      if (i === tutorialIndex) cls += " active";
      return '<span class="' + cls + '"></span>';
    }).join("");

    tooltip.innerHTML =
      '<div class="tutorial-progress">' + dotsHtml + '</div>' +
      '<h4>' + step.title + '</h4>' +
      '<p>' + step.text + '</p>' +
      '<button class="tutorial-btn" id="tutorialNext">' + step.action + '</button>' +
      '<button class="tutorial-skip" id="tutorialSkip">Passer</button>';

    // Wire buttons
    var nextBtn = $("tutorialNext");
    var skipBtn = $("tutorialSkip");
    if (nextBtn) {
      nextBtn.onclick = function() {
        // Restaurer le hidden avant de changer d'étape
        restoreHiddenElements();
        if (step.navigateTo) {
          if (typeof window.setPage === "function") window.setPage(step.navigateTo);
          else {
            // Supporte les sélecteurs multiples
            var selectors = step.target.split(",");
            for (var s = 0; s < selectors.length; s++) {
              var navBtn = document.querySelector(selectors[s].trim());
              if (navBtn) { navBtn.click(); break; }
            }
          }
          setTimeout(function() { tutorialIndex++; renderTutorialStep(); }, 800);
        } else if (step.isLast) {
          closeTutorial();
        } else {
          tutorialIndex++;
          renderTutorialStep();
        }
      };
    }
    if (skipBtn) {
      skipBtn.onclick = closeTutorial;
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
      "Attention : tu seras déconnecté, toutes les données locales (tableur, catégories, règles) seront effacées. La configuration et le tutoriel vont recommencer. Cette action est irréversible.",
      "Réinitialiser le compte",
      async function() {
        // Tente de supprimer le compte Supabase si connecté
        try {
          var sb = window.__account && window.__account.client;
          if (sb && window.__account.user) {
            // Sign out d'abord
            try { await sb.auth.signOut(); window.__account.user = null; window.dispatchEvent(new CustomEvent("authStateChanged", { detail: { user: null, event: "SIGNED_OUT" } })); } catch(e) {}
          }
        } catch(e) {}
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
            <h2>Bienvenue sur Gestion finance</h2>
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
    if (shouldShowOnboarding()) {
      setTimeout(() => startWizard(true), 600);
    }

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
              alert("La suppression du compte a échoué. Vérifie que la fonction Supabase « delete-account » est déployée.");
              return;
            }
            window.__account.user = null;
            window.dispatchEvent(new CustomEvent("authStateChanged", { detail: { user: null, event: "SIGNED_OUT" } }));
          }
        } catch(e) {
          alert("La suppression du compte a échoué. Réessaie plus tard.");
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
