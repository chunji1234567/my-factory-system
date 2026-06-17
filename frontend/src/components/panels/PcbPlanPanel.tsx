import { useState, useMemo } from 'react';
import { api } from '../../api/client';
import { usePcbPlans, PcbPlanResponse } from '../../hooks/usePcbPlans';
import { useProducts, ProductResponse } from '../../hooks/useProducts';
import NavbarButton from '../common/NavbarButton';
import Modal from '../common/Modal';
import Pagination from '../common/Pagination';
import FilterBar from '../common/FilterBar';

/**
 * PCB 方案管理面板（manager only，BOM-2.0）。
 *
 * - 列表：所有方案（含已下架），按是否启用 + 名字排序
 * - 详情/编辑：物料配方逐行编辑（add/remove，全量替换）
 * - 启用/下架：用 is_active 软删除——历史排产明细仍能引用，但新订单选不到
 *
 * 详见 docs/PRD.md §3.2 §4.5 §9.4 changelog 2026-05-21（PCB 方案改造）。
 */

const PAGE_SIZE = 20;

interface MaterialDraft {
  material: string;          // Product ID（字符串以适配下拉）
  quantity_per_unit: string;
  note: string;
}

interface FormState {
  name: string;
  code: string;
  description: string;
  is_active: boolean;
  materials: MaterialDraft[];
}

const EMPTY_FORM: FormState = {
  name: '',
  code: '',
  description: '',
  is_active: true,
  materials: [{ material: '', quantity_per_unit: '', note: '' }],
};

export default function PcbPlanPanel() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  const plansQuery = usePcbPlans({
    enabled: true,
    page,
    pageSize: PAGE_SIZE,
    filters: includeInactive ? {} : { is_active: true },
  });

  // 原材料下拉源：仅 RAW_MATERIAL 类目
  const productsQuery = useProducts({ enabled: true, pageSize: 500 });
  const rawMaterials = useMemo(
    () => productsQuery.data.filter((p) => p.category_detail?.category_type === 'RAW_MATERIAL'),
    [productsQuery.data],
  );

  // 模态框 + 表单
  const [modal, setModal] = useState<{ open: boolean; mode: 'create' | 'edit'; planId: number | null }>({
    open: false, mode: 'create', planId: null,
  });
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  // 客户端搜索过滤（小数据集即可，避免每次输都打后端）
  const visiblePlans = useMemo(() => {
    if (!search.trim()) return plansQuery.data;
    const kw = search.trim().toLowerCase();
    return plansQuery.data.filter(
      (p) => p.name.toLowerCase().includes(kw) || p.code.toLowerCase().includes(kw),
    );
  }, [plansQuery.data, search]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setModal({ open: true, mode: 'create', planId: null });
  };

  const openEdit = (plan: PcbPlanResponse) => {
    setForm({
      name: plan.name,
      code: plan.code,
      description: plan.description,
      is_active: plan.is_active,
      materials: plan.materials.length
        ? plan.materials.map((m) => ({
            material: String(m.material),
            quantity_per_unit: String(m.quantity_per_unit),
            note: m.note || '',
          }))
        : [{ material: '', quantity_per_unit: '', note: '' }],
    });
    setModal({ open: true, mode: 'edit', planId: plan.id });
  };

  const addMaterialRow = () => {
    setForm((prev) => ({
      ...prev,
      materials: [...prev.materials, { material: '', quantity_per_unit: '', note: '' }],
    }));
  };

  const removeMaterialRow = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      materials: prev.materials.filter((_, i) => i !== idx),
    }));
  };

  const updateMaterial = (idx: number, patch: Partial<MaterialDraft>) => {
    setForm((prev) => ({
      ...prev,
      materials: prev.materials.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      alert('方案名称不能为空');
      return;
    }
    const validMaterials = form.materials.filter(
      (m) => m.material && Number(m.quantity_per_unit) > 0,
    );
    // 没有 materials 也允许保存（占位方案）；后端会接受空列表
    try {
      setIsSaving(true);
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        description: form.description.trim() || undefined,
        is_active: form.is_active,
        materials: validMaterials.map((m) => ({
          material: Number(m.material),
          quantity_per_unit: Number(m.quantity_per_unit),
          note: m.note.trim() || undefined,
        })),
      };
      if (modal.mode === 'create') {
        await api.createPcbPlan(payload);
      } else {
        await api.updatePcbPlan(modal.planId!, payload);
      }
      setModal({ open: false, mode: 'create', planId: null });
      plansQuery.reload();
    } catch (err: any) {
      alert(`保存失败: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (plan: PcbPlanResponse) => {
    const verb = plan.is_active ? '下架' : '启用';
    if (!window.confirm(`确定要${verb}方案「${plan.name}」吗？`)) return;
    try {
      // **不传 materials**——避免误清空配方
      await api.updatePcbPlan(plan.id, { is_active: !plan.is_active });
      plansQuery.reload();
    } catch (err: any) {
      alert(`${verb}失败: ${err.message}`);
    }
  };

  // 原材料展示助手：从 productsQuery 找回物料名
  const fmtMaterial = (materialId: number) => {
    const p = productsQuery.data.find((x) => x.id === materialId);
    if (!p) return `#${materialId}`;
    return `${p.model_name}（${p.internal_code}）`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* 标题区 */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">PCB 方案</h2>
          <p className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-widest">PCB Plans · BOM Recipes</p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-full bg-slate-900 px-6 py-2 text-sm font-bold text-white shadow-lg active:scale-95 transition-all"
        >
          + 新建方案
        </button>
      </div>

      {/* 筛选区 */}
      <FilterBar
        actions={
          <NavbarButton variant="outline" className="text-xs" onClick={() => { setSearch(''); setIncludeInactive(false); }}>
            重置
          </NavbarButton>
        }
      >
        <FilterBar.Field label="名称 / 编号">
          <input
            className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm outline-none focus:border-slate-900"
            placeholder="输入名称或方案编号..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </FilterBar.Field>
        <FilterBar.Field label="包含已下架">
          <select
            className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm bg-white outline-none focus:border-slate-900"
            value={includeInactive ? 'all' : 'active'}
            onChange={(e) => { setIncludeInactive(e.target.value === 'all'); setPage(1); }}
          >
            <option value="active">仅启用中</option>
            <option value="all">全部</option>
          </select>
        </FilterBar.Field>
      </FilterBar>

      {/* 列表 */}
      {plansQuery.loading ? (
        <div className="text-center py-10 text-slate-400">加载中...</div>
      ) : plansQuery.error ? (
        <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl text-sm">⚠️ {plansQuery.error}</div>
      ) : visiblePlans.length === 0 ? (
        <div className="text-center py-10 border-2 border-dashed border-slate-100 rounded-3xl text-slate-400">
          暂无方案
        </div>
      ) : (
        <div className="space-y-3">
          {visiblePlans.map((plan) => (
            <div
              key={plan.id}
              className={`bg-white rounded-3xl border p-5 shadow-sm transition-all ${
                plan.is_active ? 'border-slate-100 hover:shadow-md' : 'border-slate-200 opacity-60'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-slate-900">
                    {plan.name}
                    {plan.code ? <span className="text-slate-400 font-mono ml-2 text-xs">({plan.code})</span> : null}
                    {!plan.is_active && <span className="ml-2 text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500">已下架</span>}
                  </h3>
                  {plan.description && <p className="text-xs text-slate-500 mt-1">{plan.description}</p>}
                </div>
                <div className="flex gap-2">
                  <NavbarButton variant="outline" className="text-[10px] py-1 px-3" onClick={() => openEdit(plan)}>
                    编辑
                  </NavbarButton>
                  <NavbarButton variant="outline" className="text-[10px] py-1 px-3" onClick={() => toggleActive(plan)}>
                    {plan.is_active ? '下架' : '启用'}
                  </NavbarButton>
                </div>
              </div>

              {/* 物料配方展开 */}
              {plan.materials.length === 0 ? (
                <p className="text-xs text-slate-400 italic">未配置物料</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-[12px]">
                  {plan.materials.map((m) => (
                    <div key={m.id} className="bg-slate-50 rounded-xl px-3 py-2">
                      <span className="font-medium">{m.material_detail?.model_name ?? fmtMaterial(m.material)}</span>
                      <span className="text-slate-400 ml-2">× {m.quantity_per_unit}</span>
                      {m.note && <span className="block text-[10px] text-slate-400 italic mt-1">{m.note}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={plansQuery.pagination?.totalCount ?? plansQuery.data.length}
        onPageChange={setPage}
      />

      {/* 编辑/创建模态框 */}
      <Modal
        open={modal.open}
        onClose={() => setModal({ ...modal, open: false })}
        title={modal.mode === 'create' ? '新建 PCB 方案' : '编辑 PCB 方案'}
        maxWidth="max-w-3xl"
        footer={
          <NavbarButton disabled={isSaving} onClick={handleSubmit} className="px-10">
            {isSaving ? '保存中...' : '保存方案'}
          </NavbarButton>
        }
      >
        <div className="space-y-5 py-2">
          {/* 基本信息 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 block">方案名称*</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900/5 outline-none"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例：M1 控制板 v1"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 block">方案编号</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900/5 outline-none"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="可选"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 block">说明</label>
            <textarea
              rows={2}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-slate-900/5 outline-none"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="可选，用于说明这个方案的特殊之处"
            />
          </div>

          {/* 物料配方表 */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-sm font-bold uppercase tracking-widest text-slate-400">物料配方</h4>
              <button
                type="button"
                onClick={addMaterialRow}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                + 添加物料行
              </button>
            </div>
            {form.materials.length === 0 ? (
              <p className="text-xs text-slate-400 italic">未配置物料（可后续追加）</p>
            ) : (
              <div className="space-y-2">
                {form.materials.map((m, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-6">
                      <select
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none focus:border-slate-900"
                        value={m.material}
                        onChange={(e) => updateMaterial(idx, { material: e.target.value })}
                      >
                        <option value="">{rawMaterials.length ? '选择原材料' : '尚无 RAW_MATERIAL 物料'}</option>
                        {rawMaterials.map((p: ProductResponse) => (
                          <option key={p.id} value={p.id}>{p.model_name}（{p.internal_code}）</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        placeholder="单板用量"
                        value={m.quantity_per_unit}
                        onChange={(e) => updateMaterial(idx, { quantity_per_unit: e.target.value })}
                      />
                    </div>
                    <div className="col-span-3">
                      <input
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        placeholder="备注（可选）"
                        value={m.note}
                        onChange={(e) => updateMaterial(idx, { note: e.target.value })}
                      />
                    </div>
                    <div className="col-span-1">
                      <button
                        onClick={() => removeMaterialRow(idx)}
                        className="w-full bg-rose-500 text-white rounded-full py-2 text-xs hover:scale-105 transition-transform"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-slate-400 mt-2 italic">
              提示：编辑方案时，提交后会**全量替换**物料列表（删旧建新）。如果只想改基本信息（名称/启用状态），不要触发添加/删除物料行。
            </p>
          </div>

          {/* 启用状态 */}
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300"
            />
            <span>启用中（下架后历史订单仍保留引用，但新订单选不到）</span>
          </label>
        </div>
      </Modal>
    </div>
  );
}
