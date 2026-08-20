const skillEngine = require('./unified-skill-engine');

console.log('=== UNIFIED SKILL ENGINE 2026 AUDIT ===\n');
const stats = skillEngine.getStats();
console.log('Total Skills Loaded:', stats.total_skills);
console.log('Category Distribution:', stats.categories);
console.log('Framework Sources:', stats.sources);

const testQueries = [
  'Create a brutalist landing page with smooth scroll world animations',
  'Audit this smart contract for reentrancy vulnerabilities and freeze access',
  'Refactor this Python data pipeline and fix root cause bug with minimal diff',
  'Coordinate a multi-agent swarm to architect, build, and QA this feature'
];

console.log('\n--- TESTING REAL-TIME MULTI-SKILL PASS-THROUGH ROUTING ---');
testQueries.forEach((q, idx) => {
  console.log(`\nQuery #${idx + 1}: "${q}"`);
  const matched = skillEngine.routeTask(q, 3);
  matched.forEach((m, mIdx) => {
    console.log(`  [Skill ${mIdx + 1}] -> ${m.name.toUpperCase()} (${m.category}) [Source: ${m.package_source}]`);
  });
});
