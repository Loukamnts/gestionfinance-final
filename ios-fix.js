/**
 * Corrections spécifiques pour iOS
 * Résout les problèmes d'affichage des inputs type="number" sur iOS
 * et autres problèmes courants sur les appareils Apple
 */
(function() {
  "use strict";

  // Détecte si on est sur iOS
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  // Détecte si on est sur Safari
  function isSafari() {
    return /Safari/.test(navigator.userAgent) && 
           !/Chrome|Chromium|Edge|OPR/.test(navigator.userAgent);
  }

  // Problème 1: Les inputs type="number" sur iOS montrent des flèches
  // qui prennent trop de place et masquent le texte
  function fixNumberInput() {
    if (!isIOS() && !isSafari()) return;
    
    // Remplace type="number" par type="text" avec inputmode="decimal"
    document.querySelectorAll('input[type="number"]').forEach(input => {
      // Conserve les attributs existants
      const min = input.min;
      const max = input.max;
      const step = input.step;
      const pattern = input.pattern;
      const required = input.required;
      const placeholder = input.placeholder;
      const value = input.value;
      const id = input.id;
      const name = input.name;
      const className = input.className;
      
      // Crée un nouvel input
      const newInput = document.createElement('input');
      newInput.type = 'text';
      newInput.inputMode = 'decimal';
      newInput.pattern = pattern || '[0-9]*[.,]?[0-9]*';
      
      // Copie tous les attributs
      if (min) newInput.min = min;
      if (max) newInput.max = max;
      if (step) newInput.step = step;
      if (required) newInput.required = required;
      if (placeholder) newInput.placeholder = placeholder;
      if (value) newInput.value = value;
      if (id) newInput.id = id;
      if (name) newInput.name = name;
      if (className) newInput.className = className;
      
      // Copie les event listeners
      const events = ['change', 'input', 'blur', 'focus', 'keydown', 'keyup', 'click'];
      events.forEach(event => {
        if (input[`on${event}`]) {
          newInput[`on${event}`] = input[`on${event}`];
        }
      });
      
      // Copie les données et attributs personnalisés
      for (let i = 0; i < input.attributes.length; i++) {
        const attr = input.attributes[i];
        if (attr.name.startsWith('data-') || attr.name.startsWith('aria-')) {
          newInput.setAttribute(attr.name, attr.value);
        }
      }
      
      // Remplace l'ancien input
      input.parentNode.replaceChild(newInput, input);
      
      // Ajoute un validateur pour accepter seulement les nombres
      newInput.addEventListener('input', function(e) {
        // Supprime tout sauf les chiffres, le point et la virgule
        let value = e.target.value.replace(/[^0-9.,-]/g, '');
        
        // Gère le cas où il y a plusieurs séparateurs décimaux
        const parts = value.split(/[.,]/);
        if (parts.length > 2) {
          value = parts[0] + '.' + parts.slice(1).join('');
        }
        
        // Normalise le séparateur décimal
        if (value.includes(',') && value.includes('.')) {
          value = value.replace(',', '');
        }
        
        // Si la valeur commence par un séparateur, on le supprime
        if (/^[.,]/.test(value)) {
          value = value.substring(1);
        }
        
        e.target.value = value;
      });
      
      // Ajoute un validateur pour la soumission du formulaire
      const form = input.closest('form');
      if (form) {
        form.addEventListener('submit', function(e) {
          // Convertit les virgules en points pour la soumission
          const textInputs = form.querySelectorAll('input[inputmode="decimal"]');
          textInputs.forEach(input => {
            input.value = input.value.replace(',', '.');
          });
        });
      }
    });
  }

  // Problème 2: Le zoom automatique sur les inputs sur iOS
  function fixAutoZoom() {
    if (!isIOS()) return;
    
    // Désactive le zoom automatique sur tous les inputs
    const style = document.createElement('style');
    style.textContent = `
      @media (max-width: 768px) {
        input[type="text"],
        input[type="email"],
        input[type="password"],
        input[type="number"],
        input[type="tel"],
        input[type="search"],
        input:not([type]),
        textarea,
        select {
          font-size: 16px !important;
          -webkit-text-size-adjust: 100% !important;
          text-size-adjust: 100% !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Problème 3: Le scroll élastique sur iOS qui déplace les overlays
  function fixElasticScroll() {
    if (!isIOS()) return;
    
    // Applique -webkit-overflow-scrolling: touch à tous les conteneurs qui en ont besoin
    document.querySelectorAll('.onboarding-overlay, .tutorial-overlay, dialog, [role="dialog"]').forEach(el => {
      el.style.webkitOverflowScrolling = 'touch';
      el.style.overflowScrolling = 'touch';
    });
    
    // Empêche le scroll sur le body quand une modale est ouverte
    document.querySelectorAll('dialog, [role="dialog"]').forEach(dialog => {
      dialog.addEventListener('open', () => {
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
      });
      
      dialog.addEventListener('close', () => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
      });
    });
  }

  // Problème 4: Les boutons ont besoin d'une zone de touch plus grande sur iOS
  function fixTouchTargets() {
    if (!isIOS()) return;
    
    const style = document.createElement('style');
    style.textContent = `
      button,
      [role="button"],
      .btn,
      a {
        min-height: 44px;
        min-width: 44px;
        padding: 12px !important;
      }
      
      /* Pour les petits boutons */
      button:not([class*="btn-"]),
      [role="button"]:not([class*="btn-"]) {
        min-height: 36px;
        min-width: 36px;
      }
    `;
    document.head.appendChild(style);
  }

  // Problème 5: Les inputs ont besoin d'un meilleur focus sur iOS
  function fixInputFocus() {
    if (!isIOS()) return;
    
    const style = document.createElement('style');
    style.textContent = `
      input:focus,
      textarea:focus,
      select:focus {
        outline: 2px solid var(--accent, #9b72e6) !important;
        outline-offset: -2px !important;
        box-shadow: 0 0 0 3px rgba(155, 114, 230, 0.2) !important;
      }
      
      /* Supprime le focus par défaut d'iOS */
      input:focus:not(:focus-visible),
      textarea:focus:not(:focus-visible),
      select:focus:not(:focus-visible) {
        outline: none !important;
        box-shadow: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  // Problème 6: Les menus déroulants personnalisés sur iOS
  function fixCustomSelects() {
    if (!isIOS()) return;
    
    // Sur iOS, les selects natifs sont préférables
    document.querySelectorAll('.custom-select, [data-select]').forEach(select => {
      select.style.webkitAppearance = 'none';
      select.style.MozAppearance = 'none';
      select.style.appearance = 'none';
    });
  }

  // Problème 7: Le clavier cache le contenu sur iOS
  function fixKeyboardOverlap() {
    if (!isIOS()) return;
    
    window.addEventListener('focusin', function(e) {
      const target = e.target;
      
      // Si c'est un input ou textarea
      if ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && 
          !target.readOnly) {
        
        // Fait défiler pour montrer l'input
        setTimeout(() => {
          const rect = target.getBoundingClientRect();
          const windowHeight = window.innerHeight;
          const keyboardHeight = 250; // Hauteur estimée du clavier
          
          if (rect.bottom > windowHeight - keyboardHeight) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 300);
      }
    });
  }

  // Problème 8: Les animations CSS qui ne sont pas fluides sur iOS
  function fixAnimations() {
    if (!isIOS()) return;
    
    // Désactive les animations coûteuses sur iOS
    const style = document.createElement('style');
    style.textContent = `
      * {
        will-change: auto !important;
      }
      
      /* Optimise les animations */
      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Initialise toutes les corrections
  function initIOSFixes() {
    if (!isIOS() && !isSafari()) return;
    
    console.log('Application des corrections iOS/Safari');
    
    fixNumberInput();
    fixAutoZoom();
    fixElasticScroll();
    fixTouchTargets();
    fixInputFocus();
    fixCustomSelects();
    fixKeyboardOverlap();
    fixAnimations();
    
    // Ajoute une classe au body pour cibler iOS
    document.body.classList.add('is-ios');
    
    // Ajoute une classe pour Safari
    if (isSafari()) {
      document.body.classList.add('is-safari');
    }
  }

  // Expose les fonctions globalement
  window.GFIOSFix = {
    isIOS,
    isSafari,
    fixNumberInput,
    fixAutoZoom,
    fixElasticScroll,
    fixTouchTargets,
    fixInputFocus,
    fixCustomSelects,
    fixKeyboardOverlap,
    fixAnimations,
    init: initIOSFixes
  };

  // Initialise automatiquement quand le DOM est prêt
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initIOSFixes);
  } else {
    initIOSFixes();
  }
})();
