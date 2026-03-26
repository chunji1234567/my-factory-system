# Backend Rules

1. **Architecture**
   - Use Django + DRF. Separate concerns into apps (`core`, `business`).
   - Enforce SOLID: keep serializers, views, and signals focused on single responsibilities.
   - Follow DRY: shared logic (e.g., monetary masking) must live in mixins/utilities.

2. **API Design**
   - All new endpoints must enforce role-based permissions (manager/warehouse/shipper) using existing permission classes or new ones under `business/api/permissions.py`.
   - Provide filtering, pagination, and ordering via `django-filter` and DRF settings.
   - Use `ModelSerializer` with explicit `fields` list; never expose sensitive data to unauthorized roles.

3. **Data Integrity**
   - Use transactions for operations that touch inventory or finance (see `StockAdjustment`, `ShippingLog`).
   - Keep migrations atomic; every model change requires a migration file.

4. **Coding Standards**
   - Follow PEP 8. Use descriptive names and docstrings for complex logic.
   - Any new automation (signals, hooks) must include error handling/logging.
