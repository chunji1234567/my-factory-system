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
  financeDetail: {
    title: '财务流水',
    description: '查看合作伙伴的转账记录',
    roles: ['manager'] satisfies PanelRole[],
  },
} as const;

export type PanelKey = keyof typeof panelConfig;
