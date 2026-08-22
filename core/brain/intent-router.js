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
    intent: "smart_home",
    patterns: [
      /light|બત્તી|લાઇટ|ac|air\s*conditioner|fan|thermostat|temperature|lamp|switch/i
    ]
  },
  {
    intent: "system_control",
    patterns: [
      /volume|brightness|sound|mute|play|pause|media|calc|calculator|notepad|terminal|chrome|vs\s*code|open\s+app|network|wifi|ping/i
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
  },
  {
    intent: "stop_command",
    patterns: [
      /fully\s*stop|sampurna\s*band|stop\s*ultron|shut\s*down|exit\s*ultron/i
    ]
  },
  {
    intent: "mute_command",
    patterns: [
      /chup\s*rahe|thodi\s*var\s*band|mute\s*kar|be\s*quiet|silence/i
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
