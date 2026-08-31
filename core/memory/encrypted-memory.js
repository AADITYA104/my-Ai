/**
 * ============================================================================
 *  ULTRON ENCRYPTED LOCAL MEMORY ENGINE (CORE/MEMORY/ENCRYPTED-MEMORY.JS)
 *  - AES-256-GCM authenticated encryption for private notes, tokens, and logs.
 *  - Zero cloud leakage, local hardware key derivation via PBKDF2 / SHA256.
 * ============================================================================
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

class EncryptedMemory {
  constructor(storageDir = path.join(__dirname, "..", "..", "agent-memory")) {
    this.storageDir = storageDir;
    this.vaultFile = path.join(this.storageDir, "encrypted_vault.bin");
    this.key = this.deriveMasterKey();
  }

  /**
   * Derive a 256-bit encryption key from an operator-supplied secret.
   * SECURITY: no hardcoded fallback. A fallback key baked into public
   * source code means anyone who reads this file can decrypt every
   * "encrypted" vault created without MEMORY_ENCRYPTION_KEY set. If unset,
   * generate a random local key ONCE and persist it outside the repo
   * (agent-memory is gitignored) — never fall back to a fixed string.
   */
  deriveMasterKey() {
    let rawSecret = process.env.MEMORY_ENCRYPTION_KEY;
    if (!rawSecret) {
      const keyFile = path.join(this.storageDir, ".local_key");
      try {
        if (fs.existsSync(keyFile)) {
          rawSecret = fs.readFileSync(keyFile, "utf-8").trim();
        } else {
          rawSecret = crypto.randomBytes(32).toString("hex");
          fs.mkdirSync(this.storageDir, { recursive: true });
          fs.writeFileSync(keyFile, rawSecret, { mode: 0o600 });
          console.warn("⚠️ [ENCRYPTED MEMORY] MEMORY_ENCRYPTION_KEY not set — generated a random local key at agent-memory/.local_key. Set MEMORY_ENCRYPTION_KEY in .env for a key that survives a fresh clone/reinstall.");
        }
      } catch (err) {
        console.error(`[ENCRYPTED MEMORY] Could not persist local key (${err.message}) — using a session-only random key; data will be unreadable after restart.`);
        rawSecret = crypto.randomBytes(32).toString("hex");
      }
    }
    return crypto.createHash("sha256").update(rawSecret).digest();
  }

  /**
   * Encrypt a string using AES-256-GCM
   */
  encrypt(plaintext) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag();

    return {
      iv: iv.toString("hex"),
      tag: tag.toString("hex"),
      content: encrypted
    };
  }

  /**
   * Decrypt a payload using AES-256-GCM
   */
  decrypt(encryptedData) {
    if (!encryptedData || !encryptedData.iv || !encryptedData.tag || !encryptedData.content) {
      return null;
    }
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, Buffer.from(encryptedData.iv, "hex"));
      decipher.setAuthTag(Buffer.from(encryptedData.tag, "hex"));
      let decrypted = decipher.update(encryptedData.content, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (err) {
      console.warn(`[ENCRYPTED MEMORY DECRYPT ERROR] ${err.message}`);
      return null;
    }
  }

  /**
   * Save a secure key-value entry to local encrypted vault
   */
  saveSecureEntry(key, value) {
    let currentVault = {};
    if (fs.existsSync(this.vaultFile)) {
      try {
        const raw = fs.readFileSync(this.vaultFile, "utf-8");
        const json = JSON.parse(raw);
        const decryptedJson = this.decrypt(json);
        if (decryptedJson) currentVault = JSON.parse(decryptedJson);
      } catch (_) {
        currentVault = {};
      }
    }

    currentVault[key] = {
      value,
      updatedAt: new Date().toISOString()
    };

    const serialized = JSON.stringify(currentVault, null, 2);
    const encryptedPayload = this.encrypt(serialized);
    fs.writeFileSync(this.vaultFile, JSON.stringify(encryptedPayload, null, 2), "utf-8");
    return true;
  }

  /**
   * Retrieve a secure key-value entry
   */
  getSecureEntry(key) {
    if (!fs.existsSync(this.vaultFile)) return null;
    try {
      const raw = fs.readFileSync(this.vaultFile, "utf-8");
      const json = JSON.parse(raw);
      const decryptedJson = this.decrypt(json);
      if (!decryptedJson) return null;
      const vault = JSON.parse(decryptedJson);
      return vault[key] ? vault[key].value : null;
    } catch (_) {
      return null;
    }
  }
}

module.exports = new EncryptedMemory();
