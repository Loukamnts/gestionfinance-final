/**
 * Traductions de la page de présentation (presentation.html) uniquement.
 * Les textes marqués data-i18n / data-i18n-aria sont lus dans i18n/fr.json et i18n/en.json,
 * et un sélecteur FR / EN est ajouté au pied de page. L’app, elle, utilise i18n.js.
 */
(function() {
  "use strict";

  const DEFAULT_LANG = "fr";
  const AVAILABLE_LANGS = ["fr", "en"];
  // Même clé que i18n.js : la langue choisie ici suit dans l’app.
  const STORAGE_KEY = "personalFinanceDashboard.language";

  let dictionaries = {};
  let currentLang = DEFAULT_LANG;

  async function loadDictionary(lang) {
    if (dictionaries[lang]) return dictionaries[lang];
    try {
      const response = await fetch(`/i18n/${lang}.json?v=20261022-r1`);
      if (!response.ok) throw new Error(`Failed to load ${lang}`);
      dictionaries[lang] = await response.json();
      return dictionaries[lang];
    } catch (error) {
      console.warn(`Impossible de charger le dictionnaire ${lang}:`, error.message);
      return {};
    }
  }

  // Langue enregistrée, sinon celle du navigateur.
  function getCurrentLanguage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && AVAILABLE_LANGS.includes(stored)) return stored;
    } catch (e) {
      // localStorage indisponible (navigation privée stricte)
    }
    const browserLang = (navigator.language || navigator.userLanguage || "").substring(0, 2);
    return AVAILABLE_LANGS.includes(browserLang) ? browserLang : DEFAULT_LANG;
  }

  function setCurrentLanguage(lang) {
    if (!AVAILABLE_LANGS.includes(lang)) lang = DEFAULT_LANG;
    currentLang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    document.documentElement.lang = lang;
    updateLanguageButtons();
    // Seule la langue demandée est téléchargée, et seulement quand on la choisit.
    loadDictionary(lang).then(function () { if (currentLang === lang) applyToAllElements(); });
  }

  // "presentation.lead" -> dict.presentation.lead ; clé inconnue -> la clé elle-même.
  function translate(key) {
    let value = dictionaries[currentLang] || {};
    for (const part of key.split(".")) {
      if (value && typeof value === "object" && part in value) value = value[part];
      else return key;
    }
    return typeof value === "string" && value ? value : key;
  }

  function getLanguage() {
    return currentLang;
  }

  // Textes (data-i18n) et libellés accessibles (data-i18n-aria) de l’élément et de ses descendants.
  function applyToElement(element) {
    if (!element) return;
    if (element.matches && element.matches("[data-i18n]")) element.textContent = translate(element.getAttribute("data-i18n"));
    if (element.matches && element.matches("[data-i18n-aria]")) element.setAttribute("aria-label", translate(element.getAttribute("data-i18n-aria")));
    element.querySelectorAll("[data-i18n-aria]").forEach(child => {
      child.setAttribute("aria-label", translate(child.getAttribute("data-i18n-aria")));
    });
    element.querySelectorAll("[data-i18n]").forEach(child => {
      child.textContent = translate(child.getAttribute("data-i18n"));
    });
  }

  // Tout le document : un élément qui ne porte que data-i18n-aria est aussi traduit.
  function applyToAllElements() {
    applyToElement(document.body);
  }

  // Sélecteur FR / EN du pied de page ; son apparence est dans presentation.html (.lang-btn).
  function createLanguageSelector() {
    // L’emplacement est déjà dans la page (taille réservée, pas de décalage) ; sinon on le crée.
    const footer = document.querySelector(".public-footer");
    let selector = document.getElementById("language-selector");
    if (selector && selector.querySelector(".lang-btn")) return;
    const created = !selector;
    if (!selector) {
      if (!footer) return;
      selector = document.createElement("div");
      selector.id = "language-selector";
      selector.className = "language-selector";
      selector.setAttribute("role", "group");
    }
    selector.setAttribute("data-i18n-aria", "presentation.languageLabel");
    AVAILABLE_LANGS.forEach(lang => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `lang-btn lang-btn-${lang}`;
      button.textContent = lang.toUpperCase();
      button.setAttribute("data-i18n-aria", lang === "fr" ? "presentation.switchToFrench" : "presentation.switchToEnglish");
      button.dataset.lang = lang;
      button.addEventListener("click", () => setCurrentLanguage(lang));
      selector.appendChild(button);
    });
    if (created) { const nav = footer.querySelector("nav"); (nav || footer).appendChild(selector); }
    updateLanguageButtons();
  }

  function updateLanguageButtons() {
    document.querySelectorAll(".lang-btn").forEach(btn => {
      btn.setAttribute("aria-pressed", String(btn.dataset.lang === currentLang));
    });
  }

  async function init() {
    currentLang = getCurrentLanguage();
    document.documentElement.lang = currentLang;
    await loadDictionary(currentLang);
    createLanguageSelector();
    applyToAllElements();
  }

  window.GFI18nManager = {
    getLanguage,
    setLanguage: setCurrentLanguage,
    translate,
    applyToAllElements
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
