/* ═══════════════════════════════════════════════════════════════
   onboarding.js — Première ouverture (reprise du cloud puis tutoriel),
   réinitialisation et suppression du compte.
   L'ancien assistant de configuration a été retiré : il n'était plus jamais affiché.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const STORAGE = {
    onboarding: "personalFinanceDashboard.onboardingCompleted",
    profile: "personalFinanceDashboard.setupProfile",
    tutorial: "personalFinanceDashboard.tutorialCompleted",
    friendCode: "personalFinanceDashboard.friendCode",
  };

  let onboardingStartupInFlight = false;

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
            var pulled = await window.__gfSync.pullFromCloud({ loader: true });
            if (pulled) {
              store(STORAGE.onboarding, true);
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
      "Effacer les données de cet appareil ?",
      "Tu seras déconnecté et la copie de ton espace sur cet appareil sera effacée. Ce qui est enregistré dans ton compte reste disponible. Le tutoriel recommencera.",
      "Effacer et me déconnecter",
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
            console.warn("Meuniance : déconnexion impossible", e);
            showInfoModal("Déconnexion impossible", "La déconnexion n’a pas abouti. Rien n’a été effacé de cet appareil : réessaie dans un instant.");
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

  // === Modal d'information (un seul bouton) : remplace alert(), jamais de fenêtre native ===
  function showInfoModal(title, message) {
    showConfirmModal(title, message, "Fermer", null, true);
  }

  // === Modal de confirmation générique ===
  function showConfirmModal(title, message, confirmLabel, onConfirm, infoOnly) {
    // Crée l'overlay
    var modal = document.createElement("div");
    modal.className = "onboarding-overlay";
    modal.style.zIndex = "100000";
    modal.setAttribute("role", "alertdialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = 
      '<div class="wizard-card" style="max-width: 420px; text-align: center;">' +
      '<h2 style="margin-bottom: 12px;">' + title + '</h2>' +
      '<p style="color: var(--text-muted, #9ca3af); margin-bottom: 24px; line-height: 1.6;">' + message + '</p>' +
      '<div class="wizard-buttons" style="justify-content: center; gap: 12px;">' +
      (infoOnly ? '' : '<button class="wizard-btn wizard-btn-ghost" id="confirmCancel">Annuler</button>') +
      '<button class="wizard-btn wizard-btn-primary" id="confirmOk"' + (infoOnly ? '' : ' style="background: linear-gradient(135deg, #ef4444, #dc2626);"') + '>' + confirmLabel + '</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(modal);

    // Wire buttons
    var cancelButton = document.getElementById("confirmCancel");
    if (cancelButton) cancelButton.onclick = function() {
      document.body.removeChild(modal);
    };
    document.getElementById("confirmOk").onclick = function() {
      document.body.removeChild(modal);
      if (onConfirm) onConfirm();
    };
  }

  // === Init ===
  function init() {
    if (!$("tutorialOverlay")) {
      const tutOverlay = create("div", "tutorial-overlay hidden");
      tutOverlay.id = "tutorialOverlay";
      document.body.appendChild(tutOverlay);
    }

    // Calque bloquant pour empêcher les clics sur le site pendant le tutoriel
    if (!$("tutorialBlocker")) {
      const blocker = create("div", "tutorial-blocker hidden");
      blocker.id = "tutorialBlocker";
      document.body.appendChild(blocker);
    }

    // Check if onboarding should show
    if (shouldShowOnboarding()) setTimeout(restoreCloudBeforeOnboarding, 700);

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
      "Supprimer définitivement ton compte ?",
      "Ton compte et tes données (tableur, objectifs, amis, partages) seront supprimés, et ta formule payante éventuelle sera résiliée. Cette action est définitive.",
      "Supprimer mon compte",
      async function() {
        try {
          var sb = window.__account && window.__account.client;
          if (sb && window.__account.user) {
            // La clé service Supabase ne doit jamais être exposée au navigateur :
            // la fonction Edge vérifie le JWT puis supprime auth.users côté serveur.
            var result = await sb.functions.invoke("delete-account");
            if (result.error) {
              console.warn("Meuniance : suppression du compte refusée", result.error);
              showInfoModal("Suppression impossible", "Ton compte n’a pas pu être supprimé. Rien n’a été effacé : réessaie dans un instant, ou écris-nous si ça persiste.");
              return;
            }
            window.__account.user = null;
            window.dispatchEvent(new CustomEvent("authStateChanged", { detail: { user: null, event: "SIGNED_OUT" } }));
          }
        } catch(e) {
          console.warn("Meuniance : suppression du compte impossible", e);
          showInfoModal("Suppression impossible", "Ton compte n’a pas pu être supprimé. Rien n’a été effacé : réessaie dans un instant, ou écris-nous si ça persiste.");
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
