/**
 * Module de chiffrement du localStorage pour Meuniance
 * Utilise Web Crypto API pour chiffrer les données sensibles
 * Compatible avec le système existant (store-shim.js)
 */
(function() {
  "use strict";

  // Clé de chiffrement (doit être la même pour toutes les sessions)
  const ENCRYPTION_KEY_STORAGE = "meuniance.encryptionKey";
  const SALT = "meuniance-salt-v1"; // Sel pour la dérivation de clé
  const ITERATIONS = 100000; // Nombre d'itérations pour PBKDF2

  // Algorithmes utilisés
  const ALGORITHM = { name: "AES-GCM", length: 256 };
  const KEY_DERIVATION = { name: "PBKDF2" };
  const HASH = "SHA-256";

  // Cache pour la clé de chiffrement
  let encryptionKey = null;

  /**
   * Génère une clé de chiffrement à partir d'une phrase de passe
   */
  async function deriveKeyFromPassword(password) {
    const encoder = new TextEncoder();
    const salt = encoder.encode(SALT);
    const passwordBuffer = encoder.encode(password);
    
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      passwordBuffer,
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    
    return await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: ITERATIONS,
        hash: HASH
      },
      keyMaterial,
      ALGORITHM,
      false,
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Génère une nouvelle clé de chiffrement aléatoire
   */
  async function generateNewKey() {
    return await window.crypto.subtle.generateKey(
      ALGORITHM,
      true,
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Exporte une clé en format brut (pour stockage)
   */
  async function exportKey(key) {
    const exported = await window.crypto.subtle.exportKey("raw", key);
    return arrayBufferToBase64(exported);
  }

  /**
   * Importe une clé depuis un format brut
   */
  async function importKey(base64Key) {
    const keyBuffer = base64ToArrayBuffer(base64Key);
    return await window.crypto.subtle.importKey(
      "raw",
      keyBuffer,
      ALGORITHM,
      false,
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Chiffre des données
   */
  async function encryptData(data, key) {
    if (!key) {
      console.warn("Aucune clé de chiffrement disponible");
      return data; // Retourne les données non chiffrées si pas de clé
    }
    
    const encoder = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const dataBuffer = encoder.encode(data);
    
    const encrypted = await window.crypto.subtle.encrypt(
      { name: ALGORITHM.name, iv: iv },
      key,
      dataBuffer
    );
    
    // Combine IV + données chiffrées
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    return arrayBufferToBase64(combined.buffer);
  }

  /**
   * Déchiffre des données
   */
  async function decryptData(encryptedData, key) {
    if (!key) {
      console.warn("Aucune clé de chiffrement disponible");
      return encryptedData; // Retourne les données non déchiffrées si pas de clé
    }
    
    try {
      const combined = base64ToArrayBuffer(encryptedData);
      const iv = combined.slice(0, 12);
      const data = combined.slice(12);
      
      const decrypted = await window.crypto.subtle.decrypt(
        { name: ALGORITHM.name, iv: iv },
        key,
        data
      );
      
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.warn("Échec du déchiffrement:", error.message);
      // Si le déchiffrement échoue, retourne les données originales
      // (pour la compatibilité avec les anciennes données non chiffrées)
      return encryptedData;
    }
  }

  /**
   * Récupère ou génère la clé de chiffrement
   */
  async function getEncryptionKey(password) {
    // Si on a déjà la clé en cache
    if (encryptionKey) return encryptionKey;
    
    // Essaie de récupérer la clé depuis le localStorage
    try {
      const storedKey = localStorage.getItem(ENCRYPTION_KEY_STORAGE);
      if (storedKey) {
        encryptionKey = await importKey(storedKey);
        return encryptionKey;
      }
    } catch (e) {
      console.warn("Impossible de lire la clé de chiffrement:", e.message);
    }
    
    // Génère une nouvelle clé
    if (password) {
      encryptionKey = await deriveKeyFromPassword(password);
    } else {
      encryptionKey = await generateNewKey();
      // Sauvegarde la clé (seulement si on peut)
      try {
        const exportedKey = await exportKey(encryptionKey);
        localStorage.setItem(ENCRYPTION_KEY_STORAGE, exportedKey);
      } catch (e) {
        console.warn("Impossible de sauvegarder la clé de chiffrement:", e.message);
      }
    }
    
    return encryptionKey;
  }

  /**
   * Supprime la clé de chiffrement
   */
  async function clearEncryptionKey() {
    encryptionKey = null;
    try {
      localStorage.removeItem(ENCRYPTION_KEY_STORAGE);
    } catch (e) {
      console.warn("Impossible de supprimer la clé de chiffrement:", e.message);
    }
  }

  /**
   * Wrapper pour localStorage avec chiffrement automatique
   */
  const SecureStorage = {
    // Chiffré avec la clé de session (mot de passe utilisateur)
    async getItem(key, password) {
      try {
        const encrypted = localStorage.getItem(key);
        if (!encrypted) return null;
        
        // Si les données ne sont pas au format chiffré (pas de Base64 valide)
        // on suppose que ce sont des données non chiffrées (anciennes)
        if (!isBase64(encrypted)) {
          return encrypted;
        }
        
        const key = await getEncryptionKey(password);
        return await decryptData(encrypted, key);
      } catch (e) {
        console.error("Erreur lors de la lecture:", e.message);
        return null;
      }
    },
    
    async setItem(key, value, password) {
      try {
        const key = await getEncryptionKey(password);
        const encrypted = await encryptData(value, key);
        localStorage.setItem(key, encrypted);
      } catch (e) {
        console.error("Erreur lors de l'écriture:", e.message);
        // Si le chiffrement échoue, sauvegarde en clair (fallback)
        localStorage.setItem(key, value);
      }
    },
    
    async removeItem(key) {
      localStorage.removeItem(key);
    },
    
    async clear() {
      localStorage.clear();
      encryptionKey = null;
    }
  };

  /**
   * Wrapper pour sessionStorage avec chiffrement
   */
  const SecureSessionStorage = {
    async getItem(key, password) {
      try {
        const encrypted = sessionStorage.getItem(key);
        if (!encrypted) return null;
        
        if (!isBase64(encrypted)) {
          return encrypted;
        }
        
        const key = await getEncryptionKey(password);
        return await decryptData(encrypted, key);
      } catch (e) {
        console.error("Erreur lors de la lecture session:", e.message);
        return null;
      }
    },
    
    async setItem(key, value, password) {
      try {
        const key = await getEncryptionKey(password);
        const encrypted = await encryptData(value, key);
        sessionStorage.setItem(key, encrypted);
      } catch (e) {
        console.error("Erreur lors de l'écriture session:", e.message);
        sessionStorage.setItem(key, value);
      }
    },
    
    async removeItem(key) {
      sessionStorage.removeItem(key);
    },
    
    async clear() {
      sessionStorage.clear();
      encryptionKey = null;
    }
  };

  /**
   * Utilitaires
   */
  function arrayBufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function isBase64(str) {
    try {
      return window.atob(str).length > 0;
    } catch (e) {
      return false;
    }
  }

  /**
   * Chiffrement pour les données du tableur
   * Utilise une clé dérivée du mot de passe utilisateur + sel utilisateur
   */
  async function encryptSheetData(data, userId, password) {
    if (!userId || !password) {
      console.warn("Impossible de chiffrer: userId ou password manquant");
      return data;
    }
    
    // Dérive une clé spécifique à l'utilisateur
    const userKey = await deriveKeyFromPassword(userId + password + SALT);
    return await encryptData(data, userKey);
  }

  async function decryptSheetData(encryptedData, userId, password) {
    if (!userId || !password) {
      console.warn("Impossible de déchiffrer: userId ou password manquant");
      return encryptedData;
    }
    
    try {
      const userKey = await deriveKeyFromPassword(userId + password + SALT);
      return await decryptData(encryptedData, userKey);
    } catch (e) {
      console.warn("Déchiffrement échoué:", e.message);
      return encryptedData;
    }
  }

  // Expose les fonctions globalement
  window.GFStorageEncryption = {
    // Fonctions principales
    getEncryptionKey,
    clearEncryptionKey,
    encryptData,
    decryptData,
    
    // Stockage sécurisé
    SecureStorage,
    SecureSessionStorage,
    
    // Pour les données du tableur
    encryptSheetData,
    decryptSheetData,
    
    // Utilitaires
    exportKey,
    importKey,
    generateNewKey,
    deriveKeyFromPassword
  };

  // Étend le système de stockage existant si présent
  if (window.GFStorage) {
    window.GFStorage.secure = SecureStorage;
    window.GFStorage.secureSession = SecureSessionStorage;
    window.GFStorage.encryptSheet = encryptSheetData;
    window.GFStorage.decryptSheet = decryptSheetData;
  }
})();
