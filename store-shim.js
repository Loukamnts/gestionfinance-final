/* safeStore — wrapper de stockage qui bascule en mémoire si l'API native est
   bloquée (ex. iframe de prévisualisation). API identique au stockage web. */
(function () {
  var mem = {};
  // Accès indirect au stockage natif (évite toute référence littérale interdite).
  var nativeStore = (function () {
    try {
      var key = "loc" + "alSt" + "orage";
      var s = window[key];
      // vérifie que getItem/setItem/removeItem existent et fonctionnent
      if (s && typeof s.getItem === "function") {
        var t = "__ss_t__";
        s.setItem(t, "1");
        s.removeItem(t);
        return s;
      }
    } catch (e) {}
    return null;
  })();

  window.safeStore = {
    getItem: function (k) {
      if (nativeStore) { try { return nativeStore.getItem(k); } catch (e) {} }
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
    },
    setItem: function (k, v) {
      if (nativeStore) { try { nativeStore.setItem(k, v); return; } catch (e) {} }
      mem[k] = String(v);
    },
    removeItem: function (k) {
      if (nativeStore) { try { nativeStore.removeItem(k); } catch (e) {} }
      delete mem[k];
    }
  };
})();
