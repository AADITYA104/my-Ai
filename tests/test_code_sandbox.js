"use strict";

const { runSandboxedCode } = require("../code-sandbox.js");

async function main() {
  console.log("Testing Code Sandbox...");

  const code = `
    console.log("Hello from inside the Worker thread!");
    const file = tools.readFile("package.json");
    if (!file.success) throw new Error("Could not read package.json: " + file.error);
    const pkg = JSON.parse(file.content);
    return { name: pkg.name, version: pkg.version };
  `;

  const result = await runSandboxedCode(code);
  console.log("Execution Result:", JSON.stringify(result, null, 2));

  if (result.success && result.result?.name === "my-ai") {
    console.log("✅ Code Sandbox PASSED!");
  } else {
    console.error("❌ Code Sandbox FAILED!");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
