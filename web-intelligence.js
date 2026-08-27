/**
 * ============================================================================
 *  WEB INTELLIGENCE & READABILITY SCRAPER (2026 ARCHITECTURE)
 *  Ported from deepseek-harness-master/packages/web & fs
 *  - 100% Free DuckDuckGo HTML Web Search (No API Key Required)
 *  - Clean Boilerplate-Free HTML-to-Markdown Scraper
 *  - Strips ads, navigation, scripts & CSS for LLM Context Efficiency
 * ============================================================================
 */
"use strict";

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Free web search via DuckDuckGo HTML endpoint
 */
async function searchWeb(query, limit = 5) {
  if (!query || !query.trim()) {
    return { success: false, error: "Empty query" };
  }

  try {
    const encoded = encodeURIComponent(query.trim());
    const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });

    if (!res.ok) {
      return { success: false, error: `Search engine returned HTTP ${res.status}` };
    }

    const html = await res.text();
    const results = [];

    // Extract search result blocks using regex
    const regex = /<a class="result__url" href="([^"]+)".*?<a class="result__snippet[^"]*">(.*?)<\/a>/gis;
    let match;

    while ((match = regex.exec(html)) !== null && results.length < limit) {
      let rawLink = match[1];
      // Decode DuckDuckGo redirect uddg url parameter if present
      const uddgMatch = rawLink.match(/uddg=([^&]+)/);
      if (uddgMatch) {
        try { rawLink = decodeURIComponent(uddgMatch[1]); } catch (_) {}
      }

      const snippet = match[2]
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();

      if (rawLink && snippet) {
        results.push({ url: rawLink, snippet });
      }
    }

    // Fallback parser if regex misses
    if (results.length === 0) {
      const linkRegex = /<a class="result__snippet[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gis;
      while ((match = linkRegex.exec(html)) !== null && results.length < limit) {
        results.push({
          url: match[1],
          snippet: match[2].replace(/<[^>]+>/g, "").trim()
        });
      }
    }

    return {
      success: true,
      query,
      count: results.length,
      results
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Converts raw HTML string into clean readable Markdown
 */
function htmlToCleanMarkdown(html) {
  if (!html || typeof html !== "string") return "";

  let text = html;

  // 1. Strip script, style, svg, iframe, noscript blocks
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
  text = text.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "");
  text = text.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");
  text = text.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "");
  text = text.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "");
  text = text.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "");
  text = text.replace(/<!--[\s\S]*?-->/g, "");

  // 2. Convert standard tags to Markdown equivalents
  text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "\n# $1\n");
  text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "\n## $1\n");
  text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "\n### $1\n");
  text = text.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "\n#### $1\n");
  text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, "\n$1\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, "\n- $1");
  text = text.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, "\n```\n$1\n```\n");
  text = text.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");
  text = text.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  text = text.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  text = text.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
  text = text.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");
  text = text.replace(/<a\s+[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");

  // 3. Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // 4. Decode HTML Entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // 5. Clean up redundant blank lines
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

/**
 * Fetches a URL and returns clean markdown capped to maxChars
 */
async function fetchCleanMarkdown(url, maxChars = 12000) {
  if (!url || !url.startsWith("http")) {
    return { success: false, error: "Invalid URL provided." };
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8"
      },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }

    const rawHtml = await res.text();
    const markdown = htmlToCleanMarkdown(rawHtml);

    return {
      success: true,
      url,
      totalLength: markdown.length,
      content: markdown.slice(0, maxChars)
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  searchWeb,
  fetchCleanMarkdown,
  htmlToCleanMarkdown
};
