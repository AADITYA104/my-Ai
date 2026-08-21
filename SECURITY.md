# Security Policy & Defense-in-Depth Model 🛡️

Ultron 2026 is designed with an active multi-layer security model to prevent prompt injection, sandbox escapes, unauthorized system modifications, and credential leakage.

---

## 🔒 Defense Layers

1. **Self-Healing Watchdog & Deny-Matrix**:
   - Blocks destructive shell verbs across Linux, Windows PowerShell, and CMD (`Remove-Item -Recurse`, `del /s /q`, `format`, `reg delete`, `rm -rf /`, fork bombs).
2. **Canonical Realpath Sandbox Scoping**:
   - Normalizes and checks real canonical paths using `fs.realpathSync` to eliminate symlink traversal and `..` relative path escapes.
3. **Stream-Level Redaction**:
   - Redacts Google API keys (`AIzaSy...`), OpenAI keys (`sk-...`), GitHub PATs (`ghp_...`), Bearer tokens, and secrets from all console output and Telegram logs in real-time.
4. **Session Canary Tokens**:
   - Injects cryptographic canary tokens (`CANARY-xxxx`) per session to immediately trip execution if a prompt leak occurs.
5. **Per-Chat Telegram Rate Limiting & Command Sanitization**:
   - Sliding-window rate limiter per user/chat and strict shell input sanitization.

---

## 🚨 Reporting a Vulnerability

If you discover a potential security flaw, please do not disclose it publicly on GitHub Issues.
Open a confidential security advisory or reach out to the core maintainers.
