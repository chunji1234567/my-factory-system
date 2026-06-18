const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
const DEV_SERVER_PORTS = new Set(['5173', '4173']);
const FALLBACK_API_BASE = 'http://127.0.0.1:8000';

function resolveApiBaseUrl() {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (typeof window !== 'undefined') {
    const { origin, hostname, protocol, port } = window.location;
    if (!LOCAL_HOSTS.has(hostname)) {
      return origin;
    }
    if (DEV_SERVER_PORTS.has(port)) {
      const apiPort = import.meta.env.VITE_API_PORT || '8000';
      return `${protocol}//${hostname}:${apiPort}`;
    }
  }
  return FALLBACK_API_BASE;
}

const API_BASE_URL = resolveApiBaseUrl();
let authToken: string | null = null;
let refreshToken: string | null = null;

// 用于把"续期成功后的新 access token"广播给 AuthContext 持久化。
// AuthContext 用 onAuthTokenRefreshed(cb) 注册一次性回调。
type TokenRefreshedCallback = (accessToken: string) => void;
let onTokenRefreshed: TokenRefreshedCallback | null = null;

// 单次飞行的 refresh promise，防止 N 个并发 401 请求触发 N 次 refresh。
let refreshInFlight: Promise<string> | null = null;

export function setAuthToken(token: string) {
  authToken = token;
}

export function clearAuthToken() {
  authToken = null;
  refreshToken = null;
}

/** 由 AuthContext 调用，把 refresh token 同步给 client.ts。
 *  client.ts 内部在 401 时会用它去续期 access token。
 */
export function setRefreshToken(token: string | null) {
  refreshToken = token;
}

/** AuthContext 注册一个回调，client.ts 在自动续期成功后调一次，
 *  让 AuthContext 把新 access token 持久化到 localStorage / state。
 *  传 null 解注册。
 */
export function onAuthTokenRefreshed(cb: TokenRefreshedCallback | null) {
  onTokenRefreshed = cb;
}

interface ApiOptions extends RequestInit {
  skipAuth?: boolean;
  /** 内部用——续期重试时设为 true，避免循环重试。
   *  外部调用者不需要传。 */
  _isRetryAfterRefresh?: boolean;
}

/** 列表接口的标准查询参数——所有 list hook 共用此基础结构。 */
export interface ListQueryParams {
  page?: number;
  page_size?: number;
  ordering?: string;
}

/** 销售订单列表查询参数，与后端 SalesOrderFilter（business/api/filters.py）对齐。 */
export interface SalesOrdersQueryParams extends ListQueryParams {
  status?: string;
  partner?: number;
  order_no?: string;
  partner_name?: string;
  created_from?: string; // YYYY-MM-DD
  created_to?: string;   // YYYY-MM-DD
}

/** 采购订单列表查询参数，与后端 PurchaseOrderFilter 对齐。 */
export interface PurchaseOrdersQueryParams extends ListQueryParams {
  status?: string;
  partner?: number;
  order_no?: string;
  created_from?: string;
  created_to?: string;
}

/** 发货日志列表查询参数，与后端 ShippingLogFilter 对齐。 */
export interface ShippingLogsQueryParams extends ListQueryParams {
  sales_order?: number;
  partner?: number;
  partner_name?: string;
  operator?: string;
  shipped_from?: string;
  shipped_to?: string;
}

/** 财务流水列表查询参数，与后端 FinancialTransactionFilter 对齐。 */
export interface FinanceTransactionsQueryParams extends ListQueryParams {
  partner?: number;
  transaction_type?: 'RECEIPT' | 'PAYMENT' | 'ADJUST';
  note?: string;
  created_from?: string;
  created_to?: string;
}

/** 产品 / 分类 / 合作方列表的查询参数（后端目前没有专用 FilterSet，
 *  仅靠 DRF 默认分页 + ordering）。 */
export interface ProductsQueryParams extends ListQueryParams {}
export interface CategoriesQueryParams extends ListQueryParams {}
export interface PartnersQueryParams extends ListQueryParams {}

/** PCB 方案列表查询参数（与后端 PcbPlanFilter 对齐）。 */
export interface PcbPlansQueryParams extends ListQueryParams {
  is_active?: boolean;
  name?: string;
  code?: string;
}

/** 排产记录列表查询参数（BOM-2.1，与后端 ProductionRecordFilter 对齐）。 */
export interface ProductionRecordsQueryParams extends ListQueryParams {
  sales_item?: number;
  sales_order?: number;
  partner?: number;
  executed_from?: string;       // YYYY-MM-DD
  executed_to?: string;
  operator?: string;
}

/** 把 query params 对象序列化成带 `?` 前缀的 query string；空对象返回空串。
 *  null / undefined / 空串的字段会被丢弃，避免发出 ?status=&page= 这种空参。
 */
export function toQueryString(params: object | undefined | null): string {
  if (!params) return '';
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null || value === '') continue;
    usp.set(key, String(value));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

/** DRF PageNumberPagination 的标准响应结构。 */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * 销售单明细写入 payload（创建 + 编辑共用）。
 *
 * BOM-2.0 改造（2026-05-21）后，三件 = 外壳半成品 + PCB 方案 + 线材半成品
 * 必须齐备（后端 serializer 强制校验）。`product` 字段语义 = 外壳槽位（沿用
 * 历史字段名），与 `pcb_plan` / `cable` 并列。
 *
 * 历史：`board` 字段在 BOM-2.0 中删除，由 `pcb_plan: FK PcbPlan` 取代——
 * 排产时按方案展开扣减原材料，详见 docs/PRD.md §4.5 §9.4 changelog。
 *
 * `custom_product_name` / `detail_description` 允许 undefined——前端
 * 表单可能不填，后端默认空字符串。
 */
export interface SalesOrderItemPayload {
  id?: number;
  product: number;                          // 外壳（SELF_MADE）
  pcb_plan: number;                         // PCB 方案（替代旧 board 字段）
  cable: number;                            // 线材（CABLE）
  price: number;
  quantity: number;
  custom_product_name?: string;
  detail_description?: string;
}

/** 用 refresh token 换新 access token。
 *  并发去重：多个 401 同时落地时只发一次 refresh，所有请求共享结果。
 *  refresh 失败时清空两个 token 并向上抛——调用方（apiFetch）会让原始请求自然 401。
 */
async function refreshAccessToken(): Promise<string> {
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }
  if (refreshInFlight) {
    return refreshInFlight;
  }
  refreshInFlight = (async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: refreshToken }),
      });
      if (!resp.ok) {
        // refresh token 本身过期或无效 → 不可恢复，清空所有 token。
        clearAuthToken();
        throw new Error(`Refresh failed: ${resp.status}`);
      }
      const data = (await resp.json()) as { access: string };
      authToken = data.access;
      onTokenRefreshed?.(data.access);
      return data.access;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData) {
    headers.set('Content-Type', 'application/json');
  }

  if (!options.skipAuth) {
    if (!authToken) {
      throw new Error('Missing auth token');
    }
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  // 401 自动续期 + 重试一次。
  // 条件：本次不是已经续过的重试、不是 skipAuth、且有 refresh token 可用。
  if (
    response.status === 401 &&
    !options._isRetryAfterRefresh &&
    !options.skipAuth &&
    refreshToken
  ) {
    try {
      await refreshAccessToken();
      // 用新 token 重试原请求（_isRetryAfterRefresh=true 防再次进入此分支）。
      return apiFetch<T>(path, { ...options, _isRetryAfterRefresh: true });
    } catch {
      // refresh 失败：让原 401 自然落到下面的错误处理。
    }
  }

  if (!response.ok) {
    let message: string;
    try {
      const text = await response.text();
      if (text) {
        try {
          const data = JSON.parse(text);
          message = data.detail || JSON.stringify(data);
        } catch {
          message = text;
        }
      } else {
        message = 'Request failed';
      }
    } catch {
      message = 'Request failed';
    }
    throw new Error(message || 'Request failed');
  }

  if (response.status === 204) {
    return {} as T;
  }
  return response.json() as Promise<T>;
}

export const api = {
  login(credentials: { username: string; password: string }) {
    return apiFetch<{ access: string; refresh: string }>(`/api/token/`, {
      method: 'POST',
      body: JSON.stringify(credentials),
      skipAuth: true,
    });
  },
  refresh(payload: { refresh: string }) {
    return apiFetch<{ access: string }>(`/api/token/refresh/`, {
      method: 'POST',
      body: JSON.stringify(payload),
      skipAuth: true,
    });
  },
  getProducts(params: ProductsQueryParams | string = '') {
    const qs = typeof params === 'string' ? params : toQueryString(params);
    return apiFetch(`/api/core/products/${qs}`);
  },
  getCurrentUser() {
    return apiFetch<{ id: number; username: string; full_name?: string; roles?: string[] }>(`/api/core/me/`);
  },
  getPartners(params: PartnersQueryParams | string = '') {
    const qs = typeof params === 'string' ? params : toQueryString(params);
    return apiFetch(`/api/core/partners/${qs}`);
  },
  getCategories(params: CategoriesQueryParams | string = '') {
    const qs = typeof params === 'string' ? params : toQueryString(params);
    return apiFetch(`/api/core/categories/${qs}`);
  },

  // ===== PCB 方案（BOM-2.0） =====
  // 业务上方案 = 一种 PCB 板的物料配方，被销售明细 / 排产明细引用。
  // 仅 manager 可写 / 读（PRD §2.2）；warehouse / shipper 通过销售或排产
  // 明细返回的 pcb_plan_detail 嵌套间接消费。详见 PRD §3.2 / §4.5。
  getPcbPlans(params: PcbPlansQueryParams | string = '') {
    const qs = typeof params === 'string' ? params : toQueryString(params);
    return apiFetch(`/api/core/pcb-plans/${qs}`);
  },
  getPcbPlan(id: number) {
    return apiFetch(`/api/core/pcb-plans/${id}/`);
  },
  createPcbPlan(payload: {
    name: string;
    code?: string;
    description?: string;
    is_active?: boolean;
    materials?: Array<{ material: number; quantity_per_unit: number | string; note?: string }>;
  }) {
    return apiFetch(`/api/core/pcb-plans/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updatePcbPlan(
    id: number,
    payload: Partial<{
      name: string;
      code: string;
      description: string;
      is_active: boolean;
      // 传 materials 列表时**全量替换**（删旧建新）；不传则不动 materials
      materials: Array<{ material: number; quantity_per_unit: number | string; note?: string }>;
    }>,
  ) {
    return apiFetch(`/api/core/pcb-plans/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  deletePcbPlan(id: number) {
    return apiFetch(`/api/core/pcb-plans/${id}/`, {
      method: 'DELETE',
    });
  },
  createCategory(payload: { name: string; category_type: string; parent?: number | null }) {
    return apiFetch(`/api/core/categories/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  createProduct(
    payload:
      | {
          category: number;
          internal_code: string;
          model_name: string;
          unit?: string;
          stock_quantity?: number;
          min_stock?: number;
        }
      | FormData,
  ) {
    const body = payload instanceof FormData ? payload : JSON.stringify(payload);
    return apiFetch(`/api/core/products/`, {
      method: 'POST',
      body,
    });
  },
  createPartner(payload: { name: string; partner_type: string }) {
    return apiFetch(`/api/core/partners/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getSalesOrders(params: SalesOrdersQueryParams | string = '') {
    // 兼容旧调用：若传字符串就直接拼到 URL 末尾（保留少量地方仍可用裸 query string）；
    // 新调用方应传 SalesOrdersQueryParams 对象，由 toQueryString 序列化。
    const qs = typeof params === 'string' ? params : toQueryString(params);
    return apiFetch(`/api/business/sales-orders/${qs}`);
  },
  createSalesOrder(payload: {
    partner: number;
    operator?: string;
    items_payload: SalesOrderItemPayload[];
    /** ISO 日期串 "YYYY-MM-DD"，可空。详见 backend migration 0019。 */
    expected_delivery_date?: string | null;
  }) {
    return apiFetch(`/api/business/sales-orders/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateSalesOrder(
    id: number,
    payload: Partial<{
      partner: number;
      // 注意：通用 PATCH **不**走状态机校验——状态推进必须用
      // updateSalesOrderStatus；这里保留字段类型仅作历史兼容，
      // 业务代码请走 /sales-orders/{id}/status/。详见
      // rules/frontend-rules.md §2.2。
      status: string;
      operator?: string;
      items_payload: SalesOrderItemPayload[];
      expected_delivery_date: string | null;
    }>,
  ) {
    return apiFetch(`/api/business/sales-orders/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  deleteSalesOrder(id: number) {
    return apiFetch(`/api/business/sales-orders/${id}/`, {
      method: 'DELETE',
    });
  },
  getSalesOrderEvents(orderId: number) {
    return apiFetch(`/api/business/sales-orders/${orderId}/events/`);
  },
  createSalesOrderEvent(orderId: number, payload: { event_type: string; content: string; operator?: string }) {
    return apiFetch(`/api/business/sales-orders/${orderId}/events/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getCustomerPreferredProducts(partnerId: number) {
    return apiFetch(`/api/business/customer-preferred-products/?partner=${partnerId}`);
  },
  createCustomerPreferredProduct(payload: { partner: number; name: string }) {
    return apiFetch(`/api/business/customer-preferred-products/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateSalesOrderStatus(orderId: number, status: string) {
    return apiFetch(`/api/business/sales-orders/${orderId}/status/`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },
  getPurchaseOrders(params: PurchaseOrdersQueryParams | string = '') {
    const qs = typeof params === 'string' ? params : toQueryString(params);
    return apiFetch(`/api/business/purchase-orders/${qs}`);
  },
  createPurchaseOrder(payload: {
    // order_no 可选——后端 PurchaseOrderSerializer._generate_order_no 会自动生成
    // PO{year}-{NNNN} 格式（详见 docs/PRD.md §3.2）；前端不传是正常用法。
    order_no?: string;
    partner: number;
    operator?: string;
    items_payload: Array<{ id?: number; product: number; price: number; quantity: number }>;
    /** ISO 日期串 "YYYY-MM-DD"，可空。详见 backend migration 0019。 */
    expected_arrival_date?: string | null;
  }) {
    return apiFetch(`/api/business/purchase-orders/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updatePurchaseOrder(
    id: number,
    payload: Partial<{
      partner: number;
      status: string;
      operator?: string;
      items_payload: Array<{ id?: number; product: number; price: number; quantity: number }>;
      expected_arrival_date: string | null;
    }>,
  ) {
    return apiFetch(`/api/business/purchase-orders/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  deletePurchaseOrder(id: number) {
    return apiFetch(`/api/business/purchase-orders/${id}/`, {
      method: 'DELETE',
    });
  },
  getPurchaseOrderEvents(orderId: number) {
    return apiFetch(`/api/business/purchase-orders/${orderId}/events/`);
  },
  createPurchaseOrderEvent(orderId: number, payload: { event_type: string; content: string; operator?: string }) {
    return apiFetch(`/api/business/purchase-orders/${orderId}/events/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  createStockAdjustment(payload: { product: number; adjustment_type: string; quantity: number; note?: string }) {
    return apiFetch(`/api/business/stock-adjustments/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  // --- 排产记录（BOM-2.1：append-only 事件，挂在销售明细下） ---
  // 三角色（manager/warehouse/shipper）均可。详见 docs/PRD.md §4.5。
  getProductionRecords(params: ProductionRecordsQueryParams | string = '') {
    const qs = typeof params === 'string' ? params : toQueryString(params);
    return apiFetch(`/api/business/production-records/${qs}`);
  },
  /**
   * 创建一条排产记录：**创建即扣料**（不可逆）。
   * 前端在提交前需要显眼提示用户"会扣 (2+N) 条 PRODUCE_CONSUME"。
   * 服务端校验：过排产（produced + new > sales_item.quantity）会 400。
   */
  createProductionRecord(payload: {
    sales_item: number;
    quantity: number;
    note?: string;
  }) {
    return apiFetch(`/api/business/production-records/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getFinanceSummary(type: 'receivable' | 'payable' = 'receivable') {
    return apiFetch(`/api/business/finance/partners/?type=${type}`);
  },
  getShippingLogs(params: ShippingLogsQueryParams | string = '') {
    const qs = typeof params === 'string' ? params : toQueryString(params);
    return apiFetch(`/api/business/shipping-logs/${qs}`);
  },
  createShippingLog(payload: { sales_item: number; quantity_shipped: number; tracking_no?: string }) {
    return apiFetch(`/api/business/shipping-logs/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  /**
   * 导出选中的 ShippingLog 为 PDF 发货单（详见
   * backend/business/api/shipping_note_pdf.py）。
   * 同客户的多笔合并成同一页；不同客户分页。
   */
  async exportShippingNotePdf(logIds: number[]) {
    if (!authToken) {
      throw new Error('Missing auth token');
    }
    if (logIds.length === 0) {
      throw new Error('请至少选中一条发货流水');
    }
    const params = new URLSearchParams({ log_ids: logIds.join(',') });
    const response = await fetch(
      `${API_BASE_URL}/api/business/shipping-logs/export-pdf/?${params.toString()}`,
      {
        headers: {
          Accept: 'application/pdf',
          Authorization: `Bearer ${authToken}`,
        },
      },
    );
    if (!response.ok) {
      let message = '导出发货单失败';
      try {
        const text = await response.text();
        if (text) {
          try {
            const data = JSON.parse(text);
            message = data.detail || text;
          } catch {
            message = text;
          }
        }
      } catch {
        // noop
      }
      throw new Error(message);
    }
    return response.blob();
  },
  createReceivingLog(payload: { purchase_item: number; quantity_received: number; remark?: string }) {
    return apiFetch(`/api/business/receiving-logs/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getFinancePartnerDetail(
    partnerId: number,
    type: 'receivable' | 'payable',
    options?: { ledgerPage?: number; ledgerPageSize?: number; ledgerFrom?: string | null; ledgerTo?: string | null },
  ) {
    const params = new URLSearchParams({ type });
    if (options?.ledgerPage) {
      params.set('ledger_page', String(options.ledgerPage));
    }
    if (options?.ledgerPageSize) {
      params.set('ledger_page_size', String(options.ledgerPageSize));
    }
    if (options?.ledgerFrom) {
      params.set('ledger_from', options.ledgerFrom);
    }
    if (options?.ledgerTo) {
      params.set('ledger_to', options.ledgerTo);
    }
    return apiFetch(`/api/business/finance/partners/${partnerId}/?${params.toString()}`);
  },
  async exportFinancePartnerLedger(
    partnerId: number,
    type: 'receivable' | 'payable',
    options?: { ledgerPage?: number; ledgerPageSize?: number; ledgerFrom?: string | null; ledgerTo?: string | null; summary?: boolean },
  ) {
    if (!authToken) {
      throw new Error('Missing auth token');
    }
    const params = new URLSearchParams({ type });
    if (options?.summary) {
      params.set('summary', '1');
    }
    if (options?.ledgerPage) {
      params.set('ledger_page', String(options.ledgerPage));
    }
    if (options?.ledgerPageSize) {
      params.set('ledger_page_size', String(options.ledgerPageSize));
    }
    if (options?.ledgerFrom) {
      params.set('ledger_from', options.ledgerFrom);
    }
    if (options?.ledgerTo) {
      params.set('ledger_to', options.ledgerTo);
    }
    const response = await fetch(
      `${API_BASE_URL}/api/business/finance/partners/${partnerId}/ledger-export/?${params.toString()}`,
      {
        headers: {
          Accept: 'text/csv',
          Authorization: `Bearer ${authToken}`,
        },
      },
    );
    if (!response.ok) {
      let message = '导出台账失败';
      try {
        const text = await response.text();
        if (text) {
          try {
            const data = JSON.parse(text);
            message = data.detail || text;
          } catch {
            message = text;
          }
        }
      } catch {
        message = '导出台账失败';
      }
      throw new Error(message);
    }
    return response.blob();
  },
  getFinanceTransactions(params: FinanceTransactionsQueryParams | string = '') {
    const qs = typeof params === 'string' ? params : toQueryString(params);
    return apiFetch(`/api/business/finance/transactions/${qs}`);
  },
  createFinanceTransaction(payload: {
    partner: number;
    amount: number;
    transaction_type: 'RECEIPT' | 'PAYMENT' | 'ADJUST';
    note?: string;
  }) {
    return apiFetch(`/api/business/finance/transactions/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateFinanceTransaction(
    id: number,
    payload: Partial<{
      partner: number;
      amount: number;
      transaction_type: 'RECEIPT' | 'PAYMENT' | 'ADJUST';
      note?: string;
    }>,
  ) {
    return apiFetch(`/api/business/finance/transactions/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  deleteFinanceTransaction(id: number) {
    return apiFetch(`/api/business/finance/transactions/${id}/`, {
      method: 'DELETE',
    });
  },
};
