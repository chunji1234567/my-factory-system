# Engineering Principles (SOLID / DRY / KISS / Readability)

These principles govern every part of the stack (frontend, backend, deployment) and must be reviewed before writing any code or infrastructure changes.

## How to Use This Document
- Review this file alongside `docs/PRD.md`, `docs/project_plan.md`, and the discipline-specific rules before every coding session.
- Apply the principles consistently; when a trade-off is required, document it in code comments or the commit message so reviewers understand the reasoning.
- Use the discipline-specific rule files (`frontend-rules.md`, `backend-rules.md`, `deployment-rules.md`) to see concrete patterns while keeping these principles as the baseline.

## SOLID
### Single Responsibility Principle
- Give each React component, hook, serializer, service, or deployment script one focused job; split large constructs until they can be described in one sentence.
- Extract helpers (e.g., formatting utilities, API adapters, infra modules) instead of adding conditional branches inside an existing function/class.

### Open/Closed Principle
- Prefer extending behavior via composition, hooks, mixins, or configuration instead of modifying stable shared modules.
- When introducing a variation (new role, new deployment stage), add new concrete implementations that plug into existing abstractions rather than editing every call site.

### Liskov Substitution Principle
- Keep interfaces consistent so that a derived class, hook, or adapter can drop in without surprising downstream consumers.
- Preserve the same return types/shape when wrapping API clients, services, or deployment commands to avoid breaking existing integrations.

### Interface Segregation Principle
- Design narrow interfaces: expose the smallest surface area each consumer needs and break apart monolithic utilities.
- Frontend hooks should only expose the state/actions that a consumer needs; backend services should not leak unrelated responsibilities; deployment scripts should not combine provisioning, migrations, and monitoring in one entry point.

### Dependency Inversion Principle
- Depend on abstractions instead of concrete implementations: React components consume typed hooks/services; backend views call service layers instead of raw models; deployment workflows call commands through wrappers that can be mocked.
- Inject dependencies (config, clients, credentials) instead of importing globals so that units remain testable and easy to swap.

## DRY (Don't Repeat Yourself)
- Create shared utilities/hooks/services whenever the same logic appears twice; centralize API clients, validation, formatting, and deployment shell helpers.
- Move repeated constants (endpoints, status values, environment names) to config modules; parameterize behavior rather than copying files.
- Favor composition and helper functions over duplicating logic across roles or screens.

## KISS (Keep It Simple, Stupid)
- Implement the smallest change that satisfies the requirement; do not introduce abstractions until a real need exists.
- Prefer declarative patterns (React composition, Django class-based views, deployment scripts with clear steps) over clever metaprogramming or deeply nested branching.
- Remove dead code and obsolete TODOs so new contributors can understand intent quickly.

## Readability & Maintainability
- Use descriptive names, consistent formatting (PEP 8 / Prettier), and minimal but meaningful comments that explain *why*, not *what*.
- Keep files short and organized with clear sections; when a file grows beyond ~200 lines with multiple responsibilities, break it up.
- Write or update tests/documentation whenever behavior changes so future contributors (human or AI) can rely on executable specs.
- Validate that the change is understandable to someone who only read the relevant rule files and docs; if not, add context via docstrings, ADR-style notes, or deployment runbooks.
