import { Fragment, useState, useMemo } from 'react';
import { api } from '../../api/client';
import FilterBar from '../common/FilterBar';
import {PartnerSelect} from '../common/PartnerSelect';
import StatusBadge from '../common/StatusBadge';
import OrderDetailsView from '../common/OrderDetailsView';
import  {OrderItemsEditor}  from '../common/OrderItemsEditor';
import type { OrderItemDraft } from '../common/OrderItemsEditor';
import Modal from '../common/Modal';
import Pagination from '../common/Pagination';
import { resolvePartnerId, formatPartner } from '../../utils/orderUtils';
import NavbarButton from '../common/NavbarButton';

// 1. 常量定义 - 销售状态
const SALES_STATUS_OPTIONS = [
  { value: 'PENDING', label: '待处理' },
  { value: 'PRODUCING', label: '生产中' },
  { value: 'SHIPPED', label: '已发货' },
  { value: 'COMPLETED', label: '已完成' },
];

export default function SalesOrdersPanel({ 
  orders = [], loading, onRefresh, products, partners, isManager, categories, canCreateEvents 
}: any) {
  // --- 状态管理 ---
  const [filters, setFilters] = useState({ status: '', customerInput: '', customerId: null as number | null });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  
  const [modal, setModal] = useState<{ open: boolean; mode: 'create' | 'edit'; draftId: number | null }>({
    open: false, mode: 'create', draftId: null
  });
  const [form, setForm] = useState({ customerField: '', status: 'PENDING', items: [] as OrderItemDraft[] });
  const [isSaving, setIsSaving] = useState(false);
  const [eventModal, setEventModal] = useState({ open: false, orderId: null as number | null, content: '' });

  // --- 数据处理 (useMemo) ---
  const customerOptions = useMemo(() => 
    partners.filter((p: any) => p.partner_type === 'CUSTOMER'), 
  [partners]);
  
  const categoryOptions = useMemo(() => 
    (categories || []).map((c: any) => ({ value: String(c.id), label: c.name })), 
  [categories]);

  const filteredOrders = useMemo(() => {
    return orders.filter((o: any) => {
      const matchStatus = !filters.status || o.status === filters.status;
      if (filters.customerId) return matchStatus && Number(o.partner) === filters.customerId;
      if (filters.customerInput) {
        return matchStatus && o.partner_name?.toLowerCase().includes(filters.customerInput.toLowerCase());
      }
      return matchStatus;
    });
  }, [orders, filters]);

  const pagedOrders = useMemo(() => 
    filteredOrders.slice((page - 1) * 30, page * 30), 
  [filteredOrders, page]);

  // --- 业务逻辑 ---
  const handleAddEvent = (orderId: number) => {
    setEventModal({ open: true, orderId, content: '' });
  };

  const submitEvent = async () => {
    if (!eventModal.content.trim() || !eventModal.orderId) return;
    try {
      setIsSaving(true);
      await api.createSalesOrderEvent(eventModal.orderId, {
        event_type: 'REMARK',
        content: eventModal.content.trim()
      });
      setEventModal({ ...eventModal, open: false });
      onRefresh();
    } catch (err: any) {
      alert("保存失败: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const openCreate = () => {
    setForm({ customerField: '', status: 'PENDING', items: [{ id: null, category: '', product: '', price: '', quantity: '', customName: '', detailDescription: '' }] });
    setModal({ open: true, mode: 'create', draftId: null });
  };

  const openEdit = (order: any) => {
    setForm({
      customerField: formatPartner(order.partner_name, order.partner),
      status: order.status,
      items: order.items.map((i: any) => ({
        id: i.id, 
        category: String(i.product_detail?.category_detail?.id || ''),
        product: String(i.product), 
        price: String(i.price), 
        quantity: String(i.quantity),
        customName: i.custom_product_name || '',
        detailDescription: i.detail_description || ''
      }))
    });
    setModal({ open: true, mode: 'edit', draftId: order.id });
  };

  const handleSubmit = async () => {
    const cId = resolvePartnerId(form.customerField, customerOptions);
    if (!cId) return alert("请选择有效的客户");

    const validItems = form.items.filter(item => (item.product || item.customName) && Number(item.quantity) > 0);
    if (validItems.length === 0) return alert("订单明细不能为空");

    try {
      setIsSaving(true);
      const payload = {
        partner: cId, status: form.status,
        items_payload: validItems.map(i => ({
          id: i.id || undefined, product: i.product ? Number(i.product) : null, 
          price: Number(i.price), quantity: Number(i.quantity),
          custom_product_name: i.customName, detail_description: i.detailDescription
        }))
      };
      if (modal.mode === 'create') await api.createSalesOrder(payload);
      else await api.updateSalesOrder(modal.draftId!, payload);
      setModal({ ...modal, open: false });
      onRefresh();
    } catch (e: any) { alert(e.message); } finally { setIsSaving(false); }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* A. 标题区 */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">销售管理</h2>
          <p className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-widest">Outbound Sales & Orders</p>
        </div>
        {isManager && (
          <button onClick={openCreate} className="rounded-full bg-slate-900 px-6 py-2 text-sm font-bold text-white shadow-lg active:scale-95 transition-all">
            + 新建销售单
          </button>
        )}
      </div>

      {/* B. 筛选区 */}
      <FilterBar actions={
        <NavbarButton variant="outline" className="text-xs" onClick={() => setFilters({ status: '', customerInput: '', customerId: null })}>
          重置筛选
        </NavbarButton>
      }>
        <FilterBar.Field label="客户名称 / #ID">
          <PartnerSelect 
            id="sales-filter" partners={customerOptions} value={filters.customerInput}
            onChange={(val, id) => setFilters({ ...filters, customerInput: val, customerId: id })}
          />
        </FilterBar.Field>
        <FilterBar.Field label="订单状态">
          <select className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm bg-white outline-none focus:border-slate-900" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
            <option value="">全部显示</option>
            {SALES_STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </FilterBar.Field>
      </FilterBar>

      {/* C. 列表区 (响应式) */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {/* 桌面端表格 - 按照你的标准统一字号 */}
        <table className="hidden md:table min-w-full text-sm">
          <thead className="bg-slate-50/50 text-slate-500 uppercase text-[15px] font-bold tracking-widest">
            <tr>
              <th className="px-6 py-4 text-left">客户信息 / 销售单号</th>
              <th className="px-6 py-4 text-center">当前状态</th>
              <th className="px-4 py-4 text-right">结算金额</th>
              <th className="px-6 py-4 text-right">管理</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {pagedOrders.map(order => (
              <Fragment key={order.id}>
                <tr className={`hover:bg-slate-50/50 cursor-pointer transition-colors ${expandedId === order.id ? 'bg-slate-50/80' : ''}`} onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}>
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-800">{order.partner_name || `客户#${order.partner}`}</p>
                    <p className="text-[15px] font-mono text-slate-400">{order.order_no}</p>
                  </td>
                  <td className="px-6 py-4 text-center"><StatusBadge kind="sales" status={order.status} /></td>
                  <td className="px-4 py-4 text-right font-bold text-slate-900">¥ {Number(order.total_amount).toFixed(2)}</td>
                  <td className="px-6 py-4 text-right flex justify-end gap-2">
                    {canCreateEvents && (
                      <NavbarButton variant="outline" onClick={(e) => { e.stopPropagation(); handleAddEvent(order.id); }} className="text-[10px] py-1 px-3">记录动态</NavbarButton>
                    )}
                    <NavbarButton variant="outline" onClick={(e) => { e.stopPropagation(); openEdit(order); }} className="text-[10px] py-1 px-3">编辑订单</NavbarButton>
                  </td>
                </tr>
                {expandedId === order.id && (
                  <tr>
                    <td colSpan={4} className="p-0 border-b border-slate-100">
                      <OrderDetailsView mode="sales" items={order.items} events={order.events || []} orderId={order.id} onAddEvent={handleAddEvent} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>

        {/* 移动端卡片 */}
        <div className="md:hidden divide-y divide-slate-50">
          {pagedOrders.map(order => (
            <div key={order.id} className="flex flex-col">
              <div className={`p-5 active:bg-slate-100 ${expandedId === order.id ? 'bg-slate-50' : ''}`} onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{order.partner_name}</p>
                    <p className="text-[10px] font-mono text-slate-400 uppercase">{order.order_no}</p>
                  </div>
                  <StatusBadge kind="sales" status={order.status} />
                </div>
                <div className="flex justify-between items-end">
                  <div className="flex gap-2">
                    <NavbarButton variant="outline" onClick={(e) => { e.stopPropagation(); openEdit(order); }} className="text-[10px] py-1 px-3">修改</NavbarButton>
                    {canCreateEvents && (
                      <NavbarButton variant="outline" onClick={(e) => { e.stopPropagation(); handleAddEvent(order.id); }} className="text-[10px] py-1 px-3">记录</NavbarButton>
                    )}
                  </div>
                  <p className="text-lg font-black text-slate-900">¥ {Number(order.total_amount).toFixed(2)}</p>
                </div>
              </div>
              {expandedId === order.id && (
                <div className="border-t border-slate-100">
                  <OrderDetailsView mode="sales" items={order.items} events={order.events || []} orderId={order.id} onAddEvent={handleAddEvent} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* D. 弹窗区 */}
      <Modal 
        open={modal.open} onClose={() => setModal({ ...modal, open: false })}
        title={modal.mode === 'create' ? '创建销售单' : '修改销售信息'} maxWidth="max-w-5xl"
        footer={<NavbarButton disabled={isSaving} onClick={handleSubmit} className="px-10">{isSaving ? '提交中...' : '确认发布销售单'}</NavbarButton>}
      >
        <div className="space-y-8 py-2">
          <PartnerSelect label="选择下单客户" id="modal-customer" partners={customerOptions} value={form.customerField} onChange={(val) => setForm({ ...form, customerField: val })} />
          <OrderItemsEditor mode="sales" items={form.items} products={products} categoryOptions={categoryOptions} onChange={(newItems) => setForm({ ...form, items: newItems })} />
        </div>
      </Modal>

      {/* E. 记录动态专用小弹窗 */}
      <Modal 
        open={eventModal.open} 
        onClose={() => setEventModal({ ...eventModal, open: false })}
        title="添加业务动态"
        maxWidth="max-w-md"
        footer={
          <div className="flex gap-3 w-full">
            <NavbarButton variant="outline" className="flex-1" onClick={() => setEventModal({ ...eventModal, open: false })}>取消</NavbarButton>
            <NavbarButton className="flex-1" disabled={isSaving || !eventModal.content.trim()} onClick={submitEvent}>
              {isSaving ? '保存中...' : '确认记录'}
            </NavbarButton>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
            <p className="text-sm text-blue-800 leading-relaxed">
              <strong>提示：</strong> 此记录将同步至订单时间线，方便记录客户反馈、生产进度或发货详情。
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-slate-500 ml-1 uppercase tracking-widest">动态内容</label>
            <textarea 
              autoFocus rows={4}
              className="w-full rounded-2xl border border-slate-200 p-4 text-base focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 outline-none transition-all resize-none"
              placeholder="例如：已安排车间生产，预计后天可发货..."
              value={eventModal.content}
              onChange={(e) => setEventModal({ ...eventModal, content: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      <Pagination page={page} total={filteredOrders.length} onPageChange={setPage} />
    </div>
  );
}