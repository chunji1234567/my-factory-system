---
name: Rules Compliance Requirements
description: Must-follow project rules before writing any code — PRD, engineering principles, discipline-specific rules
type: feedback
---

Always review these files before writing code for this project:
1. `docs/PRD.md` + `docs/project_plan.md`
2. `rules/engineering-principles.md` (SOLID/DRY/KISS)
3. `rules/frontend-rules.md` or `rules/backend-rules.md` (depending on scope)
4. `rules/ai-tools-rules.md`

**Why:** The rules/README.md explicitly requires AI tools to state they've reviewed relevant rule files before proposing code.

**How to apply:** At the start of every coding task, confirm relevant rules have been read and cite them when explaining design choices.

## Key Frontend Rules to Remember
- Data fetching ONLY via `src/hooks/use*` + `api/client` — no direct `fetch` in components
- Reusable components go in `src/components/common`, never duplicated
- Tailwind-only styling; no CSS files
- All lists must show loading/error/empty states
- `PartnerSelect`/datalist is the ONLY way to input partner names — parse `#ID` format
- Filter state lives at panel level; reset resets both input and parsed ID
- Use `orderUtils` / `partnerUtils` helpers — never reimplement `resolvePartnerId` or `formatPartner`
- `useMemo` for derived data from hooks (grouping, sorting)
- No `any` types — all props/interfaces explicitly typed

## Key Backend Rules to Remember
- Role-based permissions on every endpoint via `business/api/permissions.py`
- Transactions for inventory/finance operations
- `ModelSerializer` with explicit `fields` — never leak sensitive data to unauthorized roles
