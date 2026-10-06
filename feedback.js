/**
 * Module de feedback visuel unifié pour Meuniance
 * Compatible avec tous les thèmes (glass, editorial, brutal)
 * Utilise les custom properties CSS existantes
 */
(function() {
  "use strict";

  // Éléments DOM centraux
  const body = document.body;
  let loadingOverlay = null;
  let toastContainer = null;

  // Crée l'overlay de chargement
  function createLoadingOverlay() {
    if (loadingOverlay && loadingOverlay.parentNode) return;
    
    loadingOverlay = document.createElement("div");
    loadingOverlay.id = "gf-loading-overlay";
    loadingOverlay.setAttribute("aria-live", "polite");
    loadingOverlay.setAttribute("aria-busy", "true");
    loadingOverlay.innerHTML = `
      <div class="gf-loading-spinner" role="status" aria-label="Chargement en cours...">
        <svg viewBox="0 0 24 24" width="48" height="48" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="30 70" />
        </svg>
      </div>
    `;
    
    // Style dynamique basé sur les thèmes
    loadingOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
    `;
    
    const spinner = loadingOverlay.querySelector('.gf-loading-spinner');
    spinner.style.cssText = `
      color: var(--button-primary-text, #ededf0);
      animation: gf-spin 1s linear infinite;
    `;
    
    // Ajoute le style de l'animation
    const style = document.createElement("style");
    style.textContent = `
      @keyframes gf-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .gf-loading-spinner svg {
        animation: gf-spin 1s linear infinite;
      }
    `;
    loadingOverlay.appendChild(style);
    
    document.body.appendChild(loadingOverlay);
  }

  // Crée le conteneur pour les toasts
  function createToastContainer() {
    if (toastContainer && toastContainer.parentNode) return;
    
    toastContainer = document.createElement("div");
    toastContainer.id = "gf-toast-container";
    toastContainer.setAttribute("aria-live", "assertive");
    toastContainer.setAttribute("aria-atomic", "true");
    toastContainer.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 9990;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 360px;
      width: calc(100% - 40px);
      pointer-events: none;
    `;
    
    document.body.appendChild(toastContainer);
  }

  // Affiche un toast (notification)
  function showToast(message, type = "info", duration = 5000) {
    createToastContainer();
    
    const toast = document.createElement("div");
    toast.className = `gf-toast gf-toast-${type}`;
    toast.setAttribute("role", "alert");
    toast.setAttribute("aria-live", "assertive");
    
    // Icônes pour chaque type
    const icons = {
      success: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
      error: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warning: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>',
      info: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };
    
    const colors = {
      success: { bg: "#10b981", text: "#ffffff" },
      error: { bg: "#ef4444", text: "#ffffff" },
      warning: { bg: "#f59e0b", text: "#ffffff" },
      info: { bg: "#3b82f6", text: "#ffffff" }
    };
    
    const color = colors[type] || colors.info;
    
    toast.innerHTML = `
      <div class="gf-toast-content" style="display: flex; align-items: center; gap: 10px;">
        <span class="gf-toast-icon" aria-hidden="true">${icons[type] || icons.info}</span>
        <span class="gf-toast-message">${escapeHtml(message)}</span>
      </div>
    `;
    
    toast.style.cssText = `
      background: ${color.bg};
      color: ${color.text};
      padding: 12px 16px;
      border-radius: 8px;
      font-family: var(--font-body, -apple-system, BlinkMacSystemFont, sans-serif);
      font-size: 14px;
      line-height: 1.4;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      animation: gf-toast-in 0.3s ease-out;
      pointer-events: auto;
      opacity: 0;
      transform: translateY(20px);
    `;
    
    toastContainer.appendChild(toast);
    
    // Anime l'entrée
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });
    
    // Supprime après le délai
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(20px)";
      setTimeout(() => toast.remove(), 300);
    }, duration);
    
    return toast;
  }

  // Affiche le chargement global
  function showLoading(message = "Chargement...") {
    createLoadingOverlay();
    const label = loadingOverlay.querySelector('[aria-label]');
    if (label) label.setAttribute("aria-label", message);
    loadingOverlay.style.opacity = "1";
    loadingOverlay.style.pointerEvents = "all";
    body.style.pointerEvents = "none";
  }

  // Cache le chargement global
  function hideLoading() {
    if (!loadingOverlay) return;
    loadingOverlay.style.opacity = "0";
    loadingOverlay.style.pointerEvents = "none";
    body.style.pointerEvents = "";
  }

  // Affiche un message dans un élément spécifique (compatible avec ton système existant)
  function showMessage(message, kind = "", elementId = "accountMsg") {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = message;
      element.className = "account-msg " + kind;
      element.setAttribute("role", kind === "error" ? "alert" : "status");
      element.setAttribute("aria-live", "polite");
    }
    
    // Si c'est une erreur ou un succès, affiche aussi un toast
    if (kind === "error" || kind === "ok" || kind === "success") {
      showToast(message, kind === "error" ? "error" : "success");
    }
  }

  // Désactive/enable les boutons pendant le chargement
  function setLoadingState(disabled, buttonIds = []) {
    const defaultButtons = [
      "accountLoginBtn", "accountRegisterBtn", "accountResendBtn",
      "accountConfirmCheckBtn", "accountChangeEmailBtn", "accountForgotBtn"
    ];
    const allButtons = buttonIds.length > 0 ? buttonIds : defaultButtons;
    
    allButtons.forEach(id => {
      const button = document.getElementById(id);
      if (button) {
        button.disabled = disabled;
        button.setAttribute("aria-busy", String(disabled));
      }
    });
  }

  // Traduit les erreurs Supabase en messages lisibles
  function translateError(error, defaultMessage = "Une erreur est survenue") {
    if (!error) return defaultMessage;
    
    const message = error.message || error.toString() || defaultMessage;
    
    // Erreurs courantes Supabase
    const translations = {
      fr: {
        "not confirmed": "Votre email n'est pas encore confirmé. Vérifiez votre boîte de réception.",
        "Invalid login credentials": "Email ou mot de passe incorrect.",
        "User already registered": "Un compte existe déjà avec cet email.",
        "invalid password": "Mot de passe invalide (minimum 6 caractères).",
        "weak password": "Mot de passe trop faible. Utilisez au moins 6 caractères.",
        "Email not confirmed": "Email non confirmé. Vérifiez votre boîte mail.",
        "Invalid email": "Email invalide.",
        "User not found": "Utilisateur non trouvé.",
        "Network error": "Erreur réseau. Vérifiez votre connexion internet.",
        "Request failed with status code": "Erreur serveur. Veuillez réessayer plus tard."
      },
      en: {
        "not confirmed": "Your email is not yet confirmed. Please check your inbox.",
        "Invalid login credentials": "Invalid email or password.",
        "User already registered": "An account already exists with this email.",
        "invalid password": "Invalid password (minimum 6 characters).",
        "weak password": "Password is too weak. Use at least 6 characters.",
        "Email not confirmed": "Email not confirmed. Please check your email.",
        "Invalid email": "Invalid email.",
        "User not found": "User not found.",
        "Network error": "Network error. Please check your internet connection.",
        "Request failed with status code": "Server error. Please try again later."
      }
    };
    
    const lang = (window.GFI18n?.getLanguage?.() || "fr").substring(0, 2);
    const dict = translations[lang] || translations.fr;
    
    for (const [key, translation] of Object.entries(dict)) {
      if (message.toLowerCase().includes(key.toLowerCase())) {
        return translation;
      }
    }
    
    return defaultMessage;
  }

  // Échappe le HTML pour éviter les XSS
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Expose les fonctions globalement (compatible avec ton code existant)
  window.GFFeedback = {
    showLoading,
    hideLoading,
    showToast,
    showMessage,
    setLoadingState,
    translateError,
    // Alias pour la rétrocompatibilité avec ton code
    msg: showMessage,
    setLoading: setLoadingState
  };

  // Remplace les fonctions existantes si elles sont définies
  if (typeof window.msg === "function") {
    window.GFOldMsg = window.msg;
    window.msg = window.GFFeedback.showMessage;
  }
  if (typeof window.setLoading === "function") {
    window.GFOldSetLoading = window.setLoading;
    window.setLoading = window.GFFeedback.setLoadingState;
  }

  // Nettoie au déchargement
  window.addEventListener("beforeunload", () => {
    hideLoading();
    if (toastContainer) toastContainer.remove();
    if (loadingOverlay) loadingOverlay.remove();
  });
})();
