/**
 * Corrections propres à iPhone / iPad (Safari).
 * Uniquement ce qui sert : pas de zoom automatique dans les champs, champ visible au-dessus du clavier,
 * contour de saisie aux couleurs du site et animations réduites si l'utilisateur le demande.
 * Les tailles tactiles sont gérées par chaque composant (44 px) : aucune règle globale ici.
 */
(function() {
  "use strict";

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
           (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function isSafari() {
    return /Safari/.test(navigator.userAgent) &&
           !/Chrome|Chromium|Edge|OPR/.test(navigator.userAgent);
  }

  function addStyle(css) {
    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  // Safari zoome sur un champ dont le texte fait moins de 16 px : on l'en empêche sur mobile.
  function fixAutoZoom() {
    addStyle(
      "@media (max-width: 768px) {" +
      "input[type='text'], input[type='email'], input[type='password'], input[type='number'], input[type='tel']," +
      "input[type='search'], input[type='date'], input:not([type]), textarea, select {" +
      "font-size: 16px !important; -webkit-text-size-adjust: 100% !important; text-size-adjust: 100% !important; } }"
    );
  }

  // Contour de saisie visible au clavier, discret au toucher.
  function fixInputFocus() {
    addStyle(
      "input:focus-visible, textarea:focus-visible, select:focus-visible {" +
      "outline: 2px solid var(--text, #17261F) !important; outline-offset: -2px !important; box-shadow: none !important; }"
    );
  }

  // Le clavier iOS peut cacher le champ en cours : on le ramène au centre.
  function fixKeyboardOverlap() {
    window.addEventListener("focusin", function(e) {
      var target = e.target;
      if (!target || target.readOnly || (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA")) return;
      setTimeout(function() {
        var rect = target.getBoundingClientRect();
        if (rect.bottom > window.innerHeight - 250) target.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    });
  }

  // Respecte « Réduire les animations » des réglages d'accessibilité.
  function fixAnimations() {
    addStyle(
      "@media (prefers-reduced-motion: reduce) {" +
      "*, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; } }"
    );
  }

  function initIOSFixes() {
    if (!isIOS() && !isSafari()) return;
    fixAutoZoom();
    fixInputFocus();
    if (isIOS()) fixKeyboardOverlap();
    fixAnimations();
    document.body.classList.add("is-ios");
    if (isSafari()) document.body.classList.add("is-safari");
  }

  window.GFIOSFix = { isIOS: isIOS, isSafari: isSafari, init: initIOSFixes };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initIOSFixes);
  } else {
    initIOSFixes();
  }
})();
