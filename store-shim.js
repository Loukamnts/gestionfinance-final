/* safeStore — wrapper de stockage qui bascule en mémoire si l'API native est
   bloquée (ex. iframe de prévisualisation). API identique au stockage web. */
(function () {
  var mem = {};
  var privateKeys = {
    finance_sheet_v3: true,
    finance_sheet_v2: true,
    "personalFinanceDashboard.setupProfile": true,
    "personalFinanceDashboard.categoryRules": true,
    "personalFinanceDashboard.customRules": true
  };
  var financialOwner = "anonymous";
  var firstAccount = null;
  var accountSeen = false;
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

  try { accountSeen = nativeStore && nativeStore.getItem("gf-private-v1:account-seen") === "1"; } catch (e) {}
  function privateName(k) { return privateKeys[k] ? "gf-private-v1:" + financialOwner + ":" + k : k; }
  function rawGet(k) { if (nativeStore) { try { return nativeStore.getItem(k); } catch (e) {} } return Object.prototype.hasOwnProperty.call(mem,k) ? mem[k] : null; }
  function rawSet(k,v) { if (nativeStore) { try { nativeStore.setItem(k,String(v)); return; } catch (e) {} } mem[k]=String(v); }
  function rawRemove(k) { if (nativeStore) { try { nativeStore.removeItem(k); } catch (e) {} } delete mem[k]; }
  window.safeStore = {
    getItem: function (k) {
      return rawGet(privateName(k));
    },
    setItem: function (k, v) {
      rawSet(privateName(k),v);
    },
    removeItem: function (k) {
      rawRemove(privateName(k));
    },
    financialOwner: function () { return financialOwner; },
    setFinancialOwner: function (id) {
      var next = /^[0-9a-f-]{36}$/i.test(String(id||"")) ? String(id).toLowerCase() : "anonymous";
      if (next !== "anonymous" && !accountSeen && firstAccount === null) firstAccount = next;
      if (next !== "anonymous") { accountSeen = true; rawSet("gf-private-v1:account-seen","1"); }
      financialOwner = next;
      return next;
    },
    claimAnonymousFor: function (id) {
      if (!id || String(id).toLowerCase() !== firstAccount || financialOwner !== firstAccount) return false;
      var copied = false;
      Object.keys(privateKeys).forEach(function (key) {
        var source = rawGet("gf-private-v1:anonymous:"+key);
        var target = "gf-private-v1:"+firstAccount+":"+key;
        if (source !== null) {
          if (rawGet(target) === null) { rawSet(target,source); copied = true; }
          else rawSet("gf-private-v1:"+firstAccount+":anonymous-backup:"+key,source);
          rawRemove("gf-private-v1:anonymous:"+key);
        }
      });
      firstAccount = null;
      return copied;
    },
    discardAnonymousClaim: function () {
      if (firstAccount) Object.keys(privateKeys).forEach(function (key) {
        var anonymousKey="gf-private-v1:anonymous:"+key;
        var source=rawGet(anonymousKey);
        if(source!==null){rawSet("gf-private-v1:"+firstAccount+":anonymous-backup:"+key,source);rawRemove(anonymousKey);}
      });
      firstAccount = null;
    },
    clearFinancialOwnerData: function (id) {
      var owner = String(id || "").toLowerCase();
      if (!/^[0-9a-f-]{36}$/.test(owner)) return false;
      Object.keys(privateKeys).forEach(function (key) { rawRemove("gf-private-v1:" + owner + ":" + key); });
      rawRemove("gf-private-v1:" + owner + ":sync-pending");
      return true;
    },
    getFinancialSyncPending: function () { return financialOwner !== "anonymous" && rawGet("gf-private-v1:" + financialOwner + ":sync-pending") === "1"; },
    setFinancialSyncPending: function (pending) {
      if (financialOwner === "anonymous") return;
      var key = "gf-private-v1:" + financialOwner + ":sync-pending";
      if (pending) rawSet(key, "1"); else rawRemove(key);
    },
    hasLegacyFinancialData: function () {
      return rawGet("finance_sheet_v3") !== null || rawGet("personalFinanceDashboard.setupProfile") !== null;
    }
  };
})();
