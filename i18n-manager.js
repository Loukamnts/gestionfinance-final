/**
 * Gestionnaire d'internationalisation pour Meuniance
 * Compatible avec le système existant (i18n.js)
 * Ajoute le support des fichiers JSON et le sélecteur dans le footer
 */
(function() {
  "use strict";

  // Langue par défaut et disponible
  const DEFAULT_LANG = "fr";
  const AVAILABLE_LANGS = ["fr", "en"];
  const STORAGE_KEY = "personalFinanceDashboard.language";

  // Dictionnaires chargés
  let dictionaries = {};
  let currentLang = DEFAULT_LANG;

  // Charge un dictionnaire JSON
  async function loadDictionary(lang) {
    if (dictionaries[lang]) return dictionaries[lang];
    
    try {
      const response = await fetch(`/i18n/${lang}.json?cache=${Date.now()}`);
      if (!response.ok) throw new Error(`Failed to load ${lang}`);
      dictionaries[lang] = await response.json();
      return dictionaries[lang];
    } catch (error) {
      console.warn(`Impossible de charger le dictionnaire ${lang}:`, error.message);
      return {};
    }
  }

  // Charge tous les dictionnaires
  async function loadAllDictionaries() {
    const promises = AVAILABLE_LANGS.map(loadDictionary);
    await Promise.all(promises);
  }

  // Récupère la langue actuelle (depuis le stockage ou le navigateur)
  function getCurrentLanguage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && AVAILABLE_LANGS.includes(stored)) {
        return stored;
      }
    } catch (e) {
      // localStorage non disponible
    }
    
    // Détecte la langue du navigateur
    const browserLang = (navigator.language || navigator.userLanguage || "").substring(0, 2);
    return AVAILABLE_LANGS.includes(browserLang) ? browserLang : DEFAULT_LANG;
  }

  // Définit la langue actuelle
  function setCurrentLanguage(lang) {
    if (!AVAILABLE_LANGS.includes(lang)) {
      console.warn(`Langue non supportée: ${lang}, utilisation de ${DEFAULT_LANG}`);
      lang = DEFAULT_LANG;
    }
    currentLang = lang;
    
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      // localStorage non disponible
    }
    
    // Met à jour l'attribut html
    document.documentElement.lang = lang;
    
    // Déclenche un événement pour les autres modules
    window.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang } }));
  }

  // Traduit une clé
  function translate(key, params = {}) {
    const dict = dictionaries[currentLang] || {};
    let translation = dict;
    
    // Parcourt la clé (ex: "auth.signIn" -> dict.auth.signIn)
    const keys = key.split(".");
    for (const k of keys) {
      if (translation && typeof translation === "object" && k in translation) {
        translation = translation[k];
      } else {
        // Si la clé n'existe pas, retourne la clé elle-même
        return key;
      }
    }
    
    // Remplace les placeholders (ex: "Bonjour {name}" -> "Bonjour Louka")
    if (typeof translation === "string" && params) {
      for (const [placeholder, value] of Object.entries(params)) {
        translation = translation.replace(new RegExp("\\{\\s*" + placeholder + "\\s*\\}", "g"), value);
      }
    }
    
    return translation || key;
  }

  // Traduit une clé avec fallback vers le français
  function translateWithFallback(key, params = {}) {
    const translation = translate(key, params);
    if (translation !== key) return translation;
    
    // Essaie en français
    if (currentLang !== "fr") {
      const frTranslation = dictionaries["fr"] ? 
        getTranslationFromDict(dictionaries["fr"], key, params) : null;
      if (frTranslation && frTranslation !== key) return frTranslation;
    }
    
    return key;
  }

  // Helper pour extraire une traduction d'un dictionnaire
  function getTranslationFromDict(dict, key, params) {
    const keys = key.split(".");
    let translation = dict;
    for (const k of keys) {
      if (translation && typeof translation === "object" && k in translation) {
        translation = translation[k];
      } else {
        return null;
      }
    }
    if (typeof translation === "string" && params) {
      for (const [placeholder, value] of Object.entries(params)) {
        translation = translation.replace(new RegExp("\\{\\s*" + placeholder + "\\s*\\}", "g"), value);
      }
    }
    return translation;
  }

  // Récupère la langue actuelle
  function getLanguage() {
    return currentLang;
  }

  // Récupère le locale (pour les dates, nombres)
  function locale() {
    const langMap = { fr: "fr-FR", en: "en-US" };
    return langMap[currentLang] || langMap[DEFAULT_LANG];
  }

  // Applique les traductions à un élément DOM et à sa descendance
  function applyToElement(element) {
    if (!element) return;
    
    // L'élément lui-même peut porter data-i18n
    if (element.matches && element.matches("[data-i18n]")) {
      element.textContent = translate(element.getAttribute("data-i18n"));
    }
    
    // Traduction des attributs aria-label
    if (element.matches && element.matches("[data-i18n-aria]")) {
      element.setAttribute("aria-label", translate(element.getAttribute("data-i18n-aria")));
    }
    element.querySelectorAll("[data-i18n-aria]").forEach(child => {
      child.setAttribute("aria-label", translate(child.getAttribute("data-i18n-aria")));
    });
    
    // Les descendants portant data-i18n
    element.querySelectorAll("[data-i18n]").forEach(child => {
      child.textContent = translate(child.getAttribute("data-i18n"));
    });
  }

  // Crée le sélecteur de langue dans le footer
  function createLanguageSelector() {
    const existingSelector = document.getElementById("language-selector");
    if (existingSelector) return;
    
    const footer = document.querySelector(".public-footer");
    if (!footer) return;
    
    const selector = document.createElement("div");
    selector.id = "language-selector";
    selector.className = "language-selector";
    selector.setAttribute("aria-label", translate("presentation.languageLabel"));
    
    // Style du sélecteur : discret, aligné avec les liens existants du footer
    selector.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 2px;
    `;
    
    // Crée les boutons de langue
    AVAILABLE_LANGS.forEach(lang => {
      const button = document.createElement("button");
      button.className = `lang-btn lang-btn-${lang}`;
      button.textContent = lang.toUpperCase();
      button.setAttribute("aria-label", `Changer la langue en ${lang === "fr" ? "français" : "anglais"}`);
      button.setAttribute("aria-pressed", String(lang === currentLang));
      button.dataset.lang = lang;
      
      button.style.cssText = `
        background: none;
        border: 1px solid var(--line);
        color: var(--muted);
        padding: 3px 8px;
        border-radius: var(--radius);
        cursor: pointer;
        font-size: 0.72rem;
        font-weight: 600;
        font-family: inherit;
        line-height: 1.3;
        transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease;
      `;
      
      if (lang === currentLang) {
        button.style.background = "var(--accent)";
        button.style.color = "var(--palette-on-accent, #ffffff)";
        button.style.borderColor = "var(--accent)";
      } else {
        button.addEventListener("mouseenter", () => {
          button.style.color = "var(--text)";
          button.style.borderColor = "var(--line-strong)";
        });
        button.addEventListener("mouseleave", () => {
          button.style.color = "var(--muted)";
          button.style.borderColor = "var(--line)";
        });
      }
      
      button.addEventListener("click", () => {
        setCurrentLanguage(lang);
        updateLanguageButtons();
        applyToAllElements();
      });
      
      selector.appendChild(button);
    });
    
    // Ajoute le sélecteur au footer
    const nav = footer.querySelector("nav");
    if (nav) {
      nav.appendChild(selector);
    } else {
      footer.appendChild(selector);
    }
  }

  // Met à jour l'état des boutons de langue
  function updateLanguageButtons() {
    const buttons = document.querySelectorAll(".lang-btn");
    buttons.forEach(btn => {
      const lang = btn.dataset.lang;
      btn.setAttribute("aria-pressed", String(lang === currentLang));
      btn.style.background = lang === currentLang ? "var(--accent)" : "";
      btn.style.color = lang === currentLang ? "var(--palette-on-accent, #ffffff)" : "var(--muted)";
      btn.style.borderColor = lang === currentLang ? "var(--accent)" : "var(--line)";
    });
  }

  // Applique les traductions à tous les éléments marqués data-i18n
  function applyToAllElements() {
    document.querySelectorAll("[data-i18n]").forEach(applyToElement);
  }

  // Initialise le gestionnaire
  async function init() {
    currentLang = getCurrentLanguage();
    document.documentElement.lang = currentLang;
    
    // Charge tous les dictionnaires
    await loadAllDictionaries();
    
    // Crée le sélecteur de langue
    createLanguageSelector();
    
    // Applique les traductions
    applyToAllElements();
    
    // Écoute les changements de langue
    window.addEventListener("languageChanged", (e) => {
      currentLang = e.detail.lang;
      applyToAllElements();
    });
  }

  // Expose les fonctions globalement
  window.GFI18nManager = {
    init,
    getLanguage,
    setLanguage: setCurrentLanguage,
    translate,
    translateWithFallback,
    locale,
    loadDictionary,
    loadAllDictionaries,
    createLanguageSelector,
    applyToElement,
    applyToAllElements
  };

  // Étend le système existant (i18n.js) sans écraser ses méthodes déjà en place
  if (window.GFI18n) {
    window.GFI18n.setLanguage = window.GFI18n.setLanguage || setCurrentLanguage;
  } else {
    window.GFI18n = {
      getLanguage,
      setLanguage: setCurrentLanguage,
      locale,
      translate: translateWithFallback,
      t: translateWithFallback
    };
  }

  // Initialise automatiquement quand le DOM est prêt
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
