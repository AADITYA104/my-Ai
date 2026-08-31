This merge kept only docs/edge/ (the latest docs) out of crewAI's docs/
folder. The upstream repo also ships 34 near-duplicate versioned snapshots
(v1.15.5 through v1.15.18, ~8.3-8.5MB each) plus a 97MB docs/images/ folder —
left out here for the same reason node_modules/ and motion's .yarn/cache
were left out elsewhere in this project: they're regenerable, mostly
duplicate content, not needed to actually use crewAI, and would have added
~280MB for near-zero functional gain. The real source (lib/crewai,
lib/crewai-tools, lib/cli, etc.) is included in full, unmodified.
