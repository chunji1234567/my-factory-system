# Coding Rules Overview

All contributors (humans or AI coding agents such as Claude Code, Cursor, GitHub Copilot, ChatGPT, etc.) **must read and follow the rules described in this directory before writing code**. Every coding session must reference the relevant rules file(s).

## Required Reading Order
1. `docs/PRD.md` and `docs/project_plan.md` for product context.
2. `rules/engineering-principles.md` for the SOLID/DRY/KISS/readability baseline.
3. Discipline-specific rules that match the change scope (`frontend-rules.md`, `backend-rules.md`, `deployment-rules.md`).
4. `rules/ai-tools-rules.md` (if you are an AI coding assistant).

## Rule Files by Discipline
- `engineering-principles.md`: Canonical interpretation of SOLID, DRY, KISS, and readability for this project.
- `frontend-rules.md`: React + TypeScript/Tailwind conventions, data-fetching hooks, and UI structure.
- `backend-rules.md`: Django/DRF architecture, permission guardrails, and data integrity rules.
- `deployment-rules.md`: Environment, build, migration, and monitoring expectations.
- `ai-tools-rules.md`: Workflow expectations for Claude Code, Cursor, ChatGPT, and any other AI coding tools.

## Enforcement
- Rules are categorized so frontend, backend, and deployment work each have dedicated checklists—consult all categories that apply to your change.
- When a change touches multiple areas, follow every relevant rule file plus the shared engineering principles.
- **IMPORTANT:** Each AI coding tool must state that it has reviewed the applicable rule files before writing code and should point to concrete rules when explaining trade-offs.
