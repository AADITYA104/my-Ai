/**
 * ============================================================================
 *  ULTRON PERSISTENT BROWSER AUTOMATION AGENT (2026 ARCHITECTURE)
 *  - Persistent Session Storage & Cookie Storage (.browser_session/).
 *  - Externalized Resilient Selector Mapping (browser_selectors.json).
 *  - Human-in-the-loop Gate for Captchas and 2FA.
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");

class BrowserAgent {
  constructor(storageDir = path.join(__dirname, "agent-memory")) {
    this.storageDir = storageDir;
    this.sessionDir = path.join(this.storageDir, ".browser_session");
    this.selectorsFile = path.join(this.storageDir, "browser_selectors.json");
    this.selectors = {};
    this.init();
  }

  init() {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
    if (fs.existsSync(this.selectorsFile)) {
      try {
        this.selectors = JSON.parse(fs.readFileSync(this.selectorsFile, "utf-8"));
      } catch (_) {
        this.selectors = {};
      }
    } else {
      // Default standard selectors
      this.selectors = {
        google_search_input: "textarea[name='q'], input[name='q']",
        github_search_input: "input[placeholder*='Search']",
        submit_button: "button[type='submit'], input[type='submit']"
      };
      try {
        fs.writeFileSync(this.selectorsFile, JSON.stringify(this.selectors, null, 2), "utf-8");
      } catch (_) {}
    }
  }

  getSelector(key, fallback) {
    return this.selectors[key] || fallback || key;
  }

  /**
   * Execute persistent browser task using Playwright (if installed) or graceful fetch fallback
   */
  async navigateAndExtract(url, selectorKey = null) {
    const selector = selectorKey ? this.getSelector(selectorKey) : null;
    try {
      // Check if playwright is available
      const { chromium } = require("playwright");
      console.log(`🌐 [BROWSER AGENT] Launching persistent context for: ${url}`);
      const context = await chromium.launchPersistentContext(this.sessionDir, {
        headless: true,
        viewport: { width: 1280, height: 720 },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      });

      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

      // Captcha / Cloudflare check
      const pageTitle = await page.title();
      const pageContent = await page.content();
      if (pageContent.includes("cf-browser-verification") || pageContent.includes("g-recaptcha") || /captcha|challenge/i.test(pageTitle)) {
        console.warn("⚠️ [BROWSER GATE] Captcha / Verification barrier detected.");
        await context.close();
        return {
          success: false,
          needsHumanVerification: true,
          message: "Captcha or 2FA challenge detected on page. Human interaction required."
        };
      }

      let extractedData = "";
      if (selector) {
        extractedData = await page.locator(selector).allInnerTexts();
      } else {
        extractedData = await page.innerText("body");
      }

      await context.close();
      return {
        success: true,
        title: pageTitle,
        data: typeof extractedData === "string" ? extractedData.slice(0, 4000) : extractedData
      };
    } catch (err) {
      console.warn(`[PLAYWRIGHT FALLBACK] ${err.message}. Using lightweight HTTP fetch.`);
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Ultron/2026" },
          signal: AbortSignal.timeout(15000)
        });
        const text = await res.text();
        return {
          success: true,
          title: url,
          data: text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 4000)
        };
      } catch (fetchErr) {
        return {
          success: false,
          error: fetchErr.message
        };
      }
    }
  }
}

module.exports = new BrowserAgent();
