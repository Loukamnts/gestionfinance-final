/* Objectifs et bloc-notes privés. Les données restent dans le profil local
   puis sont incluses dans le snapshot chiffré en transit du propriétaire. */
(function () {
  "use strict";

  const PROFILE_KEY = "personalFinanceDashboard.setupProfile";
  const MAX_GOALS = 40;
  const MAX_NOTE_LENGTH = 20000;
  let noteTimer = null;
  let editingId = "";
  let activeFilter = "active";

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
    const sourceId = String(goal.sourceId || "").slice(0, 100);
    const paused = Boolean(goal.paused);
    const archived = Boolean(goal.archived);
    return { id: String(goal.id || "").slice(0, 64) || makeId(), title, type, target, current, dueDate, cadence, sourceId, paused, archived };
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

  function sources() {
    try { return window.FinanceSheet?.getObjectiveSources?.() || []; } catch (_) { return []; }
  }

  function effectiveCurrent(goal, availableSources) {
    const linked = goal.sourceId && availableSources.find(source => source.id === goal.sourceId);
    return linked ? linked.value : goal.current;
  }

  function monthsRemaining(dueDate) {
    if (!dueDate) return 0;
    const due = new Date(dueDate + "T00:00:00"), now = new Date();
    return Math.max(1, (due.getFullYear() - now.getFullYear()) * 12 + due.getMonth() - now.getMonth() + 1);
  }

  function renderOverview(goals, availableSources) {
    const overview = document.getElementById("objectivesOverview");
    if (!overview) return;
    const active = goals.filter(goal => !goal.archived);
    const totalTarget = active.reduce((sum, goal) => sum + goal.target, 0);
    const totalCurrent = active.reduce((sum, goal) => sum + effectiveCurrent(goal, availableSources), 0);
    const reached = active.filter(goal => effectiveCurrent(goal, availableSources) >= goal.target).length;
    overview.replaceChildren();
    [["En cours", String(active.length)], ["Progression globale", totalTarget ? Math.min(100, Math.round(totalCurrent / totalTarget * 100)) + " %" : "0 %"], ["Atteints", String(reached)]].forEach(function(item) {
      const stat = document.createElement("article"); stat.className = "objective-stat";
      const label = document.createElement("span"); label.textContent = item[0];
      const value = document.createElement("strong"); value.textContent = item[1];
      stat.append(label, value); overview.append(stat);
    });
  }

  function render() {
    const list = document.getElementById("objectivesList");
    const notebook = document.getElementById("notebookInput");
    if (!list || !notebook) return;
    const profile = readProfile();
    const goals = goalsFrom(profile);
    const availableSources = sources();
    renderOverview(goals, availableSources);
    list.replaceChildren();
    const visibleGoals = goals.filter(goal => activeFilter === "archived" ? goal.archived : !goal.archived);
    if (!visibleGoals.length) {
      const empty = document.createElement("p");
      empty.className = "objectives-empty";
      empty.textContent = activeFilter === "archived" ? "Aucun objectif archivé." : "Aucun objectif pour le moment. Crée le premier quand tu es prêt.";
      list.append(empty);
    }
    visibleGoals.forEach(function (goal) {
      const displayedCurrent = effectiveCurrent(goal, availableSources);
      const card = document.createElement("article"); card.className = "objective-card";
      if (goal.paused) card.classList.add("is-paused");
      const top = document.createElement("div"); top.className = "objective-card-top";
      const copy = document.createElement("div"); copy.className = "objective-heading";
      const title = document.createElement("h4"); title.textContent = goal.title;
      const meta = document.createElement("p"); meta.className = "objective-meta";
      meta.textContent = goal.dueDate ? "Objectif : " + new Intl.DateTimeFormat(document.documentElement.lang === "en" ? "en-GB" : "fr-FR", { month: "long", year: "numeric" }).format(new Date(goal.dueDate + "T00:00:00")) : typeName(goal.type);
      copy.append(title, meta);
      const stateLabel = document.createElement("span"); stateLabel.className = "objective-status";
      stateLabel.textContent = goal.paused ? "En pause" : displayedCurrent >= goal.target ? "Atteint" : goal.sourceId ? "Lié au tableur" : "En cours";
      if (goal.paused) stateLabel.classList.add("is-paused");
      const progress = Math.min(100, goal.target ? Math.round((displayedCurrent / goal.target) * 100) : 0);
      const percent = document.createElement("strong"); percent.className = "objective-percent"; percent.textContent = progress + "%";
      top.append(copy, percent);
      const line = document.createElement("div"); line.className = "objective-progress";
      const fill = document.createElement("span"); fill.style.width = progress + "%"; line.append(fill);
      const details = document.createElement("div"); details.className = "objective-details";
      const amountWrap = document.createElement("div"); amountWrap.className = "objective-amount-wrap";
      const amountLabel = document.createElement("span"); amountLabel.textContent = "Progression actuelle";
      const amount = document.createElement("strong"); amount.textContent = euro(displayedCurrent) + " / " + euro(goal.target);
      amountWrap.append(amountLabel, amount);
      const remaining = document.createElement("p"); remaining.className = "objective-remaining";
      remaining.textContent = goal.target > displayedCurrent ? "Reste " + euro(goal.target - displayedCurrent) : "Objectif atteint";
      const insight = document.createElement("p"); insight.className = "objective-insight";
      const remainingAmount = Math.max(0, goal.target - displayedCurrent), remainingMonths = monthsRemaining(goal.dueDate);
      const rhythm = document.createElement("div"); rhythm.className = "objective-rhythm";
      const rhythmLabel = document.createElement("span"); rhythmLabel.textContent = remainingMonths && remainingAmount ? "Rythme conseillé" : "Statut";
      const rhythmValue = document.createElement("strong"); rhythmValue.textContent = remainingMonths && remainingAmount ? euro(Math.ceil(remainingAmount / remainingMonths)) + " / mois" : stateLabel.textContent;
      rhythm.append(rhythmLabel, rhythmValue);
      details.append(amountWrap, rhythm);

      // L'objectif reste léger à créer, mais son avancement peut être mis à
      // jour directement depuis sa carte. Cette modification passe par le
      // même chemin de sauvegarde et de synchronisation que le reste du profil.
      const progressEditor = document.createElement("div"); progressEditor.className = "objective-progress-editor";
      const currentLabel = document.createElement("label"); currentLabel.textContent = "Montant atteint";
      const currentInput = document.createElement("input");
      currentInput.type = "number";
      currentInput.min = "0";
      currentInput.step = "0.01";
      currentInput.inputMode = "decimal";
      currentInput.value = String(displayedCurrent);
      currentInput.disabled = Boolean(goal.sourceId);
      currentInput.setAttribute("aria-label", "Montant atteint pour " + goal.title);
      currentLabel.append(currentInput);
      const update = document.createElement("button");
      update.type = "button";
      update.className = "button button-ghost objective-update";
      update.textContent = goal.sourceId ? "Automatique" : "Mettre à jour";
      update.disabled = Boolean(goal.sourceId);
      function saveProgress() {
        const value = Number(currentInput.value);
        if (!Number.isFinite(value) || value < 0) { currentInput.focus(); return; }
        const current = readProfile();
        current.objectives = goalsFrom(current).map(function (item) {
          return item.id === goal.id ? Object.assign({}, item, { current: value }) : item;
        });
        saveProfile(current);
        render();
      }
      update.addEventListener("click", saveProgress);
      currentInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") { event.preventDefault(); saveProgress(); }
      });
      progressEditor.append(currentLabel, update);
      const actions = document.createElement("div"); actions.className = "objective-card-actions";
      function action(label, handler, danger) { const button = document.createElement("button"); button.type = "button"; button.className = "button button-ghost"; if (danger) button.classList.add("objective-remove"); button.textContent = label; button.addEventListener("click", handler); actions.append(button); }
      action("Modifier", function() { openForm(goal); });
      action(goal.paused ? "Reprendre" : "Mettre en pause", function() { const current = readProfile(); current.objectives = goalsFrom(current).map(item => item.id === goal.id ? Object.assign({}, item, { paused: !item.paused }) : item); saveProfile(current); render(); });
      action(goal.archived ? "Réactiver" : "Archiver", function() { const current = readProfile(); current.objectives = goalsFrom(current).map(item => item.id === goal.id ? Object.assign({}, item, { archived: !item.archived }) : item); saveProfile(current); render(); });
      action("Supprimer", function() { const current = readProfile(); current.objectives = goalsFrom(current).filter(item => item.id !== goal.id); saveProfile(current); render(); }, true);
      const management = document.createElement("details"); management.className = "objective-management";
      const managementLabel = document.createElement("summary"); managementLabel.textContent = "Gérer l’objectif";
      management.append(managementLabel, progressEditor, remaining, actions);
      card.append(top, line, details, management);
      list.append(card);
    });
    if (document.activeElement !== notebook) notebook.value = String(profile.notebook || "").slice(0, MAX_NOTE_LENGTH);
    status("Enregistré");
  }

  function fillSourceSelect(selected) {
    const select = document.getElementById("objectiveSheetSource"); if (!select) return;
    select.replaceChildren(new Option("Aucune liaison", ""));
    const groups = new Map();
    sources().forEach(function(source) {
      const year = String(source.label).match(/\b(20\d{2})\b/)?.[1] || "Autres périodes";
      if (!groups.has(year)) groups.set(year, []);
      groups.get(year).push(source);
    });
    Array.from(groups.keys()).sort(function(a, b) { return b.localeCompare(a, "fr", { numeric: true }); }).forEach(function(year) {
      const group = document.createElement("optgroup"); group.label = year;
      groups.get(year).forEach(source => group.append(new Option(source.label + " · " + euro(source.value), source.id)));
      select.append(group);
    });
    select.value = selected || "";
  }

  function openForm(goal) {
    const form = document.getElementById("objectiveForm");
    if (!form) return;
    form.reset();
    editingId = goal?.id || "";
    document.getElementById("objectiveTitle").value = goal?.title || "";
    document.getElementById("objectiveType").value = goal?.type || "savings";
    document.getElementById("objectiveTarget").value = goal?.target ?? "";
    document.getElementById("objectiveCurrent").value = goal?.current ?? "0";
    document.getElementById("objectiveCadence").value = goal?.cadence || "once";
    document.getElementById("objectiveDueDate").value = goal?.dueDate || "";
    fillSourceSelect(goal?.sourceId);
    const planFields = document.getElementById("objectivePlanFields"), planToggle = document.getElementById("objectivePlanToggle");
    if (planFields) planFields.hidden = !(goal?.dueDate || goal?.cadence !== "once" || goal?.sourceId);
    if (planToggle) planToggle.setAttribute("aria-expanded", String(!planFields?.hidden));
    form.hidden = false;
    document.getElementById("objectiveTitle")?.focus();
  }

  function closeForm() {
    const form = document.getElementById("objectiveForm");
    if (form) form.hidden = true;
    editingId = "";
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
    document.querySelectorAll("[data-objective-filter]").forEach(function(button) { button.addEventListener("click", function() { activeFilter = button.dataset.objectiveFilter || "active"; document.querySelectorAll("[data-objective-filter]").forEach(item => { const selected = item === button; item.classList.toggle("is-active", selected); item.setAttribute("aria-selected", String(selected)); }); render(); }); });
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
      if (!editingId && goals.length >= MAX_GOALS) { status("Limite de " + MAX_GOALS + " objectifs atteinte"); return; }
      const previous = editingId ? goals.find(goal => goal.id === editingId) : null;
      const data = { id: editingId || makeId(), title, type: document.getElementById("objectiveType")?.value || "custom", target, current, dueDate: document.getElementById("objectiveDueDate")?.value || "", cadence: document.getElementById("objectiveCadence")?.value || "once", sourceId: document.getElementById("objectiveSheetSource")?.value || "", paused: Boolean(previous?.paused), archived: Boolean(previous?.archived) };
      if (editingId) profile.objectives = goals.map(goal => goal.id === editingId ? Object.assign({}, goal, data) : goal);
      else goals.unshift(data), profile.objectives = goals;
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

