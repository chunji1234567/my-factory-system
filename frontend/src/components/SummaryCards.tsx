import { memo } from 'react';
import type { PanelKey } from '../types';
import type {
  OrderSummary,
  ProductItem,
  PurchaseOrderMock,
  FinanceTransactionMock,
  ShippingLogMock,
} from '../mockData';

interface SummaryCardsProps {
  active: PanelKey;
  salesOrders: OrderSummary[];
  purchaseOrders: PurchaseOrderMock[];
  products: ProductItem[];
  transactions: FinanceTransactionMock[];
  shippingLogs: ShippingLogMock[];
}

type Card = { title: string; value: string | number; note: string };

function SummaryCards({
  active,
  salesOrders,
  purchaseOrders,
  products,
  transactions,
  shippingLogs,
}: SummaryCardsProps) {
  const cards = buildCards({ active, salesOrders, purchaseOrders, products, transactions, shippingLogs });
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <p className="text-sm uppercase tracking-widest text-slate-400">当前模块</p>
      <h2 className="mt-2 text-3xl font-bold text-slate-800">{panelTitle(active)}</h2>
      <p className="mt-4 text-slate-600">{panelDesc(active)}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <article key={card.title} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
              {card.title}
            </p>
            <p className="mt-3 text-3xl font-bold text-slate-900">{card.value}</p>
            <p className="text-sm text-slate-500">{card.note}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function buildCards(params: SummaryCardsProps): Card[] {
  const { active, salesOrders, purchaseOrders, products, transactions, shippingLogs } = params;
  const pendingSales = salesOrders.filter((order) => order.status !== 'COMPLETED').length;
  const lowStock = products.filter((item) => item.stockQuantity < item.minStock).length;
  const receivables = salesOrders.reduce((sum, order) => sum + (order.totalAmount - order.paidAmount), 0);
  const payables = purchaseOrders.reduce((sum, order) => sum + order.totalAmount, 0);
  const cashIn = transactions.filter((txn) => txn.amount > 0).reduce((sum, txn) => sum + txn.amount, 0);
  const cashOut = transactions.filter((txn) => txn.amount < 0).reduce((sum, txn) => sum + txn.amount, 0);

  switch (active) {
    case 'dashboard':
      return [
        { title: '订单总数', value: salesOrders.length, note: `未完成 ${pendingSales}` },
        { title: '库存总件数', value: products.reduce((sum, item) => sum + item.stockQuantity, 0), note: `低库存 ${lowStock}` },
        { title: '本月收款', value: `¥ ${cashIn.toLocaleString()}`, note: `支出 ¥ ${(Math.abs(cashOut)).toLocaleString()}` },
      ];
    case 'inventory':
      return [
        { title: 'SKU 数量', value: products.length, note: `${lowStock} 个低库存` },
        { title: '库存总量', value: products.reduce((sum, item) => sum + item.stockQuantity, 0), note: '含原料与成品' },
        { title: '补货提醒', value: lowStock, note: '需安排补货' },
      ];
    case 'finance':
      return [
        { title: '应收余额', value: `¥ ${receivables.toLocaleString()}`, note: `${salesOrders.length} 张销售单` },
        { title: '应付余额', value: `¥ ${payables.toLocaleString()}`, note: `${purchaseOrders.length} 张采购单` },
        { title: '净现金流', value: `¥ ${(cashIn + cashOut).toLocaleString()}`, note: '含所有流水' },
      ];
    case 'purchase':
      return [
        { title: '采购单', value: purchaseOrders.length, note: `${purchaseOrders.filter((po) => po.status !== 'RECEIVED').length} 未完成` },
        { title: '在途金额', value: `¥ ${purchaseOrders.reduce((sum, po) => sum + (po.status === 'RECEIVED' ? 0 : po.totalAmount), 0).toLocaleString()}`, note: '待入库金额' },
        { title: '供应商', value: new Set(purchaseOrders.map((po) => po.partner)).size, note: '活跃供应商' },
      ];
    case 'shipping':
      return [
        { title: '发货记录', value: shippingLogs.length, note: `${shippingLogs.filter((log) => log.status !== 'SHIPPED').length} 未完成` },
        { title: '总发货量', value: shippingLogs.reduce((sum, log) => sum + log.shippedQuantity, 0), note: '累计件数' },
        { title: '待发货量', value: shippingLogs.reduce((sum, log) => sum + (log.quantity - log.shippedQuantity), 0), note: '需排产数量' },
      ];
    case 'financeDetail':
      return [
        { title: '收款', value: `¥ ${cashIn.toLocaleString()}`, note: `${transactions.filter((txn) => txn.amount > 0).length} 笔` },
        { title: '付款', value: `¥ ${Math.abs(cashOut).toLocaleString()}`, note: `${transactions.filter((txn) => txn.amount < 0).length} 笔` },
        { title: '净现金流', value: `¥ ${(cashIn + cashOut).toLocaleString()}`, note: '自动计算' },
      ];
    case 'apiTester':
      return [
        { title: '可调接口', value: 8, note: '示例：产品/订单/财务等' },
        { title: '最近响应', value: 'OK', note: '成功调用记录' },
        { title: '数据库操作', value: '增删改查', note: '谨慎操作' },
      ];
    default:
      return [{ title: '提示', value: '-', note: '请选择模块' }];
  }
}

const panelTitle = (active: PanelKey) =>
  ({
    dashboard: '运营概览',
    inventory: '库存中心',
    finance: '财务总览',
    purchase: '采购管理',
    shipping: '发货控制',
    financeDetail: '财务流水',
  }[active]);

const panelDesc = (active: PanelKey) =>
  ({
    dashboard: '实时掌握销售、采购与出入库动态',
    inventory: '监控库存状态，支撑生产与发货',
    finance: '聚焦应收、应付与近期流水',
    purchase: '查看采购计划与到货情况',
    shipping: '关注发货进度与异常',
    financeDetail: '统计收款付款与净现金流',
  }[active]);

export default memo(SummaryCards);
