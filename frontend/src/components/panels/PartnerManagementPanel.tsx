import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type { PartnerResponse } from '../../hooks/usePartners';
import Modal from '../common/Modal';
import Pagination from '../common/Pagination';
import {
  Card,
  PageHeader,
  Pill,
  StatusPillFilterRow,
  ModalFooterButtons,
} from '../primitives';
import { formatMoney } from '../../utils/money';
import { PartnerDetail } from './partners/PartnerDetail';

/**
 * 合作方与结算（Stage C-8 redesign，2026-06-18）。
 *
 * 2026-06-18 架构调整：旧 FinanceDetailPanel 已合并进来——所有"转账流水"都
 * 隶属于某个合作方，没必要单独面板。详情页"转账流水"标签直接做 CRUD（详见
 * partners/PartnerDetail.tsx）。台账导出改成"导出 YYYY 年台账"（按年）。
 *
 * 改造要点（详见 docs/ux-audit.md §2.8 + §2.9）：
 *   - PageHeader 替换自造 h2 + 副标题；右侧 actions=[+ 新建合作方]
 *   - 类型筛选改 StatusPillFilterRow（全部 / 客户 / 供应商 / 全能）
 *   - 列表行用 Card 风格（合作方名 + ID + Pill 类型 + 余额，点击进入详情）
 *   - 余额走 formatMoney（千分位 + 无空格 + 不混 ¥0.00 与脱敏 null）
 *   - 详情视图整体由 PartnerDetail 承载，与原 PartnerDetailContainer + ...View 等价合并
 */

const PAGE_SIZE = 20;

const TYPE_FILTERS = [
  { value: 'CUSTOMER', label: '客户' },
  { value: 'SUPPLIER', label: '供应商' },
  { value: 'BOTH', label: '全能' },
] as const;

interface Props {
  partners: PartnerResponse[];
  loading: boolean;
  error: string | null;
  onRefresh(): Promise<void> | void;
}

export default function PartnerManagementPanel({
  partners = [],
  loading,
  error,
  onRefresh,
}: Props) {
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);

  // 详情视图
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null);
  const selectedPartner = useMemo(
    () => partners.find((p) => p.id === selectedPartnerId) ?? null,
    [partners, selectedPartnerId],
  );

  // 新建 Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<string>('CUSTOMER');
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [typeFilter, keyword]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    let result = typeFilter
      ? partners.filter((p) => p.partner_type === typeFilter)
      : partners;
    if (kw) {
      result = result.filter(
        (p) => p.name.toLowerCase().includes(kw) || String(p.id).includes(kw),
      );
    }
    // 余额绝对值大的排前面——大客户/大供应商优先
    return [...result].sort(
      (a, b) => Math.abs(Number(b.balance)) - Math.abs(Number(a.balance)),
    );
  }, [partners, typeFilter, keyword]);

  const pagedPartners = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const resetFilters = () => {
    setTypeFilter('');
    setKeyword('');
    setPage(1);
  };

  // --- 新建合作方 ---
  const handleCreate = async () => {
    if (!newName.trim()) {
      setCreateError('请输入合作方名称');
      return;
    }
    try {
      setSubmitting(true);
      setCreateError(null);
      await api.createPartner({ name: newName.trim(), partner_type: newType });
      setNewName('');
      setNewType('CUSTOMER');
      setCreateOpen(false);
      await onRefresh();
    } catch (err: any) {
      setCreateError(err?.message ?? '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  // --- 详情视图 ---
  if (selectedPartner) {
    return (
      <div className="space-y-section-gap animate-in fade-in duration-300 pb-20">
        <PartnerDetail
          partner={selectedPartner}
          onBack={() => setSelectedPartnerId(null)}
          onPartnerRefresh={onRefresh as () => void}
        />
      </div>
    );
  }

  // --- 列表视图 ---
  return (
    <div className="space-y-section-gap animate-in fade-in duration-500 pb-20">
      <PageHeader
        title="合作方与结算"
        description="管理客户/供应商账户、查看余额并登记往来流水"
        actions={
          <button
            onClick={() => setCreateOpen(true)}
            className="rounded-pill bg-primary text-on-primary px-5 py-2 text-caption font-bold
                       hover:bg-primary-hover active:scale-95 transition-all shadow-card"
          >
            + 新建合作方
          </button>
        }
      />

      {/* 筛选区 */}
      <Card flat tone="subtle" padding="tight">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex-1 max-w-md">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="按名称或 #ID 搜索..."
              className="w-full rounded-input border border-line bg-surface px-4 py-2 text-body outline-none
                         focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors"
            />
          </div>
          <StatusPillFilterRow
            options={TYPE_FILTERS}
            value={typeFilter}
            onChange={setTypeFilter}
            onReset={typeFilter || keyword ? resetFilters : undefined}
          />
        </div>
      </Card>

      {/* 列表 */}
      {error && (
        <Card tone="danger" padding="tight">
          <p className="text-caption text-danger-ink">⚠ {error}</p>
        </Card>
      )}

      {loading && !error && (
        <Card>
          <p className="text-center text-caption text-ink-faint py-8">加载中...</p>
        </Card>
      )}

      {!loading && !error && filtered.length === 0 && (
        <Card>
          <p className="text-center text-caption text-ink-faint py-10">
            {keyword || typeFilter ? '没有匹配的合作方' : '暂无合作方'}
          </p>
        </Card>
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <Card padding="none">
            <div className="hidden md:grid grid-cols-[minmax(0,1fr)_6rem_10rem] gap-3 px-5 py-2.5 border-b border-line text-micro font-bold text-ink-faint uppercase tracking-wider bg-surface-subtle/40">
              <span>合作方</span>
              <span>属性</span>
              <span className="text-right">余额</span>
            </div>
            <div className="divide-y divide-line">
              {pagedPartners.map((p) => (
                <PartnerRow
                  key={p.id}
                  partner={p}
                  onSelect={() => setSelectedPartnerId(p.id)}
                />
              ))}
            </div>
          </Card>
          <Pagination
            page={page}
            total={filtered.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}

      {/* 新建合作方 Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建合作方"
        maxWidth="max-w-md"
        footer={
          <ModalFooterButtons
            onCancel={() => setCreateOpen(false)}
            onSubmit={handleCreate}
            isSaving={submitting}
            submitDisabled={!newName.trim()}
            submitLabel="创建合作方"
            savingLabel="提交中..."
          />
        }
      >
        <div className="space-y-section-gap">
          <div className="space-y-1">
            <span className="text-micro font-bold text-ink-faint uppercase tracking-wider ml-0.5">
              合作方名称
            </span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例：上海春丰农业有限公司"
              autoFocus
              className="w-full rounded-input border border-line bg-surface px-3 py-2 text-body outline-none
                         focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors"
            />
          </div>
          <div className="space-y-1">
            <span className="text-micro font-bold text-ink-faint uppercase tracking-wider ml-0.5">
              业务类型
            </span>
            <div className="flex flex-wrap gap-2">
              {TYPE_FILTERS.map((opt) => {
                const active = newType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setNewType(opt.value)}
                    className={`px-4 py-1.5 rounded-pill text-caption font-bold transition-colors ${
                      active
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface text-ink-body border border-line hover:border-line-focus'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          {createError && (
            <Card tone="danger" padding="tight" flat>
              <p className="text-caption text-danger-ink">⚠ {createError}</p>
            </Card>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ============================================================================
// 合作方行
// ============================================================================

interface PartnerRowProps {
  partner: PartnerResponse;
  onSelect: () => void;
}

function PartnerRow({ partner, onSelect }: PartnerRowProps) {
  const balance = Number(partner.balance);
  const typeLabel =
    partner.partner_type === 'CUSTOMER'
      ? '客户'
      : partner.partner_type === 'SUPPLIER'
      ? '供应商'
      : partner.partner_type === 'BOTH'
      ? '全能'
      : partner.partner_type;
  const typeTone: 'default' | 'accent' | 'success' | 'warning' =
    partner.partner_type === 'CUSTOMER'
      ? 'accent'
      : partner.partner_type === 'SUPPLIER'
      ? 'warning'
      : partner.partner_type === 'BOTH'
      ? 'success'
      : 'default';

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left grid grid-cols-2 md:grid-cols-[minmax(0,1fr)_6rem_10rem] gap-x-3 gap-y-1 px-5 py-3
                 hover:bg-surface-subtle/40 transition-colors items-center"
    >
      <div className="col-span-2 md:col-span-1 min-w-0">
        <p className="text-body font-bold text-ink truncate">{partner.name}</p>
        <p className="text-micro font-mono text-ink-faint mt-0.5">#{partner.id}</p>
      </div>
      <div className="md:text-left">
        <Pill tone={typeTone} outline>
          {typeLabel}
        </Pill>
      </div>
      <div className="md:text-right">
        <span
          className={`font-mono font-bold ${
            balance >= 0 ? 'text-success' : 'text-danger'
          }`}
        >
          {formatMoney(balance)}
        </span>
      </div>
    </button>
  );
}
