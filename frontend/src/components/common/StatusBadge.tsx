import React from 'react';

interface Props {
  status: string;
  label?: string;
  kind: 'sales' | 'shipping' | 'purchase';
}

// 颜色映射：根据状态性质（而非业务类型）定义
const THEME_MAP: Record<string, string> = {
  // 蓝色：初始态/待处理
  ORDERED: 'bg-blue-50 text-blue-700 border-blue-100',
  PENDING: 'bg-slate-100 text-slate-600 border-slate-200', 
  
  // 橙色/青色：中间过程
  PRODUCING: 'bg-amber-50 text-amber-700 border-amber-100', // 生产中
  PARTIAL: 'bg-sky-50 text-sky-700 border-sky-100',         // 部分入库
  
  // 绿色：发货/入库成功 (物流活跃态)
  SHIPPED: 'bg-emerald-50 text-emerald-700 border-emerald-100', 
  RECEIVED: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  
  // 靛蓝色：彻底完成 (终结态) - 区别于发货的亮绿色
  COMPLETED: 'bg-indigo-50 text-indigo-700 border-indigo-100', 
  
  DEFAULT: 'bg-slate-50 text-slate-400 border-slate-100',
};

// 翻译字典：补全所有后端可能返回的 Key
const LABEL_MAP: Record<string, Record<string, string>> = {
  sales: {
    PENDING: '待处理',
    ORDERED: '已下单',
    PRODUCING: '生产中',
    SHIPPED: '已发货',
    COMPLETED: '已完成',
  },
  purchase: {
    ORDERED: '已下单',
    PARTIAL: '部分入库',
    RECEIVED: '全部入库',
  },
  shipping: {
    ORDERED: '待发货',
    PRODUCING: '生产中',
    SHIPPED: '已发货',
    COMPLETED: '已完成', // 补齐这个，防止显示英文
  }
};

export default function StatusBadge({ status, label, kind }: Props) {
  // 核心逻辑：找不到对应的中文就显示原文
  const displayLabel = label || LABEL_MAP[kind]?.[status] || status;
  const colorClass = THEME_MAP[status] || THEME_MAP.DEFAULT;

  return (
    <span className={`
      inline-flex items-center rounded-full border px-4 py-1 text-sm font-black tracking-wide
      ${colorClass}
    `}>
      {displayLabel}
    </span>
  );
}