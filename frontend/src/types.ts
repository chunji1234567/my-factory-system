export type PanelRole = 'manager' | 'warehouse' | 'shipper';

export const panelConfig = {
  inventory: {
    title: '库存中心',
    description: '管理产品和库存调整',
    roles: ['manager', 'warehouse'] satisfies PanelRole[],
  },
  sales: {
    title: '销售管理',
    description: '维护销售订单与发货节奏',
    roles: ['manager'] satisfies PanelRole[],
  },
  purchase: {
    title: '采购管理',
    description: '查询采购计划与入库记录',
    roles: ['manager'] satisfies PanelRole[],
  },
  shipping: {
    title: '发货控制',
    description: '掌握物流与发货进度',
    roles: ['manager', 'shipper'] satisfies PanelRole[],
  },
  receiving: {
    title: '收货中心',
    description: '仓库确认采购收货',
    roles: ['manager', 'warehouse'] satisfies PanelRole[],
  },
  partners: {
    title: '合作方',
    description: '创建合作伙伴并查看余额',
    roles: ['manager'] satisfies PanelRole[],
  },
  selfMadeGallery: {
    title: '自产图库',
    description: '展示自产外壳并快速调整库存',
    roles: ['manager', 'warehouse'] satisfies PanelRole[],
  },
  financeDetail: {
    title: '财务流水',
    description: '查看合作伙伴的转账记录',
    roles: ['manager'] satisfies PanelRole[],
  },
  production: {
    title: '排产中心',
    description: '每日排产 + 一键扣料（外壳 / PCB 方案 / 线材）',
    // BOM 改造：三角色都可以排产，详见 docs/PRD.md §4.5。
    roles: ['manager', 'warehouse', 'shipper'] satisfies PanelRole[],
  },
  pcbPlans: {
    title: 'PCB 方案',
    // BOM-2.0：方案 = 一种 PCB 板的物料配方，由 manager 维护（PRD §3.2 §4.5）。
    description: '维护 PCB 方案的物料配方（排产展开扣料）',
    roles: ['manager'] satisfies PanelRole[],
  },
} as const;

export type PanelKey = keyof typeof panelConfig;

export type StockAdjustmentType = 'MANUAL_IN' | 'MANUAL_OUT' | 'PRODUCE_IN';

export const stockAdjustmentOptions = [
  { value: 'MANUAL_IN', label: '入库/盘盈', shortLabel: '入库' },
  { value: 'MANUAL_OUT', label: '出库/盘亏', shortLabel: '出库' },
  { value: 'PRODUCE_IN', label: '生产入库', shortLabel: '生产入库' },
] as const satisfies ReadonlyArray<{ value: StockAdjustmentType; label: string; shortLabel: string }>;

export interface InventoryProduct {
  id: number;
  internalCode: string;
  modelName: string;
  stockQuantity: number;
  minStock: number;
  category: string;
  categoryType?: string;
  categoryId?: number;
}

// 注意：OrderSummary / PurchaseOrderSummary 接口已删除——它们仅被死代码
// （OrderTable.tsx / SummaryCards.tsx，已于 2026-05-11 删除）引用。
// 现役订单类型应使用 hooks/useSalesOrders.ts 与 hooks/usePurchaseOrders.ts
// 中的 SalesOrderResponse / PurchaseOrderResponse。
//
// FinanceTransactionListItem 与 ShippingLogSummary 仍保留，因为 FinanceList.tsx
// 等死代码尚未清理；待下一轮统一删（见 docs/PRD.md §9.2）。
export interface FinanceTransactionListItem {
  id: number;
  partner: string;
  amount: number;
  note: string;
  createdAt: string;
}

export interface ShippingLogSummary {
  id: number;
  orderNo: string;
  partner: string;
  product: string;
  quantity: number;
  shippedQuantity: number;
  shippedAt: string;
  status: string;
}
