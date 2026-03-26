export interface ProductItem {
  id: number;
  internalCode: string;
  modelName: string;
  stockQuantity: number;
  minStock: number;
  category: string;
  categoryType?: string;
  categoryId?: number;
}

export interface OrderSummary {
  id: number;
  partner: string;
  orderNo: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  createdAt: string;
}

export interface PurchaseOrderMock {
  id: number;
  partner: string;
  orderNo: string;
  status: string;
  totalAmount: number;
  createdAt: string;
}

export interface ShippingLogMock {
  id: number;
  orderNo: string;
  partner: string;
  product: string;
  quantity: number;
  shippedQuantity: number;
  shippedAt: string;
  status: string;
}

export interface FinanceTransactionMock {
  id: number;
  partner: string;
  amount: number;
  note: string;
  createdAt: string;
}

export const mockProducts: ProductItem[] = [
  {
    id: 1,
    internalCode: '2026-SH-SD-BK',
    modelName: '盾牌外壳·黑',
    stockQuantity: 520,
    minStock: 200,
    category: '自产外壳',
    categoryType: 'SELF_MADE',
    categoryId: 11,
  },
  {
    id: 2,
    internalCode: '2026-SH-SD-BL',
    modelName: '盾牌外壳·蓝',
    stockQuantity: 120,
    minStock: 150,
    category: '自产外壳',
    categoryType: 'SELF_MADE',
    categoryId: 11,
  },
  {
    id: 3,
    internalCode: 'RM-ABS-T100',
    modelName: '高流动 ABS T100',
    stockQuantity: 1800,
    minStock: 500,
    category: '原材料',
    categoryType: 'RAW_MATERIAL',
    categoryId: 1,
  },
];

export const mockOrders: OrderSummary[] = [
  {
    id: 11,
    partner: '泰国客户 A',
    orderNo: 'SO-2026-0011',
    status: 'PRODUCING',
    totalAmount: 125000,
    paidAmount: 50000,
    createdAt: '2026-03-10T09:30:00Z',
  },
  {
    id: 12,
    partner: '国内经销商',
    orderNo: 'SO-2026-0012',
    status: 'ORDERED',
    totalAmount: 68000,
    paidAmount: 0,
    createdAt: '2026-03-12T15:45:00Z',
  },
  {
    id: 13,
    partner: '海外客户 B',
    orderNo: 'SO-2026-0013',
    status: 'SHIPPED',
    totalAmount: 99000,
    paidAmount: 90000,
    createdAt: '2026-03-14T21:00:00Z',
  },
];

export const mockTransactions: FinanceTransactionMock[] = [
  {
    id: 201,
    partner: '泰国客户 A',
    amount: 30000,
    note: '二期货款',
    createdAt: '2026-03-18T10:05:00Z',
  },
  {
    id: 202,
    partner: '海外客户 B',
    amount: -15000,
    note: '供应商返点',
    createdAt: '2026-03-19T12:22:00Z',
  },
  {
    id: 203,
    partner: '国内经销商',
    amount: 28000,
    note: '月度预付款',
    createdAt: '2026-03-20T08:12:00Z',
  },
];

export const mockPurchaseOrders: PurchaseOrderMock[] = [
  {
    id: 51,
    partner: '塑料原料厂',
    orderNo: 'PO-2026-0001',
    status: 'ORDERED',
    totalAmount: 88000,
    createdAt: '2026-03-05T08:00:00Z',
  },
  {
    id: 52,
    partner: '五金件供应商',
    orderNo: 'PO-2026-0002',
    status: 'PARTIAL',
    totalAmount: 32000,
    createdAt: '2026-03-11T09:00:00Z',
  },
  {
    id: 53,
    partner: '国内经销商',
    orderNo: 'PO-2026-0003',
    status: 'RECEIVED',
    totalAmount: 15000,
    createdAt: '2026-03-14T10:00:00Z',
  },
];

export const mockShippingLogs: ShippingLogMock[] = [
  {
    id: 301,
    orderNo: 'SO-2026-0011',
    partner: '泰国客户 A',
    product: 'Elite 外壳黑',
    quantity: 300,
    shippedQuantity: 200,
    shippedAt: '2026-03-20T13:30:00Z',
    status: 'PARTIAL',
  },
  {
    id: 302,
    orderNo: 'SO-2026-0012',
    partner: '国内经销商',
    product: 'Elite 外壳蓝',
    quantity: 180,
    shippedQuantity: 180,
    shippedAt: '2026-03-21T09:10:00Z',
    status: 'SHIPPED',
  },
  {
    id: 303,
    orderNo: 'SO-2026-0013',
    partner: '海外客户 B',
    product: 'ABS 原粒',
    quantity: 500,
    shippedQuantity: 320,
    shippedAt: '2026-03-22T11:45:00Z',
    status: 'PENDING',
  },
];
