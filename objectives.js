/* Objectifs et bloc-notes privés. Les données restent dans le profil local
   puis sont incluses dans le snapshot chiffré en transit du propriétaire. */
(function () {
  "use strict";

  const PROFILE_KEY = "personalFinanceDashboard.setupProfile";
  const MAX_GOALS = 40;
  const MAX_NOTE_LENGTH = 20000;
  let noteTimer = null;

  function readProfile() {
    try {
      const value = JSON.parse(safeStore.getItem(PROFILE_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (_) { return {}; }
  }

  function validGoal(goal) {
    if (!goal || typeof goal !== "object") return null;
    const title = String(goal.title || "").trim().slice(0, 80);
    const type = ["savings", "investment", "expense", "custom"].includes(goal.type) ? goal.type : "custom";
    const target = Number(goal.target);
    const current = Math.max(0, Number(goal.current) || 0);
    if (!title || !Number.isFinite(target) || target < 0) return null;
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(goal.dueDate || "")) ? goal.dueDate : "";
    const cadence = ["once", "monthly", "yearly"].includes(goal.cadence) ? goal.cadence : "once";
    return { id: String(goal.id || "").slice(0, 64) || makeId(), title, type, target, current, dueDate, cadence };
  }

  function goalsFrom(profile) {
    return Array.isArray(profile.objectives) ? profile.objectives.map(validGoal).filter(Boolean).slice(0, MAX_GOALS) : [];
  }

  function makeId() {
    return "goal-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function saveProfile(profile) {
    const goals = goalsFrom(profile);
    profile.objectives = goals;
    profile.notebook = String(profile.notebook || "").slice(0, MAX_NOTE_LENGTH);
    const firstSavings = goals.find(goal => goal.type === "savings");
    profile.savingsGoal = firstSavings ? firstSavings.target : "";
    safeStore.setItem(PROFILE_KEY, JSON.stringify(profile));
    window.dispatchEvent(new CustomEvent("gfprofilechange"));
    try { window.__gfSync?.markDirty(); } catch (_) {}
    try { window.syncDashboardFromFinanceSheet?.({ silent: true }); } catch (_) {}
  }

  function euro(value) {
    return new Intl.NumberFormat(document.documentElement.lang === "en" ? "en-GB" : "fr-FR", {
      style: "currency", currency: "EUR", maximumFractionDigits: 0
    }).format(Number(value) || 0);
  }

  function typeName(type) {
    return ({ savings: "Épargne", investment: "Investissement", expense: "Dépense prévue", custom: "Personnalisé" })[type] || "Personnalisé";
  }

  function status(text) {
    const el = document.getElementById("notebookStatus");
    if (el) el.textContent = text;
  }

  function cadenceName(cadence) {
    return ({ monthly: "Chaque mois", yearly: "Chaque année" })[cadence] || "Sans récurrence";
  }

  function render() {
    const list = document.getElementById("objectivesList");
    const notebook = document.getElementById("notebookInput");
    if (!list || !notebook) return;
    const profile = readProfile();
    const goals = goalsFrom(profile);
    list.replaceChildren();
    if (!goals.length) {
      const empty = document.createElement("p");
      empty.className = "objectives-empty";
      empty.textContent = "Aucun objectif pour le moment. Crée le premier quand tu es prêt.";
      list.append(empty);
    }
    goals.forEach(function (goal) {
      const card = document.createElement("article"); card.className = "objective-card";
      const top = document.createElement("div"); top.className = "objective-card-top";
      const copy = document.createElement("div");
      const title = document.createElement("h4"); title.textContent = goal.title;
      const kind = document.createElement("span"); kind.className = "objective-kind objective-kind-" + goal.type; kind.textContent = typeName(goal.type);
      copy.append(title, kind);
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "objective-remove"; remove.textContent = "Supprimer"; remove.setAttribute("aria-label", "Supprimer l’objectif " + goal.title);
      remove.addEventListener("click", function () {
        const current = readProfile();
        current.objectives = goalsFrom(current).filter(item => item.id !== goal.id);
        saveProfile(current); render();
      });
      top.append(copy, remove);
      const progress = Math.min(100, goal.target ? Math.round((goal.current / goal.target) * 100) : 0);
      const line = document.createElement("div"); line.className = "objective-progress";
      const fill = document.createElement("span"); fill.style.width = progress + "%"; line.append(fill);
      const details = document.createElement("div"); details.className = "objective-details";
      const amount = document.createElement("span"); amount.textContent = euro(goal.current) + " / " + euro(goal.target);
      const percent = document.createElement("strong"); percent.textContent = progress + " %";
      details.append(amount, percent);
      card.append(top, line, details);
      if (goal.dueDate) {
        const due = document.createElement("p"); due.className = "objective-due"; due.textContent = "Échéance : " + new Intl.DateTimeFormat(document.documentElement.lang === "en" ? "en-GB" : "fr-FR", { dateStyle: "long" }).format(new Date(goal.dueDate + "T00:00:00")); card.append(due);
      }
      if (goal.cadence && goal.cadence !== "once") {
        const cadence = document.createElement("p"); cadence.className = "objective-cadence"; cadence.textContent = cadenceName(goal.cadence); card.append(cadence);
      }
      list.append(card);
    });
    if (document.activeElement !== notebook) notebook.value = String(profile.notebook || "").slice(0, MAX_NOTE_LENGTH);
    status("Enregistré");
  }

  function openForm() {
    const form = document.getElementById("objectiveForm");
    if (!form) return;
    form.reset();
    document.getElementById("objectiveCurrent").value = "0";
    const planFields = document.getElementById("objectivePlanFields"), planToggle = document.getElementById("objectivePlanToggle");
    if (planFields) planFields.hidden = true;
    if (planToggle) planToggle.setAttribute("aria-expanded", "false");
    form.hidden = false;
    document.getElementById("objectiveTitle")?.focus();
  }

  function closeForm() {
    const form = document.getElementById("objectiveForm");
    if (form) form.hidden = true;
  }

  function setNotesOpen(open) {
    const drawer = document.getElementById("personalNotesDrawer");
    if (!drawer) return;
    drawer.hidden = !open;
    document.body.classList.toggle("personal-notes-open", open);
    if (open) {
      const notebook = document.getElementById("notebookInput");
      render();
      requestAnimationFrame(function () { notebook?.focus(); });
    }
  }

  function init() {
    const form = document.getElementById("objectiveForm");
    const add = document.getElementById("objectiveAddButton");
    const cancel = document.getElementById("objectiveCancelButton");
    const notebook = document.getElementById("notebookInput");
    if (!form || !notebook) return;
    add?.addEventListener("click", openForm);
    cancel?.addEventListener("click", closeForm);
    document.getElementById("objectivePlanToggle")?.addEventListener("click", function () {
      const fields = document.getElementById("objectivePlanFields"); if (!fields) return;
      fields.hidden = !fields.hidden; this.setAttribute("aria-expanded", String(!fields.hidden));
    });
    document.querySelectorAll("[data-open-notes]").forEach(function (button) { button.addEventListener("click", function () { setNotesOpen(true); }); });
    document.getElementById("personalNotesClose")?.addEventListener("click", function () { setNotesOpen(false); });
    // Le voile ne ferme pas la note : cela évite une fermeture accidentelle
    // pendant l'écriture. La croix et la touche Échap restent disponibles.
    document.addEventListener("keydown", function (event) { if (event.key === "Escape") setNotesOpen(false); });
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const title = String(document.getElementById("objectiveTitle")?.value || "").trim().slice(0, 80);
      const target = Number(document.getElementById("objectiveTarget")?.value);
      const current = Math.max(0, Number(document.getElementById("objectiveCurrent")?.value) || 0);
      if (!title || !Number.isFinite(target) || target < 0) return;
      const profile = readProfile();
      const goals = goalsFrom(profile);
      if (goals.length >= MAX_GOALS) { status("Limite de " + MAX_GOALS + " objectifs atteinte"); return; }
      goals.unshift({ id: makeId(), title, type: document.getElementById("objectiveType")?.value || "custom", target, current, dueDate: document.getElementById("objectiveDueDate")?.value || "", cadence: document.getElementById("objectiveCadence")?.value || "once" });
      profile.objectives = goals;
      saveProfile(profile); closeForm(); render();
    });
    notebook.addEventListener("input", function () {
      status("Enregistrement…");
      if (noteTimer) clearTimeout(noteTimer);
      noteTimer = setTimeout(function () {
        const profile = readProfile(); profile.notebook = notebook.value.slice(0, MAX_NOTE_LENGTH); saveProfile(profile); status("Enregistré");
      }, 500);
    });
    window.addEventListener("gfprofilechange", render);
    render();
  }

  window.GFObjectives = { render, saveProfile, setNotesOpen };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
