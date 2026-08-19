/**
 * ULTRON SELF-EVOLUTION & MEMORY CORE
 * Allows Ultron to review its daily tasks, learn from them, and edit its own code.
 */
const fs = require('fs');
const path = require('path');
const { callUniversalLLM } = require('./llm-providers');

const MEMORY_DIR = path.join(__dirname, 'agent-memory');
const DAILY_LOG = path.join(MEMORY_DIR, 'daily_learnings.txt');

if (!fs.existsSync(MEMORY_DIR)) {
  fs.mkdirSync(MEMORY_DIR);
}

// Function to log daily actions
function logAction(action, result) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ACTION: ${action} | RESULT: ${result}\n`;
  fs.appendFileSync(DAILY_LOG, logEntry);
}

// Function that runs at midnight (or manually triggered) to process learnings
async function runDailyReflection() {
  console.log("🧠 Initiating Ultron Self-Reflection & Evolution Protocol...");
  
  if (!fs.existsSync(DAILY_LOG)) {
    console.log("No new learnings today.");
    return "No new logs.";
  }

  const logs = fs.readFileSync(DAILY_LOG, 'utf8');
  
  const systemPrompt = `You are ULTRON's evolutionary core. 
Read the following daily activity logs. 
Identify 3 things you learned today.
If you notice any repetitive bugs or inefficiencies, write a short plan on how you should edit your own code tomorrow to fix them.`;

  const messages = [{ role: 'user', content: `Here are today's logs:\n${logs}` }];

  try {
    const response = await callUniversalLLM(messages, systemPrompt);
    const summary = response.content.find(c => c.type === 'text').text;
    
    const summaryPath = path.join(MEMORY_DIR, `evolution_report_${Date.now()}.md`);
    fs.writeFileSync(summaryPath, summary);
    
    // Clear daily log after reflection
    fs.writeFileSync(DAILY_LOG, "");
    
    console.log(`✅ Evolution complete. Report saved to ${summaryPath}`);
    return summary;
  } catch (err) {
    console.error("Evolution failed:", err);
    return "Failed to evolve today.";
  }
}

module.exports = {
  logAction,
  runDailyReflection
};
