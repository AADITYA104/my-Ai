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

  /**
   * [INDEXED INTERACTIVE ELEMENTS] Ported concept from browser-use — instead
   * of asking the LLM to write a CSS selector (error-prone, frequently
   * hallucinated), enumerate every clickable/fillable element on the page,
   * number them, and let the LLM act by index ("click element 4") which is
   * far more reliable. Keeps the browser session open across calls (until
   * closeSession()) so index-based actions can follow a navigation.
   */
  async openSession(url) {
    const { chromium } = require("playwright");
    if (this._context) await this.closeSession();
    this._context = await chromium.launchPersistentContext(this.sessionDir, {
      headless: true,
      viewport: { width: 1280, height: 720 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    });
    this._page = await this._context.newPage();
    await this._page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    return this.getInteractiveElements();
  }

  async getInteractiveElements() {
    if (!this._page) return { success: false, error: "No open browser session — call openSession(url) first." };
    const elements = await this._page.evaluate(() => {
      const selector = "a, button, input, select, textarea, [role='button'], [onclick]";
      const nodes = Array.from(document.querySelectorAll(selector));
      return nodes
        .filter(el => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        })
        .slice(0, 80) // cap to keep the list usable in a prompt
        .map((el, i) => {
          const base = {
            index: i,
            tag: el.tagName.toLowerCase(),
            text: (el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().slice(0, 80),
            type: el.getAttribute("type") || null
          };
          // [DROPDOWN OPTIONS] Ported from browser-use — surface a <select>'s
          // valid option labels so the LLM can pick a real one instead of
          // guessing text that doesn't exist in the dropdown.
          if (el.tagName.toLowerCase() === "select") {
            base.options = Array.from(el.options).slice(0, 30).map(o => o.label || o.value);
          }
          return base;
        });
    });
    this._elementCache = elements;
    return { success: true, elements };
  }

  /** Act on a specific numbered element from the last getInteractiveElements() call.
   * Supports click, fill/type, and select (for <select> dropdowns). */
  async actByIndex(index, action = "click", value = "") {
    if (!this._page) return { success: false, error: "No open browser session — call openSession(url) first." };
    if (!this._elementCache || !this._elementCache[index]) {
      return { success: false, error: `No cached element at index ${index}. Call getInteractiveElements() first.` };
    }
    const selector = `${this._elementCache[index].tag}, a, button, input, select, textarea, [role='button'], [onclick]`;
    try {
      const handle = (await this._page.$$(selector))[index];
      if (!handle) return { success: false, error: `Element at index ${index} no longer present on the page (it may have changed).` };
      if (action === "click") {
        await handle.click({ timeout: 5000 });
      } else if (action === "fill" || action === "type") {
        await handle.fill(String(value), { timeout: 5000 });
      } else if (action === "select") {
        await handle.selectOption({ label: String(value) }, { timeout: 5000 }).catch(() => handle.selectOption(String(value), { timeout: 5000 }));
      } else {
        return { success: false, error: `Unknown action "${action}". Use "click", "fill", or "select".` };
      }
      await this._page.waitForTimeout(400); // let the page settle after the interaction
      const refreshed = await this.getInteractiveElements();
      return { success: true, action, index, elements: refreshed.elements };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /** [SCROLL] Ported from browser-use's scroll action — pages routinely hide
   * content below the fold; without this the agent can only ever see/act on
   * whatever happened to be in the initial viewport. */
  async scroll(direction = "down", amount = 600) {
    if (!this._page) return { success: false, error: "No open browser session — call openSession(url) first." };
    try {
      const delta = direction === "up" ? -Math.abs(amount) : Math.abs(amount);
      await this._page.mouse.wheel(0, delta);
      await this._page.waitForTimeout(300);
      const refreshed = await this.getInteractiveElements();
      return { success: true, direction, amount, elements: refreshed.elements };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /** [GO BACK] Ported from browser-use — undo a navigation without needing
   * to re-derive the previous URL. */
  async goBack() {
    if (!this._page) return { success: false, error: "No open browser session — call openSession(url) first." };
    try {
      await this._page.goBack({ waitUntil: "domcontentloaded", timeout: 15000 });
      const refreshed = await this.getInteractiveElements();
      return { success: true, url: this._page.url(), elements: refreshed.elements };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /** [SEND KEYS] Ported from browser-use — keyboard-only interactions
   * (Escape to dismiss a popup, Enter to submit, Ctrl+A to select-all) that
   * click/fill can't express. */
  async sendKeys(keys) {
    if (!this._page) return { success: false, error: "No open browser session — call openSession(url) first." };
    try {
      await this._page.keyboard.press(String(keys));
      await this._page.waitForTimeout(300);
      const refreshed = await this.getInteractiveElements();
      return { success: true, keys, elements: refreshed.elements };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /** [EXTRACT] Ported from browser-use's extract action — pull the page's
   * visible text content (optionally scoped to a CSS selector) so the LLM
   * can read/summarize it, separate from the interactive-element list. */
  async extractContent(selector = null) {
    if (!this._page) return { success: false, error: "No open browser session — call openSession(url) first." };
    try {
      const text = selector
        ? (await this._page.locator(selector).allInnerTexts()).join("\n")
        : await this._page.innerText("body");
      return { success: true, selector: selector || "body", content: text.replace(/\s+/g, " ").trim().slice(0, 6000) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /** [FIND TEXT] Ported from browser-use's "scroll to text" action — jump
   * straight to a piece of text instead of scrolling blindly and hoping. */
  async findText(text) {
    if (!this._page) return { success: false, error: "No open browser session — call openSession(url) first." };
    try {
      const locator = this._page.getByText(String(text), { exact: false }).first();
      const count = await locator.count();
      if (count === 0) return { success: false, error: `Text "${text}" not found on the page.` };
      await locator.scrollIntoViewIfNeeded({ timeout: 5000 });
      await this._page.waitForTimeout(300);
      const refreshed = await this.getInteractiveElements();
      return { success: true, text, elements: refreshed.elements };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /** [SCREENSHOT] Ported from browser-use — visual verification for cases
   * where the DOM element list alone doesn't tell the full story (layout,
   * rendered charts/images, a CAPTCHA needing human review). */
  async screenshot(fileName = null) {
    if (!this._page) return { success: false, error: "No open browser session — call openSession(url) first." };
    try {
      const dir = path.join(this.storageDir, "screenshots");
      fs.mkdirSync(dir, { recursive: true });
      const name = fileName || `screenshot_${Date.now()}.png`;
      const filePath = path.join(dir, name);
      await this._page.screenshot({ path: filePath, timeout: 10000 });
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /** [SAVE AS PDF] Ported from browser-use. Note: Playwright's page.pdf()
   * only works in Chromium and only in headless mode. */
  async saveAsPDF(fileName = null) {
    if (!this._page) return { success: false, error: "No open browser session — call openSession(url) first." };
    try {
      const dir = path.join(this.storageDir, "pdfs");
      fs.mkdirSync(dir, { recursive: true });
      const name = fileName || `page_${Date.now()}.pdf`;
      const filePath = path.join(dir, name);
      await this._page.pdf({ path: filePath });
      return { success: true, filePath };
    } catch (err) {
      return { success: false, error: `${err.message} (page.pdf() requires headless Chromium — not supported on WebKit/Firefox).` };
    }
  }

  /** [MULTI-TAB] Ported from browser-use's switch_tab/close_tab. Tracks all
   * pages opened in the current persistent context (a click with
   * target="_blank", or an explicit openTab() call) so the agent can work
   * across more than one open tab. */
  async listTabs() {
    if (!this._context) return { success: false, error: "No open browser session — call openSession(url) first." };
    const pages = this._context.pages();
    return {
      success: true,
      tabs: pages.map((p, i) => ({ tabId: i, url: p.url(), title: null, active: p === this._page }))
    };
  }

  async openTab(url) {
    if (!this._context) return { success: false, error: "No open browser session — call openSession(url) first." };
    try {
      this._page = await this._context.newPage();
      await this._page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      const refreshed = await this.getInteractiveElements();
      return { success: true, elements: refreshed.elements };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async switchTab(tabId) {
    if (!this._context) return { success: false, error: "No open browser session — call openSession(url) first." };
    const pages = this._context.pages();
    if (!pages[tabId]) return { success: false, error: `No tab with id ${tabId}. Call browser_list_tabs to see open tabs.` };
    this._page = pages[tabId];
    await this._page.bringToFront();
    const refreshed = await this.getInteractiveElements();
    return { success: true, tabId, url: this._page.url(), elements: refreshed.elements };
  }

  async closeTab(tabId) {
    if (!this._context) return { success: false, error: "No open browser session — call openSession(url) first." };
    const pages = this._context.pages();
    if (!pages[tabId]) return { success: false, error: `No tab with id ${tabId}.` };
    const wasActive = pages[tabId] === this._page;
    await pages[tabId].close();
    if (wasActive) {
      const remaining = this._context.pages();
      this._page = remaining[remaining.length - 1] || null;
    }
    return { success: true, closedTabId: tabId };
  }

  async closeSession() {
    if (this._context) { await this._context.close(); this._context = null; this._page = null; this._elementCache = null; }
  }
}

module.exports = new BrowserAgent();
