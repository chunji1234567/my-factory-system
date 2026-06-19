import { useState, useMemo } from 'react';
import { api } from '../../api/client';
import { toast } from '../../utils/toast';
import { usePcbPlans, PcbPlanResponse } from '../../hooks/usePcbPlans';
import { useProducts } from '../../hooks/useProducts';
import Modal from '../common/Modal';
import Pagination from '../common/Pagination';
import {
  Card,
  PageHeader,
  Section,
  Pill,
  ActionBar,
  SearchableSelect,
  ModalFooterButtons,
  ConfirmDialog,
} from '../primitives';

/**
 * PCB 方案管理面板（manager only，BOM-2.0，Stage C-10 redesign 2026-06-18）。
 *
 * 业务模型（详见 docs/PRD.md §3.2 §4.5 §9.4 changelog 2026-05-21）：
 *   - 方案 = 一种 PCB 板的物料配方；销售明细挂方案，排产时按方案展开扣减原材料
 *   - is_active 软删除——下架后历史排产仍能引用，但新订单选不到
 *
 * 改造要点（详见 docs/ux-audit.md §2.10）：
 *   1. PageHeader 替换自造 h2 + 英文副标题
 *   2. 筛选改 Pill toggle（仅启用中 / 包含已下架）
 *   3. 方案卡：默认折叠物料（显示 "10 种 ▾"），点击展开 Pill 网格
 *   4. 编辑 Modal 用 Section 分段；物料下拉换 SearchableSelect（原材料数量大）
 *   5. 物料行改 Card tone="subtle"，删除按钮统一 design tokens
 *   6. 删掉"全量替换"提示——后端实现细节不该泄露给用户
 */

const PAGE_SIZE = 20;

interface MaterialDraft {
  material: string; // Product ID（字符串以适配 SearchableSelect）
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

const FIELD_LABEL_CLS = 'text-micro font-bold text-ink-faint uppercase tracking-wider ml-0.5';
const INPUT_CLS =
  'w-full rounded-input border border-line bg-surface px-3 py-2 text-body outline-none ' +
  'focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors';

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
    () =>
      productsQuery.data.filter(
        (p) => p.category_detail?.category_type === 'RAW_MATERIAL',
      ),
    [productsQuery.data],
  );
  const rawMaterialOptions = useMemo(
    () =>
      rawMaterials.map((p) => ({
        value: String(p.id),
        label: `${p.model_name} (${p.internal_code})`,
      })),
    [rawMaterials],
  );

  // 模态框 + 表单
  const [modal, setModal] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    planId: number | null;
  }>({ open: false, mode: 'create', planId: null });
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  // 卡片展开状态：planId → 是否展开物料
  const [expandedPlans, setExpandedPlans] = useState<Set<number>>(new Set());
  const toggleExpand = (planId: number) => {
    setExpandedPlans((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  };

  // 客户端搜索过滤
  const visiblePlans = useMemo(() => {
    if (!search.trim()) return plansQuery.data;
    const kw = search.trim().toLowerCase();
    return plansQuery.data.filter(
      (p) =>
        p.name.toLowerCase().includes(kw) || p.code.toLowerCase().includes(kw),
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
      toast.warning('方案名称不能为空');
      return;
    }
    const validMaterials = form.materials.filter(
      (m) => m.material && Number(m.quantity_per_unit) > 0,
    );
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
      toast.error(`保存失败：${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // 启用/下架方案确认（2026-06-19 替代 window.confirm，详见 §9.4 changelog）。
  const [toggleConfirm, setToggleConfirm] = useState<{ plan: PcbPlanResponse | null }>({
    plan: null,
  });
  const [toggleWorking, setToggleWorking] = useState(false);

  const openToggleConfirm = (plan: PcbPlanResponse) => setToggleConfirm({ plan });

  const handleToggleConfirm = async () => {
    const plan = toggleConfirm.plan;
    if (!plan) return;
    const verb = plan.is_active ? '下架' : '启用';
    try {
      setToggleWorking(true);
      await api.updatePcbPlan(plan.id, { is_active: !plan.is_active });
      setToggleConfirm({ plan: null });
      toast.success(`已${verb}方案「${plan.name}」`);
      plansQuery.reload();
    } catch (err: any) {
      toast.error(`${verb}失败：${err.message}`);
    } finally {
      setToggleWorking(false);
    }
  };

  // 物料名解析（嵌套 material_detail 缺失时回退到 productsQuery）
  const fmtMaterial = (materialId: number) => {
    const p = productsQuery.data.find((x) => x.id === materialId);
    if (!p) return `#${materialId}`;
    return `${p.model_name} (${p.internal_code})`;
  };

  return (
    <div className="space-y-section-gap animate-in fade-in duration-500 pb-20">
      <PageHeader
        title="PCB 方案"
        description="维护 PCB 方案配方（排产时按方案展开扣减原材料）"
        actions={
          <button
            onClick={openCreate}
            className="rounded-pill bg-primary text-on-primary px-5 py-2 text-caption font-bold
                       hover:bg-primary-hover active:scale-95 transition-all shadow-card"
          >
            + 新建方案
          </button>
        }
      />

      {/* 筛选区 */}
      <Card flat tone="subtle" padding="tight">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex-1 max-w-md">
            <input
              className={INPUT_CLS}
              placeholder="按名称 / 方案编号搜索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setIncludeInactive(false);
                setPage(1);
              }}
              className={`px-3 py-1 rounded-pill text-caption font-bold transition-colors ${
                !includeInactive
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface text-ink-body border border-line hover:border-line-focus'
              }`}
            >
              仅启用中
            </button>
            <button
              type="button"
              onClick={() => {
                setIncludeInactive(true);
                setPage(1);
              }}
              className={`px-3 py-1 rounded-pill text-caption font-bold transition-colors ${
                includeInactive
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface text-ink-body border border-line hover:border-line-focus'
              }`}
            >
              包含已下架
            </button>
            {(search || includeInactive) && (
              <button
                onClick={() => {
                  setSearch('');
                  setIncludeInactive(false);
                  setPage(1);
                }}
                className="ml-2 text-micro text-ink-faint hover:text-ink-body underline"
              >
                重置
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* 列表 */}
      {plansQuery.loading ? (
        <Card>
          <p className="text-center text-caption text-ink-faint py-8">加载中...</p>
        </Card>
      ) : plansQuery.error ? (
        <Card tone="danger" padding="tight">
          <p className="text-caption text-danger-ink">⚠ {plansQuery.error}</p>
        </Card>
      ) : visiblePlans.length === 0 ? (
        <Card>
          <p className="text-center text-caption text-ink-faint py-10">
            {search || includeInactive ? '没有匹配的方案' : '暂无方案'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {visiblePlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              expanded={expandedPlans.has(plan.id)}
              onToggleExpand={() => toggleExpand(plan.id)}
              onEdit={() => openEdit(plan)}
              onToggleActive={() => openToggleConfirm(plan)}
              fmtMaterial={fmtMaterial}
            />
          ))}
        </div>
      )}

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={plansQuery.pagination?.totalCount ?? plansQuery.data.length}
        onPageChange={setPage}
      />

      {/* 编辑/创建 Modal */}
      <Modal
        open={modal.open}
        onClose={() => setModal({ ...modal, open: false })}
        title={modal.mode === 'create' ? '新建 PCB 方案' : '编辑 PCB 方案'}
        maxWidth="max-w-3xl"
        footer={
          <ModalFooterButtons
            onCancel={() => setModal({ ...modal, open: false })}
            onSubmit={handleSubmit}
            isSaving={isSaving}
            submitDisabled={!form.name.trim()}
            submitLabel="保存方案"
            savingLabel="保存中..."
          />
        }
      >
        <div className="space-y-section-gap">
          {/* 基础信息 */}
          <Section title="① 基础信息">
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2 space-y-1">
                  <span className={FIELD_LABEL_CLS}>方案名称*</span>
                  <input
                    className={INPUT_CLS}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="例：M1 控制板 v1"
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  <span className={FIELD_LABEL_CLS}>方案编号</span>
                  <input
                    className={`${INPUT_CLS} font-mono`}
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="可选"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <span className={FIELD_LABEL_CLS}>说明（可选）</span>
                <textarea
                  rows={2}
                  className={`${INPUT_CLS} resize-none`}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="用于说明这个方案的特殊之处"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-caption text-ink-body">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4 rounded border-line text-primary focus:ring-primary/20"
                />
                <span>
                  启用中（下架后历史订单仍保留引用，但新订单选不到）
                </span>
              </label>
            </div>
          </Section>

          {/* 物料配方 */}
          <Section
            title={`② 物料配方（${form.materials.length} 条）`}
            action={
              <ActionBar align="end">
                <ActionBar.GhostButton onClick={addMaterialRow}>
                  + 添加物料
                </ActionBar.GhostButton>
              </ActionBar>
            }
          >
            {form.materials.length === 0 ? (
              <Card flat tone="subtle" padding="tight">
                <p className="text-center text-caption text-ink-faint py-6">
                  还未配置物料，点右上方"+ 添加物料"开始
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {form.materials.map((m, idx) => (
                  <MaterialEditRow
                    key={idx}
                    draft={m}
                    index={idx}
                    options={rawMaterialOptions}
                    onChange={(patch) => updateMaterial(idx, patch)}
                    onRemove={() => removeMaterialRow(idx)}
                  />
                ))}
              </div>
            )}
          </Section>
        </div>
      </Modal>

      {/* 启用/下架确认（2026-06-19 替代 window.confirm，详见 §9.4 changelog） */}
      <ConfirmDialog
        open={Boolean(toggleConfirm.plan)}
        onClose={() => !toggleWorking && setToggleConfirm({ plan: null })}
        onConfirm={handleToggleConfirm}
        isWorking={toggleWorking}
        title={toggleConfirm.plan?.is_active ? '下架 PCB 方案' : '启用 PCB 方案'}
        confirmLabel={toggleConfirm.plan?.is_active ? '确认下架' : '确认启用'}
        message={
          toggleConfirm.plan ? (
            <p>
              确认{toggleConfirm.plan.is_active ? '下架' : '启用'}方案
              <strong className="text-ink">「{toggleConfirm.plan.name}」</strong>？
              {toggleConfirm.plan.is_active && (
                <>
                  <br /><span className="text-ink-faint">
                    下架后不可被新销售明细选中，历史订单仍保留引用。
                  </span>
                </>
              )}
            </p>
          ) : null
        }
      />
    </div>
  );
}

// ============================================================================
// 方案卡
// ============================================================================

interface PlanCardProps {
  plan: PcbPlanResponse;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  fmtMaterial: (id: number) => string;
}

function PlanCard({
  plan,
  expanded,
  onToggleExpand,
  onEdit,
  onToggleActive,
  fmtMaterial,
}: PlanCardProps) {
  const hasMaterials = plan.materials.length > 0;
  return (
    <Card tone={plan.is_active ? 'default' : 'subtle'} className={!plan.is_active ? 'opacity-70' : ''}>
      {/* 头部：名字 + 编号 + 状态 + 操作 */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-subheading text-ink">{plan.name}</p>
            {plan.code && (
              <span className="text-micro font-mono text-ink-faint">({plan.code})</span>
            )}
            <Pill tone={plan.is_active ? 'success' : 'muted'}>
              {plan.is_active ? '启用中' : '已下架'}
            </Pill>
          </div>
          {plan.description && (
            <p className="text-caption text-ink-muted mt-1">{plan.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onEdit}
            className="rounded-pill border border-line-strong text-ink-body px-3 py-1 text-micro font-bold
                       hover:bg-surface-subtle hover:border-line-focus transition-all"
          >
            编辑
          </button>
          <button
            onClick={onToggleActive}
            className="rounded-pill border border-line-strong text-ink-body px-3 py-1 text-micro font-bold
                       hover:bg-surface-subtle hover:border-line-focus transition-all"
          >
            {plan.is_active ? '下架' : '启用'}
          </button>
        </div>
      </div>

      {/* 物料折叠 / 展开 */}
      <div className="mt-4 pt-3 border-t border-line">
        {!hasMaterials ? (
          <p className="text-caption text-ink-faint italic">未配置物料</p>
        ) : (
          <>
            <button
              type="button"
              onClick={onToggleExpand}
              className="flex items-center gap-2 text-caption text-ink-body hover:text-primary transition-colors"
            >
              <span className="font-bold">{plan.materials.length} 种物料</span>
              <span className="text-ink-faint">{expanded ? '▴ 收起' : '▾ 展开查看'}</span>
            </button>
            {expanded && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {plan.materials.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-input bg-surface-subtle px-3 py-2 text-caption"
                  >
                    <p className="font-bold text-ink truncate" title={m.material_detail?.model_name ?? fmtMaterial(m.material)}>
                      {m.material_detail?.model_name ?? fmtMaterial(m.material)}
                    </p>
                    <p className="text-micro text-ink-faint font-mono mt-0.5">
                      × {m.quantity_per_unit}
                    </p>
                    {m.note && (
                      <p className="text-micro text-ink-muted italic mt-1">{m.note}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

// ============================================================================
// 物料编辑行（Modal 内）
// ============================================================================

interface MaterialEditRowProps {
  draft: MaterialDraft;
  index: number;
  options: { value: string; label: string }[];
  onChange: (patch: Partial<MaterialDraft>) => void;
  onRemove: () => void;
}

function MaterialEditRow({ draft, index, options, onChange, onRemove }: MaterialEditRowProps) {
  return (
    <Card tone="subtle" padding="tight">
      <div className="flex items-center justify-between mb-2">
        <span className="text-micro font-mono text-ink-faint">#{index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-micro font-bold text-ink-faint hover:text-danger transition-colors px-2 py-1"
        >
          删除
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)] gap-2">
        <div className="space-y-1">
          <span className={FIELD_LABEL_CLS}>原材料</span>
          <SearchableSelect
            options={options}
            value={draft.material}
            onChange={(v) => onChange({ material: v })}
            placeholder={options.length ? '请选择原材料（可搜索）' : '尚无原材料'}
            disabled={!options.length}
          />
        </div>
        <div className="space-y-1">
          <span className={FIELD_LABEL_CLS}>单板用量</span>
          <input
            type="number"
            min="0"
            step="0.01"
            className={`${INPUT_CLS} font-mono text-right`}
            value={draft.quantity_per_unit}
            onChange={(e) => onChange({ quantity_per_unit: e.target.value })}
            placeholder="例：2"
          />
        </div>
        <div className="space-y-1">
          <span className={FIELD_LABEL_CLS}>备注（可选）</span>
          <input
            className={INPUT_CLS}
            value={draft.note}
            onChange={(e) => onChange({ note: e.target.value })}
            placeholder="例：贴片正面"
          />
        </div>
      </div>
    </Card>
  );
}
