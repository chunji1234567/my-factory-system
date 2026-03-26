# Backend API Overview

## Authentication
- Obtain JWT: `POST /api/token/` with `{ "username": "...", "password": "..." }`.
- Refresh: `POST /api/token/refresh/` with `{ "refresh": "<token>" }`.
- Send `Authorization: Bearer <access token>` on every request.
- Roles map to Django groups (`manager`, `warehouse`, `shipper`). Demo setup via `python manage.py shell -c "from scripts import setup_roles; setup_roles.main()"`.

## Core Products
- `GET /api/core/products/`: list inventory items with category details.
- `GET /api/core/products/{id}/` (extendable): fetch single item.

## Purchase Workflow
- `GET /api/business/purchase-orders/` / `/{id}/`: manager + warehouse read access. Managers see `total_amount` & line `price`; warehouse users receive `null` for那些字段。 支持分页参数（`?page=`、`?page_size=`）、排序（`?ordering=created_at` 或 `-total_amount`），以及 `?status=ORDERED|PARTIAL|RECEIVED`、`?partner=<id>`、`?order_no=模糊串`、`?created_from=YYYY-MM-DD`、`?created_to=YYYY-MM-DD`。
- `POST /api/business/purchase-orders/`: manager only. Payload example:
  ```json
  {
    "order_no": "PO-001",
    "partner": 3,
    "items_payload": [
      {"product": 5, "price": "15.50", "quantity": "100"}
    ]
  }
  ```
- `GET /api/business/receiving-logs/`: manager/warehouse list receiving history. Filters: `?purchase_order=<id>`（或 `purchase_item__order`）、`?operator=keyword`（模糊匹配）、`?received_from=YYYY-MM-DD`、`?received_to=YYYY-MM-DD`，可按 `received_at`、`quantity_received` 排序。
- `POST /api/business/receiving-logs/`: manager/warehouse create receiving batches. Fields: `purchase_item`, `quantity_received`, `remark`. Inventory & status update automatically.

## Sales Workflow
- `GET /api/business/sales-orders/` / `/{id}/`: manager + shipper read access. Only managers see amount fields. Items include `shipped_quantity` progress，支持分页、排序（`?ordering=-created_at` 等）以及 `?status=...`、`?partner=<id>`、`?order_no=模糊串`、`?created_from=YYYY-MM-DD`、`?created_to=YYYY-MM-DD`。
- `POST /api/business/sales-orders/`: manager creates orders with `items_payload` similar to purchase API.
- `GET /api/business/shipping-logs/`: manager/shipper list shipments. Filters: `?sales_order=<id>`（或 `sales_item__order`）、`?operator=keyword`、`?shipped_from=YYYY-MM-DD`、`?shipped_to=YYYY-MM-DD`，可指定 `?ordering=shipped_at` 或 `-quantity_shipped`。
- `POST /api/business/shipping-logs/`: manager/shipper create shipments (`sales_item`, `quantity_shipped`, optional `tracking_no`). Automatically logs order events.

- `GET /api/business/stock-adjustments/`: manager & warehouse view adjustments. Filters: `?product=<id>`, `?adjustment_type=MANUAL_IN|MANUAL_OUT|PRODUCE_IN`, `?created_from=YYYY-MM-DD`, `?created_to=YYYY-MM-DD`, `?note=keyword`，支持分页/排序。
- `POST /api/business/stock-adjustments/`: same roles create manual/production adjustments.
  ```json
  {
    "product": 7,
    "adjustment_type": "MANUAL_IN",
    "quantity": "25",
    "note": "盘盈"
  }
  ```
- Valid `adjustment_type`: `MANUAL_IN`, `MANUAL_OUT`, `PRODUCE_IN`.

## Finance (Receivable / Payable)
- `GET /api/business/finance/partners/`: Manager-only summary。`?type=receivable|payable`（默认 receivable），并支持 `?search=`、`?created_from=YYYY-MM-DD`、`?created_to=YYYY-MM-DD`、`?ordering=-outstanding` 等参数，返回应收/应付总额及分页后的合作伙伴列表（含未结金额、订单数量、最近下单时间）。
- `GET /api/business/finance/partners/{partner_id}/`: Manager-only detail。`?type=receivable|payable` 决定展示销售单或采购单；可用 `?order_status=`、`?order_from=`、`?order_to=`、`?order_ordering=` 过滤订单，亦可用 `?transaction_from=`、`?transaction_to=`、`?transaction_ordering=` 筛选财务流水。响应包含合作伙伴余额、未结金额、所有相关订单（附未结金额字段）和全部转账记录。
- `GET/POST /api/business/finance/transactions/`: Manager-only财务流水接口。GET 支持 `?partner=<id>`、`?created_from=YYYY-MM-DD`、`?created_to=YYYY-MM-DD`、`?ordering=-created_at`，POST 时提供 `partner`, `amount`, `note` 即可记录收付款，系统自动回写操作人。

## Future GET Endpoints & Filters
- Shipping/Receiving logs currently expose create-only endpoints; add list views with query params (e.g., `?purchase_order=1`) when the UI needs searchable history.
- Filters mean allowing URL query params like `?status=PARTIAL` or `?partner=5` to narrow list responses. Implement via `django-filter` or manual filtering in views.
