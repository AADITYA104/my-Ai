/**
 * ============================================================================
 *  ULTRON BROWSER AUTOMATION INTERFACE (TOOLS/BROWSER-AUTOMATION.JS)
 *  - High-level browser control (navigate, search, scrape, form-fill)
 *  - Connects to Playwright persistent browser engine with HTTP fallbacks
 * ============================================================================
 */
"use strict";

const browserAgent = require("../browser-agent");

class BrowserAutomationTool {
  /**
   * Search Google or GitHub and extract top results
   */
  async searchWeb(query) {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    console.log(`🌐 [BROWSER AUTOMATION] Searching web for: "${query}"`);
    const result = await browserAgent.navigateAndExtract(searchUrl);
    return {
      query,
      success: result.success,
      summary: result.data || result.title || "No data extracted."
    };
  }

  /**
   * Navigate to a URL and extract content
   */
  async inspectUrl(url) {
    return browserAgent.navigateAndExtract(url);
  }
}

module.exports = new BrowserAutomationTool();
