// src/components/panels/warehouse/WarehouseReceivingPanel.tsx
import { useState, useMemo } from 'react';
import { api } from '../../api/client';
import FilterBar from '../common/FilterBar';
import NavbarButton from '../common/NavbarButton';
import Pagination from '../common/Pagination';
import { ReceivingOrderTable } from './warehouse/ReceivingOrderTable';
import { ReceivingModal } from './warehouse/ReceivingModal';

export default function WarehouseReceivingPanel({ orders, loading, error, onRefresh }: any) {
  // --- 状态管理 ---
  const [filters, setFilters] = useState({ supplier: '', status: '' });
  const [page, setPage] = useState(1);
  const [modalOrderId, setModalOrderId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ purchaseItemId: null, quantity: '', remark: '' });
  const [modalError, setModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // --- 逻辑处理 ---
  const filteredOrders = useMemo(() => {
    return (orders || []).filter((o: any) => {
      const matchSupplier = !filters.supplier || o.partner_name?.toLowerCase().includes(filters.supplier.toLowerCase());
      const matchStatus = !filters.status || o.status === filters.status;
      return matchSupplier && matchStatus;
    }).sort((a: any, b: any) => {
      const aCompleted = a.status === 'RECEIVED';
      const bCompleted = b.status === 'RECEIVED';
      if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [orders, filters]);

  const pagedOrders = useMemo(() => filteredOrders.slice((page - 1) * 30, page * 30), [filteredOrders, page]);

  // --- 业务动作 ---
  const handleOpenModal = (orderId: number, itemId: number) => {
    setModalOrderId(orderId);
    setDraft({ purchaseItemId: itemId as any, quantity: '', remark: '' });
    setModalError(null);
  };

  const handleConfirm = async () => {
    if (!draft.purchaseItemId || !draft.quantity) {
      setModalError("请填写完整收货信息");
      return;
    }
    try {
      setSaving(true);
      await api.createReceivingLog({
        purchase_item: draft.purchaseItemId,
        quantity_received: Number(draft.quantity),
        remark: draft.remark || undefined,
      });
      setModalOrderId(null);
      await onRefresh();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (error) return <div className="p-10 text-rose-500 font-black bg-rose-50 rounded-[2.5rem]">⚠️ 加载失败: {error}</div>;

  return (
    <div className="space-y-8 md:space-y-12 animate-in fade-in pb-24">
      
      {/* 1. 复用 FilterBar */}
      <FilterBar actions={
        <NavbarButton variant="outline" className="font-black px-6" onClick={() => setFilters({ supplier: '', status: '' })}>
          重置筛选
        </NavbarButton>
      }>
        <FilterBar.Field label="搜索供应商名称 / 订单编号">
          <input 
            className="w-full rounded-full border border-slate-200 px-6 py-4 text-base font-bold outline-none focus:border-slate-900 transition-all shadow-inner"
            placeholder="输入关键词进行实时检索..."
            value={filters.supplier}
            onChange={(e) => { setFilters({ ...filters, supplier: e.target.value }); setPage(1); }}
          />
        </FilterBar.Field>
      </FilterBar>

      {/* 2. 状态切换选项卡 */}
      <div className="flex gap-3 overflow-x-auto pb-4 px-1 scrollbar-hide">
        {[
          { v: 'ORDERED', l: '待收货订单' },
          { v: 'PARTIAL', l: '部分到货' }
        ].map(opt => (
          <button
            key={opt.v}
            onClick={() => { setFilters(prev => ({ ...prev, status: prev.status === opt.v ? '' : opt.v })); setPage(1); }}
            className={`whitespace-nowrap px-8 py-3 rounded-full text-[15px] font-black transition-all border-2 ${
              filters.status === opt.v 
                ? 'bg-slate-900 text-white border-slate-900 shadow-xl scale-105' 
                : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'
            }`}
          >
            {opt.l}
          </button>
        ))}
      </div>

      {/* 3. 数据列表区 */}
      <div className="relative min-h-[400px]">
        {loading && (
          <div className="absolute inset-0 bg-white/60 z-20 flex items-center justify-center backdrop-blur-sm rounded-[3rem]">
            <div className="w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <ReceivingOrderTable orders={pagedOrders} onOpenModal={handleOpenModal} />
      </div>

      <Pagination page={page} total={filteredOrders.length} onPageChange={setPage} />

      {/* 4. 业务弹窗 */}
      <ReceivingModal 
        open={!!modalOrderId}
        onClose={() => setModalOrderId(null)}
        order={orders?.find((o: any) => o.id === modalOrderId)}
        draft={draft}
        setDraft={setDraft}
        onConfirm={handleConfirm}
        error={modalError}
        saving={saving}
      />
    </div>
  );
}
