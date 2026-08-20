const { callUniversalLLM } = require("./llm-providers");

async function testLowLoadSpeed() {
  console.log("=== TESTING LOW-LOAD ZERO-PRESSURE ROUTER ===\n");
  const prompt = [{ role: "user", content: "Kem cho Ultron? Mara laptop par bilkul load na pade e rite tamaro status report aapo Gujarati ma." }];
  
  const startTime = Date.now();
  try {
    const res = await callUniversalLLM(prompt, "You are Ultron. Address user strictly as Boss.");
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`✅ [RESPONSE DELIVERED IN ${elapsed} SECONDS]:`);
    console.log(res.content[0].text);
    console.log("\n⚡ Engine Used:", res.modelUsed);
    console.log("📊 Tokens:", res.usage);
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

testLowLoadSpeed();
