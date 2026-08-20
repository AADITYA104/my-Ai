const { callOllama } = require("./llm-providers");

async function testNewModel() {
  console.log("=== TESTING NEW 13.27 GB IQ4 MODEL (ultron-core) ===\n");
  const prompt = [{ role: "user", content: "Kem cho Ultron? Tame have keta smart thaya cho mane Gujarati ma samjavo." }];
  
  try {
    const startTime = Date.now();
    const res = await callOllama(prompt, "You are Ultron. Address user as Boss.");
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log("✅ [RESPONSE RECEIVED IN " + elapsed + "s]:");
    console.log(res.content[0].text);
    console.log("\nModel used:", res.modelUsed);
    console.log("Token usage:", res.usage);
  } catch (err) {
    console.error("❌ Error testing model:", err.message);
  }
}

testNewModel();
