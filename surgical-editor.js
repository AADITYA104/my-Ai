/**
 * ============================================================================
 *  SURGICAL STRING REPLACEMENT EDITOR (2026 ARCHITECTURE)
 *  Ported from deepseek-harness-master/packages/fs/tool-fs-str-replace-editor
 *  - Precise View, Exact String Replacement, Line Insertion, & Deletion
 *  - Ponytail Minimal-Diff Safe Editing Pattern
 *  - Integrated with Self-Healing Watchdog Snapshots & Syntax Verification
 * ============================================================================
 */
"use strict";

const fs = require("fs");
const path = require("path");
const watchdog = require("./self-healing-watchdog");

/**
 * View specific line range in a file with line numbers (1-indexed)
 */
function viewLines(filePath, startLine = 1, endLine = 100) {
  try {
    const fullPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    const lines = content.split("\n");
    const totalLines = lines.length;

    const start = Math.max(1, Math.min(startLine, totalLines));
    const end = Math.min(Math.max(start, endLine), totalLines);

    const slice = lines.slice(start - 1, end).map((l, i) => `${start + i}: ${l}`);
    return {
      success: true,
      filePath,
      totalLines,
      startLine: start,
      endLine: end,
      content: slice.join("\n")
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Surgically replace an exact target string in a file with a replacement string.
 * Fails if oldStr is not found or is ambiguous (appears multiple times without allowMultiple).
 */
function strReplace(filePath, oldStr, newStr, allowMultiple = false) {
  try {
    const fullPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    if (watchdog.isProtectedPath(fullPath)) {
      return { success: false, error: `Modification rejected: ${filePath} is protected by Watchdog.` };
    }

    const content = fs.readFileSync(fullPath, "utf-8");

    if (!content.includes(oldStr)) {
      return {
        success: false,
        error: `Target string was not found in ${filePath}. Verify exact characters and whitespace.`
      };
    }

    // Check uniqueness if allowMultiple is false
    if (!allowMultiple) {
      const firstIdx = content.indexOf(oldStr);
      const secondIdx = content.indexOf(oldStr, firstIdx + 1);
      if (secondIdx !== -1) {
        return {
          success: false,
          error: `Target string appears multiple times in ${filePath}. Provide more surrounding context lines to make it unique, or set allowMultiple: true.`
        };
      }
    }

    // Create safety snapshot before modifying
    const checkpoint = watchdog.createCheckpoint(fullPath);

    let updatedContent;
    if (allowMultiple) {
      updatedContent = content.split(oldStr).join(newStr);
    } else {
      updatedContent = content.replace(oldStr, newStr);
    }

    fs.writeFileSync(fullPath, updatedContent, "utf-8");

    // Syntax validation check for JS files
    if (fullPath.endsWith(".js") && !watchdog.validateSyntax(fullPath)) {
      watchdog.rollback(fullPath, checkpoint);
      return {
        success: false,
        error: `Syntax validation failed after replacement. File auto-rolled back to checkpoint.`
      };
    }

    return {
      success: true,
      filePath,
      checkpoint,
      message: `Successfully replaced string in ${filePath}.`
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Insert new text after a specific line number (1-indexed)
 */
function insertAfterLine(filePath, lineNum, newText) {
  try {
    const fullPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    if (watchdog.isProtectedPath(fullPath)) {
      return { success: false, error: `Modification rejected: ${filePath} is protected by Watchdog.` };
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    const lines = content.split("\n");

    const targetLine = Math.max(0, Math.min(lineNum, lines.length));
    const checkpoint = watchdog.createCheckpoint(fullPath);

    lines.splice(targetLine, 0, newText);
    const updatedContent = lines.join("\n");

    fs.writeFileSync(fullPath, updatedContent, "utf-8");

    if (fullPath.endsWith(".js") && !watchdog.validateSyntax(fullPath)) {
      watchdog.rollback(fullPath, checkpoint);
      return {
        success: false,
        error: `Syntax error detected after line insertion. File auto-rolled back.`
      };
    }

    return {
      success: true,
      filePath,
      checkpoint,
      insertedAtLine: targetLine + 1,
      message: `Inserted new text at line ${targetLine + 1} in ${filePath}.`
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  viewLines,
  strReplace,
  insertAfterLine
};
