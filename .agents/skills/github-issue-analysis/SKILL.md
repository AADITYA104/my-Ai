---
name: github-issue-analysis
description: "Analyze a GitHub issue (bug or feature request) end-to-end: read it fully, independently verify the reported behavior against the actual code, and propose a fix or implementation approach without implementing it. Use when asked to triage or analyze a GitHub issue."
---

Analyze GitHub issue(s): $ARGUMENTS

For each issue:

1. If running under CI (`CI=true`), do not add the `inprogress` label and do not assign the issue. Otherwise, add the `inprogress` label to the issue via GitHub CLI and assign the issue to the local `gh` user before analysis starts. If either action fails, report that explicitly and continue.
2. Read the issue in full, including all comments and linked issues/PRs. Use fields supported by GitHub CLI, for example:
   ```sh
   gh issue view <issue> --json title,body,comments,labels,assignees,state,url,author,createdAt,updatedAt,closedByPullRequestsReferences
   ```
3. Do not trust analysis written in the issue. Independently verify behavior and derive your own analysis from the code and execution path.

4. **For bugs**:
   - Ignore any root cause analysis in the issue (likely wrong)
   - Read all related code files in full (no truncation)
   - Trace the code path and identify the actual root cause
   - Propose a fix

5. **For feature requests**:
   - Do not trust implementation proposals in the issue without verification
   - Read all related code files in full (no truncation)
   - Propose the most concise implementation approach
   - List affected files and changes needed

Do NOT implement unless explicitly asked. Analyze and propose only.
