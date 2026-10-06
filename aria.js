/**
 * Module d'accessibilité (ARIA) pour Meuniance
 * Ajoute les balises ARIA manquantes pour améliorer l'accessibilité
 * Compatible avec tous les thèmes existants
 */
(function() {
  "use strict";

  // Initialise les attributs ARIA pour le header
  function initHeaderARIA() {
    const header = document.querySelector(".public-header");
    if (!header) return;
    
    // Logo
    const logo = header.querySelector(".public-brand");
    if (logo && !logo.getAttribute("aria-label")) {
      logo.setAttribute("aria-label", "Meuniance, retour à l'accueil");
    }
    
    // Navigation
    const nav = header.querySelector(".public-nav");
    if (nav && !nav.getAttribute("aria-label")) {
      nav.setAttribute("aria-label", "Navigation principale");
    }
    
    // Boutons de navigation
    nav?.querySelectorAll("a:not([aria-label])").forEach(link => {
      const text = link.textContent.trim();
      if (text) {
        link.setAttribute("aria-label", text);
      }
    });
  }

  // Initialise les attributs ARIA pour le hero
  function initHeroARIA() {
    const hero = document.querySelector(".hero");
    if (!hero) return;
    
    // Titre
    const title = hero.querySelector("#hero-title");
    if (title && !title.getAttribute("aria-label")) {
      title.setAttribute("aria-label", title.textContent.trim());
    }
    
    // Boutons CTA
    hero.querySelectorAll(".btn, .text-link").forEach(button => {
      if (!button.getAttribute("aria-label")) {
        const text = button.textContent.trim().replace(/[\u2190-\u21FF]/g, "").trim();
        if (text) {
          button.setAttribute("aria-label", text);
        }
      }
    });
  }

  // Initialise les attributs ARIA pour les sections
  function initSectionARIA() {
    document.querySelectorAll(".section").forEach(section => {
      const heading = section.querySelector("h2");
      if (heading && !section.getAttribute("aria-labelledby")) {
        const id = heading.id || `section-${Math.random().toString(36).substr(2, 9)}`;
        heading.id = id;
        section.setAttribute("aria-labelledby", id);
      }
    });
  }

  // Initialise les attributs ARIA pour les cartes (features)
  function initFeatureARIA() {
    document.querySelectorAll(".feature").forEach(feature => {
      const heading = feature.querySelector("h3");
      if (heading && !feature.getAttribute("aria-labelledby")) {
        const id = heading.id || `feature-${Math.random().toString(36).substr(2, 9)}`;
        heading.id = id;
        feature.setAttribute("aria-labelledby", id);
      }
      
      // Icônes
      const icon = feature.querySelector(".feature-icon");
      if (icon && !icon.getAttribute("aria-hidden")) {
        icon.setAttribute("aria-hidden", "true");
      }
    });
  }

  // Initialise les attributs ARIA pour les boutons du thème
  function initThemeSwitcherARIA() {
    const switcher = document.querySelector(".theme-switcher");
    if (!switcher) return;
    
    if (!switcher.getAttribute("role")) {
      switcher.setAttribute("role", "radiogroup");
      switcher.setAttribute("aria-label", "Sélectionner le thème");
    }
    
    switcher.querySelectorAll("button").forEach(button => {
      if (!button.getAttribute("role")) {
        button.setAttribute("role", "radio");
      }
      if (!button.getAttribute("aria-pressed")) {
        button.setAttribute("aria-pressed", "false");
      }
      
      // Ajoute une description pour chaque thème
      const theme = button.dataset.publicTheme || button.className.match(/theme-(\w+)/)?.[1];
      if (theme) {
        const labels = {
          glass: "Thème Verre (sombre avec transparences)",
          editorial: "Thème Éditorial (clair avec contraste élevé)",
          brutal: "Thème Brutal (sombre avec bords marqués)"
        };
        if (labels[theme] && !button.getAttribute("aria-label")) {
          button.setAttribute("aria-label", labels[theme]);
        }
      }
    });
  }

  // Initialise les attributs ARIA pour le footer
  function initFooterARIA() {
    const footer = document.querySelector(".public-footer");
    if (!footer) return;
    
    if (!footer.getAttribute("aria-label")) {
      footer.setAttribute("aria-label", "Pied de page");
    }
    
    // Liens du footer
    footer.querySelectorAll("a:not([aria-label])").forEach(link => {
      const text = link.textContent.trim();
      if (text) {
        link.setAttribute("aria-label", text);
      }
    });
  }

  // Initialise les attributs ARIA pour les formulaires
  function initFormARIA() {
    document.querySelectorAll("form").forEach(form => {
      // Label pour chaque input
      form.querySelectorAll("input:not([aria-label]), textarea:not([aria-label]), select:not([aria-label])").forEach(input => {
        const id = input.id;
        const name = input.name;
        const placeholder = input.placeholder;
        
        if (id) {
          const label = form.querySelector(`label[for="${id}"]`);
          if (label) {
            input.setAttribute("aria-labelledby", label.id || id);
          }
        }
        
        if (!input.getAttribute("aria-label") && placeholder) {
          input.setAttribute("aria-label", placeholder);
        }
        
        if (!input.getAttribute("aria-required") && input.required) {
          input.setAttribute("aria-required", "true");
        }
        
        if (!input.getAttribute("aria-invalid") && input.classList.contains("error")) {
          input.setAttribute("aria-invalid", "true");
        }
      });
      
      // Boutons de formulaire
      form.querySelectorAll("button[type='submit'], button[type='button']").forEach(button => {
        if (!button.getAttribute("aria-label")) {
          const text = button.textContent.trim() || button.value;
          if (text) {
            button.setAttribute("aria-label", text);
          }
        }
        
        if (!button.getAttribute("aria-disabled") && button.disabled) {
          button.setAttribute("aria-disabled", "true");
        }
      });
    });
  }

  // Initialise les attributs ARIA pour les modales/dialogues
  function initDialogARIA() {
    document.querySelectorAll("dialog, [role='dialog']").forEach(dialog => {
      if (!dialog.getAttribute("aria-labelledby")) {
        const heading = dialog.querySelector("h1, h2, h3, [role='heading']");
        if (heading) {
          const id = heading.id || `dialog-title-${Math.random().toString(36).substr(2, 9)}`;
          heading.id = id;
          dialog.setAttribute("aria-labelledby", id);
        }
      }
      
      if (!dialog.getAttribute("aria-describedby")) {
        const description = dialog.querySelector("p, .description");
        if (description) {
          const id = description.id || `dialog-desc-${Math.random().toString(36).substr(2, 9)}`;
          description.id = id;
          dialog.setAttribute("aria-describedby", id);
        }
      }
      
      // Boutons de fermeture
      dialog.querySelectorAll("[data-dialog-close], button[aria-label*='fermer'], button[aria-label*='close']").forEach(btn => {
        if (!btn.getAttribute("aria-label")) {
          btn.setAttribute("aria-label", "Fermer la fenêtre");
        }
      });
    });
  }

  // Initialise les attributs ARIA pour les tableaux
  function initTableARIA() {
    document.querySelectorAll("table").forEach(table => {
      if (!table.getAttribute("role")) {
        table.setAttribute("role", "table");
      }
      
      table.querySelectorAll("thead").forEach(thead => {
        if (!thead.getAttribute("role")) {
          thead.setAttribute("role", "rowgroup");
        }
      });
      
      table.querySelectorAll("tbody").forEach(tbody => {
        if (!tbody.getAttribute("role")) {
          tbody.setAttribute("role", "rowgroup");
        }
      });
      
      table.querySelectorAll("tr").forEach(tr => {
        if (!tr.getAttribute("role")) {
          tr.setAttribute("role", "row");
        }
      });
      
      table.querySelectorAll("th, td").forEach(cell => {
        if (!cell.getAttribute("role")) {
          cell.setAttribute("role", cell.tagName.toLowerCase() === "th" ? "columnheader" : "cell");
        }
        
        // Pour les cellules de données
        if (cell.tagName.toLowerCase() === "td" && !cell.getAttribute("aria-label")) {
          const header = table.querySelector(`th:nth-child(${cell.cellIndex + 1})`);
          if (header) {
            const headerText = header.textContent.trim();
            const cellText = cell.textContent.trim();
            cell.setAttribute("aria-label", `${headerText}: ${cellText}`);
          }
        }
      });
    });
  }

  // Initialise les attributs ARIA pour les éléments interactifs
  function initInteractiveARIA() {
    // Boutons avec icônes
    document.querySelectorAll("button svg, a svg").forEach(svg => {
      if (!svg.getAttribute("aria-hidden")) {
        svg.setAttribute("aria-hidden", "true");
      }
    });
    
    // Éléments cliquables
    document.querySelectorAll("[onclick], [data-action], [data-click]").forEach(el => {
      if (!el.getAttribute("role")) {
        el.setAttribute("role", "button");
      }
      if (!el.getAttribute("tabindex") && !el.hasAttribute("tabindex")) {
        el.setAttribute("tabindex", "0");
      }
    });
    
    // Onglets
    document.querySelectorAll("[role='tablist']").forEach(tablist => {
      tablist.querySelectorAll("[role='tab']").forEach(tab => {
        if (!tab.getAttribute("aria-selected")) {
          tab.setAttribute("aria-selected", tab.classList.contains("active") ? "true" : "false");
        }
        if (!tab.getAttribute("tabindex")) {
          tab.setAttribute("tabindex", tab.getAttribute("aria-selected") === "true" ? "0" : "-1");
        }
      });
    });
  }

  // Améliore la navigation au clavier
  function initKeyboardNavigation() {
    // Ajoute un contour visible pour les éléments focusables
    const style = document.createElement("style");
    style.textContent = `
      *:focus-visible {
        outline: 2px solid var(--accent, #9b72e6);
        outline-offset: 2px;
      }
      
      button:focus-visible,
      a:focus-visible,
      input:focus-visible,
      select:focus-visible,
      textarea:focus-visible {
        outline: 2px solid var(--accent, #9b72e6);
        outline-offset: 2px;
      }
      
      /* Masque le focus par défaut pour les souris */
      *:focus:not(:focus-visible) {
        outline: none;
      }
    `;
    document.head.appendChild(style);
    
    // Gère la navigation au clavier pour les menus
    document.querySelectorAll("[data-menu], [role='menu']").forEach(menu => {
      menu.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          const closeBtn = menu.querySelector("[data-menu-close], [aria-label*='fermer']");
          if (closeBtn) closeBtn.click();
        }
      });
    });
  }

  // Met à jour les attributs ARIA dynamiquement
  function updateDynamicARIA() {
    // Boutons désactivés
    document.querySelectorAll("button[disabled], input[disabled]").forEach(el => {
      el.setAttribute("aria-disabled", "true");
    });
    
    // Champs invalides
    document.querySelectorAll(".error, [aria-invalid='true']").forEach(el => {
      el.setAttribute("aria-invalid", "true");
    });
    
    // Éléments chargés
    document.querySelectorAll(".is-loading, [aria-busy='true']").forEach(el => {
      el.setAttribute("aria-busy", "true");
    });
  }

  // Initialise tous les attributs ARIA
  function initAllARIA() {
    initHeaderARIA();
    initHeroARIA();
    initSectionARIA();
    initFeatureARIA();
    initThemeSwitcherARIA();
    initFooterARIA();
    initFormARIA();
    initDialogARIA();
    initTableARIA();
    initInteractiveARIA();
    initKeyboardNavigation();
    updateDynamicARIA();
    
    // Écoute les changements dynamiques
    const observer = new MutationObserver(updateDynamicARIA);
    observer.observe(document.body, { 
      childList: true, 
      subtree: true, 
      attributes: true 
    });
    
    console.log("ARIA attributes initialized");
  }

  // Expose les fonctions globalement
  window.GFARIA = {
    initAll: initAllARIA,
    initHeader: initHeaderARIA,
    initHero: initHeroARIA,
    initSection: initSectionARIA,
    initFeature: initFeatureARIA,
    initThemeSwitcher: initThemeSwitcherARIA,
    initFooter: initFooterARIA,
    initForm: initFormARIA,
    initDialog: initDialogARIA,
    initTable: initTableARIA,
    initInteractive: initInteractiveARIA,
    initKeyboard: initKeyboardNavigation,
    updateDynamic: updateDynamicARIA
  };

  // Initialise automatiquement quand le DOM est prêt
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAllARIA);
  } else {
    initAllARIA();
  }
})();
