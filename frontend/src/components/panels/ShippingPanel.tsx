import { useState, useMemo, useEffect } from 'react';
import { api } from '../../api/client';
import FilterBar from '../common/FilterBar';
import NavbarButton from '../common/NavbarButton';
import Pagination from '../common/Pagination';
import Modal from '../common/Modal';
import StatusBadge from '../common/StatusBadge';
import { useSalesOrders, SalesOrdersFilters } from '../../hooks/useSalesOrders';
import { useShippingLogs } from '../../hooks/useShippingLogs';

// 引入重构后的三大零件
import ShippingStatusTable from './shipping/ShippingStatusTable';
import { ShippingEntryForm } from './shipping/ShippingEntryForm';
import { ShippingHistoryLog } from './shipping/ShippingHistoryLog';

const PAGE_SIZE = 30;

type ShippingSubmissionRecord = { orderId: number; itemId: number; quantity: number; trackingNo?: string };

// Panel UI 层的过滤态——customerInput 直接传给后端做 partner_name 模糊匹配。
interface PanelFiltersState {
  status: string;
  customerInput: string;
}

export default function ShippingPanel() {
  // --- 1. 状态管理 ---
  const [isSavingId, setIsSavingId] = useState<number | null>(null);
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  // 详情弹窗状态
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  // 发货录入草稿状态
  const [shippingDrafts, setShippingDrafts] = useState([
    { orderId: '', itemId: '', quantity: '', trackingNo: '' }
  ]);

  // --- 2. 筛选 + 分页：server-side filter 配合 useSalesOrders / useShippingLogs ---
  const [panelFilters, setPanelFilters] = useState<PanelFiltersState>({
    status: '',
    customerInput: '',
  });
  const [page, setPage] = useState(1);

  // 切换筛选条件时回到第 1 页（与 usePaginatedFilter 原有行为一致）。
  useEffect(() => {
    setPage(1);
  }, [panelFilters]);

  const salesFilters = useMemo<SalesOrdersFilters>(() => {
    const next: SalesOrdersFilters = {};
    if (panelFilters.status) next.status = panelFilters.status;
    if (panelFilters.customerInput.trim()) {
      next.partner_name = panelFilters.customerInput.trim();
    }
    return next;
  }, [panelFilters]);

  const salesOrdersQuery = useSalesOrders({
    enabled: true,
    page,
    pageSize: PAGE_SIZE,
    filters: salesFilters,
  });
  const pagedOrders = salesOrdersQuery.data;
  const totalCount = salesOrdersQuery.pagination.totalCount;
  const loading = salesOrdersQuery.loading;
  const error = salesOrdersQuery.error;
  const onRefreshOrders = salesOrdersQuery.reload;

  const shippingLogsQuery = useShippingLogs({
    enabled: true,
    page: 1,
    pageSize: PAGE_SIZE,
    // 发货日志暂时按筛选客户名联动（如果用户输入了），其他筛选先保持简单。
    filters: panelFilters.customerInput.trim()
      ? { partner_name: panelFilters.customerInput.trim() }
      : undefined,
  });
  const logs = shippingLogsQuery.data;
  const logsLoading = shippingLogsQuery.loading;
  const onRefreshLogs = shippingLogsQuery.reload;

  const resetFilters = () => {
    setPanelFilters({ status: '', customerInput: '' });
  };

  const activeOrder = useMemo(
    () => pagedOrders.find((o) => o.id === selectedOrderId),
    [pagedOrders, selectedOrderId],
  );

  // --- 3. 业务动作 ---

  // A. 单条更新订单状态
  const handleUpdateStatus = async (id: number, newStatus: string) => {
    try {
      setIsSavingId(id);
      await api.updateSalesOrderStatus(id, newStatus);
      await onRefreshOrders();
    } catch (err: any) {
      alert("状态更新失败: " + err.message);
    } finally {
      setIsSavingId(null);
    }
  };

  // B. 处理发货表单变动 (包含单号自动同步逻辑)
  const handleDraftChange = (index: number, field: string, value: string) => {
    setShippingDrafts(prev => {
      const next = [...prev];
      const current = { ...next[index], [field]: value };
      if (field === 'orderId') current.itemId = '';
      next[index] = current;

      // 智能填充：第一行填了单号，自动同步给后面为空的行
      if (index === 0 && field === 'trackingNo') {
        for (let i = 1; i < next.length; i++) {
          if (!next[i].trackingNo) next[i] = { ...next[i], trackingNo: value };
        }
      }
      return next;
    });
  };

  // C. 提交批量发货
  const handleBulkSubmit = async (records: ShippingSubmissionRecord[]) => {
    if (!records.length) {
      alert("请填写有效的发货记录");
      return;
    }

    try {
      setIsBulkSaving(true);
      await Promise.all(records.map((d) => 
        api.createShippingLog({
          sales_item: Number(d.itemId),
          quantity_shipped: Number(d.quantity),
          tracking_no: d.trackingNo || undefined
        })
      ));
      setShippingDrafts([{ orderId: '', itemId: '', quantity: '', trackingNo: '' }]);
      await onRefreshOrders();
      if (typeof onRefreshLogs === 'function') {
        await onRefreshLogs();
      }
      alert("发货记录已成功保存");
    } catch (err: any) {
      alert("批量提交失败: " + err.message);
    } finally {
      setIsBulkSaving(false);
    }
  };

  // --- 4. 渲染视图 ---
  if (error) return <div className="p-10 text-rose-500 font-bold bg-rose-50 rounded-3xl">加载失败: {error}</div>;

  return (
    <div className="space-y-12 animate-in fade-in duration-500 pb-32">
      
      {/* SECTION 1: 监控与筛选区 */}
      <div className="space-y-6">
        <FilterBar actions={
          <NavbarButton variant="outline" className="font-bold" onClick={resetFilters}>
            重置全部筛选
          </NavbarButton>
        }>
          <FilterBar.Field label="搜索客户名称 / 订单 ID">
            <input
              className="w-full rounded-full border border-slate-200 px-6 py-4 text-base font-bold outline-none focus:border-slate-900 transition-all placeholder:text-slate-300"
              placeholder="输入关键词进行检索..."
              value={panelFilters.customerInput}
              onChange={(e) => setPanelFilters(prev => ({ ...prev, customerInput: e.target.value }))}
            />
          </FilterBar.Field>
        </FilterBar>

        <div className="relative">
          {loading && (
            <div className="absolute inset-0 bg-white/60 z-20 flex items-center justify-center backdrop-blur-[2px] rounded-[2.5rem]">
              <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-full shadow-xl border border-slate-100">
                <div className="w-5 h-5 border-3 border-slate-900 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-black uppercase tracking-widest text-slate-900">数据同步中</span>
              </div>
            </div>
          )}
          
          {/* 核心状态表 (已包含移动端自适应) */}
          <ShippingStatusTable
            orders={pagedOrders}
            onUpdateStatus={handleUpdateStatus}
            onRowClick={(id) => setSelectedOrderId(id)}
            isSaving={isSavingId}
            activeFilter={panelFilters.status}
            onFilterChange={(val) => setPanelFilters(prev => ({ ...prev, status: val }))}
          />
        </div>

        <Pagination page={page} total={totalCount} onPageChange={setPage} />
      </div>

      <hr className="border-slate-100" />

      {/* SECTION 2: 批量记录发货 (白色卡片风格) */}
      <ShippingEntryForm
        orders={pagedOrders}
        drafts={shippingDrafts}
        onDraftChange={handleDraftChange}
        onAddRow={() => setShippingDrafts([...shippingDrafts, { orderId: '', itemId: '', quantity: '', trackingNo: shippingDrafts[0]?.trackingNo || '' }])}
        onRemoveRow={(idx) => setShippingDrafts(prev => prev.filter((_, i) => i !== idx))}
        onSubmit={handleBulkSubmit}
        isSaving={isBulkSaving}
      />

      {/* SECTION 3: 发货流水日志 */}
      <ShippingHistoryLog 
        logs={logs || []} 
        loading={logsLoading} 
      />

      {/* 详情与事件弹窗 */}
      <Modal 
        open={!!selectedOrderId} 
        onClose={() => setSelectedOrderId(null)} 
        title="销售订单详情记录" 
        maxWidth="max-w-2xl"
      >
        {activeOrder && (
          <div className="space-y-8 py-2">
            <div className="flex justify-between items-start border-b border-slate-100 pb-6">
              <div>
                <h3 className="text-2xl font-black text-slate-900">{activeOrder.partner_name}</h3>
                <p className="text-sm font-mono text-slate-400 mt-1 uppercase tracking-widest">{activeOrder.order_no}</p>
              </div>
              <StatusBadge kind="shipping" status={activeOrder.status} />
            </div>

            <div className="space-y-4">
              <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">订单关联事件流</h4>
              {activeOrder.events?.length ? (
                <div className="space-y-4">
                  {activeOrder.events.map((ev: any) => (
                    <div key={ev.id} className="bg-slate-50 rounded-2xl p-5 border border-slate-100 transition-hover hover:border-slate-200">
                      <p className="text-[15px] text-slate-700 leading-relaxed font-medium">{ev.content}</p>
                      <div className="flex justify-between text-[11px] font-bold text-slate-400 uppercase mt-4">
                        <span>记录人: {ev.operator || '系统'}</span>
                        <span>{new Date(ev.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
                  <p className="text-sm text-slate-400 font-bold italic">暂无历史备注或变更记录</p>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
