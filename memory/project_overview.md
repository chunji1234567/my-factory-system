---
name: Project Overview - My Factory System
description: Core purpose, tech stack, roles, and module breakdown for this factory management system
type: project
---

## What it is
A full-stack factory operations platform for a multi-category manufacturer. Managers, warehouse staff, and shippers use it in the browser to handle orders, inventory, receiving, shipping, finance, and partner management.

**Why:** Replace manual/fragmented processes with a unified browser-based tool; future integration with WeCom (企业微信).

**How to apply:** All features must respect the 3 roles; every panel checks role permissions before rendering.

## Tech Stack
- **Backend:** Django + DRF, SQLite (dev), apps: `core` + `business`
- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Auth:** JWT-based, role-gated panels

## Roles
- **Manager:** Full access — orders, finance, partner management, exports
- **Warehouse:** Inventory, receiving, self-made gallery — no financial amounts
- **Shipper:** Shipping panel + sales order events — no amounts

## 9 Feature Panels
1. **InventoryPanel** — search/filter products, batch in/out/produce adjustments
2. **SalesOrdersPanel** — create/edit/delete sales orders, events (ship/return/note)
3. **PurchasePanel** — create/edit/delete purchase orders, events (receive/return/note)
4. **ShippingPanel** — batch shipping entry, logs, order status updates
5. **WarehouseReceivingPanel** — receiving against POs, log quantities
6. **SelfMadeGalleryPanel** — card gallery for SELF_MADE products, quick adjustments
7. **PartnerManagementPanel** — partner CRUD, detail drawer with orders/transactions/ledger
8. **FinanceDetailPanel** — create/edit/delete finance transactions, date filtering
9. Navigation + Login — role-based panel visibility, URL + localStorage sync

## Current Phase
Phase 2 (frontend) is in progress; backend is complete. Phase 3 (full API wiring + role visibility) is next.

## Key Shared Components
- `FilterBar`, `NavbarButton`, `PartnerSelect`, `OrderItemsEditor`, `OrderDetailsView`, `Pagination`, `StatusBadge`
- Hooks: `useProducts`, `useSalesOrders`, `usePurchaseOrders`, `useFinanceTransactions`, `useShippingLogs`, etc.
- Utils: `orderUtils`, `partnerUtils` — centralize resolvePartnerId, formatPartner logic
