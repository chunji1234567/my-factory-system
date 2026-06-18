export type PanelRole = 'manager' | 'warehouse' | 'shipper';

/**
 * 面板分组（侧边导航用，2026-06-18 改造）。
 * 顺序就是侧边栏从上到下的顺序——按业务环节排，对应工人脑子里的流程：
 *   1. daily      —— 三角色每天都开的面板（排产/发货/收货）
 *   2. orders     —— manager 维护的销售/采购订单
 *   3. warehouse  —— 库存与自产件资产
 *   4. setup      —— 合作方结算 + PCB 方案配置
 *
 * 组内顺序遵循"上游到下游"业务时序，详见 panelConfig 各项的 group + title 顺序。
 */
export type PanelGroup = 'daily' | 'orders' | 'warehouse' | 'setup';

export const panelGroupConfig: Record<PanelGroup, { title: string }> = {
  daily: { title: '日常作业' },
  orders: { title: '订单管理' },
  warehouse: { title: '仓库与资产' },
  setup: { title: '合作方与配置' },
};

/** 侧边栏分组的显示顺序——key 顺序决定 UI 渲染顺序。 */
export const panelGroupOrder: readonly PanelGroup[] = [
  'daily',
  'orders',
  'warehouse',
  'setup',
] as const;

export const panelConfig = {
  // —— 日常作业 ——
  production: {
    title: '排产中心',
    description: '每日排产 + 一键扣料（外壳 / PCB 方案 / 线材）',
    // BOM 改造：三角色都可以排产，详见 docs/PRD.md §4.5。
    roles: ['manager', 'warehouse', 'shipper'] satisfies PanelRole[],
    group: 'daily' as PanelGroup,
  },
  shipping: {
    title: '发货控制',
    description: '掌握物流与发货进度',
    roles: ['manager', 'shipper'] satisfies PanelRole[],
    group: 'daily' as PanelGroup,
  },
  receiving: {
    title: '收货中心',
    description: '仓库确认采购收货',
    roles: ['manager', 'warehouse'] satisfies PanelRole[],
    group: 'daily' as PanelGroup,
  },

  // —— 订单管理（manager 维护）——
  sales: {
    title: '销售管理',
    description: '维护销售订单与发货节奏',
    roles: ['manager'] satisfies PanelRole[],
    group: 'orders' as PanelGroup,
  },
  purchase: {
    title: '采购管理',
    description: '查询采购计划与入库记录',
    roles: ['manager'] satisfies PanelRole[],
    group: 'orders' as PanelGroup,
  },

  // —— 仓库与资产 ——
  inventory: {
    title: '库存中心',
    description: '管理产品和库存调整',
    roles: ['manager', 'warehouse'] satisfies PanelRole[],
    group: 'warehouse' as PanelGroup,
  },
  selfMadeGallery: {
    title: '自产图库',
    description: '展示自产外壳并快速调整库存',
    roles: ['manager', 'warehouse'] satisfies PanelRole[],
    group: 'warehouse' as PanelGroup,
  },

  // —— 合作方与配置（manager 维护）——
  partners: {
    // 2026-06-18 合并：财务流水（FinanceDetailPanel）作为该面板下的"流水"标签页，
    // 不再独立面板——所有流水都隶属于某个合作方，且每年导出台账以合作方为单位。
    title: '合作方与结算',
    description: '管理客户/供应商账户、查看余额并登记往来流水',
    roles: ['manager'] satisfies PanelRole[],
    group: 'setup' as PanelGroup,
  },
  pcbPlans: {
    title: 'PCB 方案',
    // BOM-2.0：方案 = 一种 PCB 板的物料配方，由 manager 维护（PRD §3.2 §4.5）。
    description: '维护 PCB 方案的物料配方（排产展开扣料）',
    roles: ['manager'] satisfies PanelRole[],
    group: 'setup' as PanelGroup,
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
