/**
 * ============================================================================
 *  ULTRON INTENT CLASSIFIER & DISPATCH ROUTER (CORE/BRAIN/INTENT-ROUTER.JS)
 *  - Routes voice and text transcripts to specialized execution tools.
 *  - Ultra-fast regex-heuristic classification with LLM fallback.
 * ============================================================================
 */
"use strict";

const INTENT_PATTERNS = [
  {
    intent: "stop_command",
    patterns: [
      /fully\s*stop|sampurna\s*band|stop\s*ultron|shut\s*down|exit\s*ultron|ultron\s+stop|band\s*kar\s*ultron|stop\s+now|close\s+ultron|terminate/i
    ]
  },
  {
    intent: "mute_command",
    patterns: [
      /chup\s*rahe|thodi\s*var\s*band|mute\s*kar|be\s*quiet|silence|mute\s*yourself|shant\s*rahe|chup\s*thi\s*ja|quiet\s*mode/i
    ]
  },
  {
    intent: "deep_reasoning_task",
    patterns: [
      /deep\s*thinking|vichar|vichari\s*ne|tree\s*of\s*thought|tot|complex\s*problem|architecture\s*plan|logic|step\s*by\s*step\s*analysis|proof|math\s*problem|optimize\s*algorithm/i
    ]
  },
  {
    intent: "coding_mission",
    patterns: [
      /banav|banavi\s*aapo|create\s*website|build\s*app|write\s*code|refactor|debug|fix\s*code|generate\s*program|html|css|javascript|python|frontend|backend/i
    ]
  },
  {
    intent: "multi_agent_swarm",
    patterns: [
      /multi\s*agent|crew|debate|specialist\s*team|architect\s*and\s*coder|group\s*chat|swarm/i
    ]
  },
  {
    intent: "design_audit_intent",
    patterns: [
      /design\s*audit|ui\s*audit|ux\s*check|check\s*layout|accessibility\s*check|impeccable/i
    ]
  },
  {
    intent: "research_investigation",
    patterns: [
      /research|investigate|compare|deep\s*dive|market\s*analysis|literature\s*search|study/i
    ]
  },
  {
    intent: "smart_home",
    patterns: [
      /light|બત્તી|લાઇટ|ac|air\s*conditioner|fan|thermostat|temperature|lamp|switch/i
    ]
  },
  {
    intent: "system_control",
    patterns: [
      /volume|brightness|sound|play|pause|media|calc|calculator|notepad|terminal|chrome|vs\s*code|open\s+app|network|wifi|ping/i
    ]
  },
  {
    intent: "vision_perception",
    patterns: [
      /screen|screenshot|what\s+is\s+on\s+screen|look\s+at|ocr|read\s+window/i
    ]
  },
  {
    intent: "browser_automation",
    patterns: [
      /search\s+web|google|browse|find\s+online|look\s+up|open\s+website/i
    ]
  },
  {
    intent: "communication",
    patterns: [
      /telegram|whatsapp|message|email|send\s+msg|draft/i
    ]
  }
];

async function routeIntent(transcript) {
  if (!transcript || typeof transcript !== "string") return "general_chat";

  for (const item of INTENT_PATTERNS) {
    for (const re of item.patterns) {
      if (re.test(transcript)) {
        return item.intent;
      }
    }
  }

  return "general_chat";
}

module.exports = {
  routeIntent
};
