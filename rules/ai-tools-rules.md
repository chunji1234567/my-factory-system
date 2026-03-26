# AI Tools Rules

This document applies to **all AI coding agents** (Claude Code, Cursor, GitHub Copilot, ChatGPT, etc.).

## Preparation Checklist
- Before every coding session, read `docs/PRD.md`, `docs/project_plan.md`, `rules/engineering-principles.md`, and each discipline rule file (`frontend-rules.md`, `backend-rules.md`, `deployment-rules.md`) that matches the planned work.
- State explicitly that the required rule files were reviewed before proposing or writing code.
- Keep the relevant rule files open (mentally or in context) and reference them when explaining design choices.

## Rule Compliance
- Always follow SOLID, DRY, KISS, and readability principles as defined in `rules/engineering-principles.md`; justify any unavoidable deviation in comments or the summary.
- When multiple areas are affected, cite the applicable discipline rules so reviewers know how they were satisfied.

## Workflow Expectations
- Explain planned steps briefly before code changes (unless explicitly asked not to).
- Avoid generating large boilerplate when existing utilities/hooks/services already solve the problem.
- After coding, summarize the changes, mention validations/tests performed, and list remaining risks or TODOs.

## Safety
- Never output secrets or real credentials.
- Validate API routes before calling them; avoid hitting endpoints that don't exist.
- Prefer local reasoning or existing documentation over assumptions about infrastructure or data.

## Collaboration
- Respect human edits; do not overwrite manual changes without discussion or explicit permission.
- Document important assumptions and note where human review is needed, especially for breaking changes or schema updates.
