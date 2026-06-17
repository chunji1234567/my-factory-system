# AGENTS.md

This file is the entry point for any AI coding agent (Claude Code, Cursor, GitHub Copilot, etc.) working on this repository. It tells you what to read before you touch code and gives a short cheat-sheet of project-level conventions.

## Required reading before any code change

Read in this order. Skipping any one of them is treated as a rule violation:

1. `docs/PRD.md` — Product requirements based on actual code (data model, state machines, permission matrix, business invariants, known risks)
2. `rules/engineering-principles.md` — SOLID / DRY / KISS / readability baseline
3. The discipline-specific rule file(s) matching your change scope:
   - Backend (Django / DRF): `rules/backend-rules.md`
   - Frontend (React / TS / Tailwind): `rules/frontend-rules.md`
   - Deployment / env / migrations: `rules/deployment-rules.md`
4. `rules/ai-tools-rules.md` (mandatory for AI agents)

State explicitly in your response that you have read these files before proposing or writing code.

## Project rules

- Answer the user in Chinese (中文)
- Prefer minimal, targeted changes
- Do not refactor unrelated modules
- Do not rename models, fields, routes, templates, or API paths unless explicitly requested
- Do not change database schema unless explicitly requested
- Do not start long-running servers such as `python manage.py runserver`
- Before modifying files, explain which files will be changed
- If running commands, explain the purpose first

> **Note on tests**: previous versions of this file said "do not write tests unless explicitly requested". That contradicts `rules/backend-rules.md §8`, which requires test coverage for any model/signal/permission change. Current rule: **any change to models, signals, serializers, or permissions in the backend must come with tests**. For pure UI tweaks, tests remain optional.

## Stack snapshot

- Backend: Django 6.0.3 + DRF 3.17 + simplejwt + django-filter, two apps (`core` + `business`), JWT 8h access token, default page size 20
- Frontend: React 18 + TypeScript 5 + Vite 5 + Tailwind 3; no router lib; no state management lib; AuthContext is the only global context
- Database: SQLite in dev (default), PostgreSQL in prod via `DATABASE_URL`
- Roles via Django Groups: `manager` / `warehouse` / `shipper`; superuser is treated as manager

## Django debugging checklist

When debugging create / update / delete issues, check in this order:

1. URL route
2. View / APIView / ViewSet
3. Form or serializer
4. Model required fields
5. Template form fields or frontend request payload
6. CSRF handling
7. Permission classes
8. User / tenant / company binding
9. Database constraint errors

## Frontend / UI rules

- Keep the existing Tailwind CSS style
- Preserve Chinese labels and business terminology
- Use the shared components in `frontend/src/components/common/`: `FilterBar`, `NavbarButton`, `PartnerSelect`, `StatusBadge`, `OrderDetailsView`, `OrderItemsEditor`, `Modal`, `Pagination`, `PriceTag`
- Money fields can be `null` for non-manager users — render as `-`, never `0`
- All HTTP calls must go through `src/api/client.ts: apiFetch`; component-level `fetch()` is forbidden

## Where to find the source of truth

- "Why does this status change happen?" → `backend/business/signals.py`
- "What does this endpoint return?" → `backend/business/api/serializers.py` + `business/api/views.py`
- "Who can call this endpoint?" → `backend/business/api/permissions.py` + `backend/business/api/utils.py`
- "What does the frontend assume?" → `frontend/src/hooks/use*.ts` (interfaces) + `frontend/src/api/client.ts`
- "What's broken / what's pending?" → `docs/PRD.md` §9

## Self-check before responding

- [ ] I read the files listed in "Required reading"
- [ ] I cited at least one specific rule when explaining a design choice
- [ ] I listed the files I plan to change before changing them
- [ ] For backend changes touching models / signals / serializers / permissions, I included tests
- [ ] For frontend changes, I verified the three-role flow (manager / warehouse / shipper) and the null-money path
- [ ] I did not introduce new `paid_amount` references, new `any` types, or new component-level `fetch()` calls
- [ ] I updated `docs/PRD.md` for any data model / API / permission change

## Imported Claude Cowork project instructions

This project is a designed manufacturing factory erp system
