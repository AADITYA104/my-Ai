---
name: github-automation
category: general
source: ruflo-main
description: >
---

# GitHub Automation Skill

## Purpose
Automate GitHub workflows while keeping external writes explicit and scoped.

## Commands

### Create Pull Request

```bash
gh pr create --draft
```

### Inspect Checks

```bash
gh pr checks
```

## Best Practices
1. Confirm repository and branch before external writes
2. Inspect CI evidence before changing workflows
3. Never publish, merge, or close without authorization
4. Report the exact resulting URL or identifier