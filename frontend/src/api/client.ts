const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
const FALLBACK_API_BASE = 'http://127.0.0.1:8000';

function resolveApiBaseUrl() {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (typeof window !== 'undefined') {
    const { origin, hostname } = window.location;
    if (!LOCAL_HOSTS.has(hostname)) {
      return origin;
    }
  }
  return FALLBACK_API_BASE;
}

const API_BASE_URL = resolveApiBaseUrl();
let authToken: string | null = null;

export function setAuthToken(token: string) {
  authToken = token;
}

export function clearAuthToken() {
  authToken = null;
}

interface ApiOptions extends RequestInit {
  skipAuth?: boolean;
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  headers.set('Content-Type', 'application/json');

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
  getProducts() {
    return apiFetch(`/api/core/products/`);
  },
  getCurrentUser() {
    return apiFetch(`/api/core/me/`);
  },
  getPartners() {
    return apiFetch(`/api/core/partners/`);
  },
  getCategories() {
    return apiFetch(`/api/core/categories/`);
  },
  createCategory(payload: { name: string; category_type: string; parent?: number | null }) {
    return apiFetch(`/api/core/categories/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  createProduct(payload: {
    category: number;
    internal_code: string;
    model_name: string;
    unit?: string;
    stock_quantity?: number;
    min_stock?: number;
  }) {
    return apiFetch(`/api/core/products/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  createPartner(payload: { name: string; partner_type: string }) {
    return apiFetch(`/api/core/partners/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getSalesOrders(params = '') {
    return apiFetch(`/api/business/sales-orders/${params}`);
  },
  createSalesOrder(payload: {
    partner: number;
    operator?: string;
    items_payload: Array<{
      product: number | null;
      custom_product_name: string;
      detail_description?: string;
      price: number;
      quantity: number;
    }>;
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
      status: string;
      operator?: string;
      items_payload: Array<{
        product: number | null;
        custom_product_name: string;
        detail_description?: string;
        price: number;
        quantity: number;
      }>;
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
  getPurchaseOrders(params = '') {
    return apiFetch(`/api/business/purchase-orders/${params}`);
  },
  createPurchaseOrder(payload: {
    order_no: string;
    partner: number;
    operator?: string;
    items_payload: Array<{ product: number; price: number; quantity: number }>;
  }) {
    return apiFetch(`/api/business/purchase-orders/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updatePurchaseOrder(id: number, payload: Partial<{ partner: number; status: string; operator?: string; items_payload: Array<{ product: number; price: number; quantity: number }>;}>) {
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
  getFinanceSummary(type: 'receivable' | 'payable' = 'receivable') {
    return apiFetch(`/api/business/finance/partners/?type=${type}`);
  },
  getShippingLogs(params = '') {
    return apiFetch(`/api/business/shipping-logs/${params}`);
  },
  createShippingLog(payload: { sales_item: number; quantity_shipped: number; tracking_no?: string }) {
    return apiFetch(`/api/business/shipping-logs/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  createReceivingLog(payload: { purchase_item: number; quantity_received: number; remark?: string }) {
    return apiFetch(`/api/business/receiving-logs/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getFinancePartnerDetail(partnerId: number, type: 'receivable' | 'payable') {
    return apiFetch(`/api/business/finance/partners/${partnerId}/?type=${type}`);
  },
  getFinanceTransactions(params = '') {
    return apiFetch(`/api/business/finance/transactions/${params}`);
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
