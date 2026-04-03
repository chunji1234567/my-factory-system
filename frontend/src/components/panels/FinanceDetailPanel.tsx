import { FormEvent, useMemo, useState } from 'react';
import { useFinanceTransactions, FinanceTransactionType } from '../../hooks/useFinanceTransactions';
import { usePartners } from '../../hooks/usePartners';
import { api } from '../../api/client';
import NavbarButton from '../common/NavbarButton';
import FilterBar from '../common/FilterBar';

function formatPartnerDisplay(partnerId: number, partnerName?: string | null) {
  if (partnerName) {
    return `${partnerName} (#${partnerId})`;
  }
  return `#${partnerId}`;
}

const TRANSACTION_TYPE_OPTIONS: Array<{ value: FinanceTransactionType; label: string }> = [
  { value: 'RECEIPT', label: '收款（应收减少）' },
  { value: 'PAYMENT', label: '付款（应付减少）' },
  { value: 'ADJUST', label: '调整' },
];
const TRANSACTION_TYPE_LABELS: Record<FinanceTransactionType, string> = {
  RECEIPT: '收款',
  PAYMENT: '付款',
  ADJUST: '调整',
};

export default function FinanceDetailPanel() {
  const transactionsQuery = useFinanceTransactions(true);
  const partnersQuery = usePartners(true);
  const partnerOptions = partnersQuery.data;

  const [filterPartnerInput, setFilterPartnerInput] = useState('');
  const [filterPartnerId, setFilterPartnerId] = useState<number | null>(null);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createPartnerInput, setCreatePartnerInput] = useState('');
  const [createAmount, setCreateAmount] = useState('');
  const [createType, setCreateType] = useState<FinanceTransactionType>('RECEIPT');
  const [createNote, setCreateNote] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setCreateType('RECEIPT');
  };

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPartnerInput, setEditPartnerInput] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editType, setEditType] = useState<FinanceTransactionType>('RECEIPT');
  const [editNote, setEditNote] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const getPartnerSuggestions = (keyword: string) => {
    const normalized = keyword.trim().toLowerCase();
    return partnerOptions
      .filter((partner) => {
        if (!normalized) return true;
        return (
          partner.name.toLowerCase().includes(normalized) ||
          String(partner.id).includes(normalized)
        );
      })
      .slice(0, 50)
      .map((partner) => formatPartnerDisplay(partner.id, partner.name));
  };

  const filterPartnerSuggestions = useMemo(
    () => getPartnerSuggestions(filterPartnerInput),
    [filterPartnerInput, partnerOptions],
  );
  const createPartnerSuggestions = useMemo(
    () => getPartnerSuggestions(createPartnerInput),
    [createPartnerInput, partnerOptions],
  );
  const editPartnerSuggestions = useMemo(
    () => getPartnerSuggestions(editPartnerInput),
    [editPartnerInput, partnerOptions],
  );

  const resolvePartnerId = (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const id = Number(trimmed);
      return partnerOptions.find((partner) => partner.id === id) ? id : null;
    }
    const match = trimmed.match(/#(\d+)/);
    if (match) {
      const id = Number(match[1]);
      return partnerOptions.find((partner) => partner.id === id) ? id : null;
    }
    const exactMatches = partnerOptions.filter(
      (partner) => partner.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exactMatches.length === 1) {
      return exactMatches[0].id;
    }
    return null;
  };

  const filteredTransactions = useMemo(() => {
    return transactionsQuery.data.filter((txn) => {
      if (filterPartnerId && txn.partner !== filterPartnerId) {
        return false;
      }
      if (filterDateFrom && new Date(txn.created_at) < new Date(filterDateFrom)) {
        return false;
      }
      if (filterDateTo && new Date(txn.created_at) > new Date(filterDateTo)) {
        return false;
      }
      return true;
    });
  }, [transactionsQuery.data, filterPartnerId, filterDateFrom, filterDateTo]);

  const resetEditState = () => {
    setEditingId(null);
    setEditPartnerInput('');
    setEditAmount('');
    setEditType('RECEIPT');
    setEditNote('');
    setEditError(null);
    setEditSuccess(null);
  };

  const startEdit = (id: number) => {
    const txn = transactionsQuery.data.find((item) => item.id === id);
    if (!txn) return;
    setEditingId(id);
    setEditPartnerInput(formatPartnerDisplay(txn.partner, txn.partner_name));
    const displayAmount = txn.transaction_type === 'ADJUST' ? txn.amount : Math.abs(txn.amount);
    setEditAmount(String(displayAmount));
    setEditType(txn.transaction_type);
    setEditNote(txn.note ?? '');
    setEditError(null);
    setEditSuccess(null);
  };

  const handleCreate = async (evt: FormEvent) => {
    evt.preventDefault();
    const partnerId = resolvePartnerId(createPartnerInput);
    if (!partnerId) {
      setCreateError('请输入有效的合作方（可输入名称或 ID 并从下拉建议中选择）');
      return;
    }
    const amountNumber = Number(createAmount);
    if (!amountNumber) {
      setCreateError('请输入金额');
      return;
    }
    const normalizedAmount =
      createType === 'ADJUST' ? amountNumber : Math.abs(amountNumber);
    try {
      setIsCreating(true);
      setCreateError(null);
      setCreateSuccess(null);
      await api.createFinanceTransaction({
        partner: partnerId,
        amount: normalizedAmount,
        transaction_type: createType,
        note: createNote || undefined,
      });
      setCreateSuccess('流水已创建');
      setCreatePartnerInput('');
      setCreateAmount('');
      setCreateType('RECEIPT');
      setCreateNote('');
      setIsCreateModalOpen(false);
      await transactionsQuery.reload();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdate = async (evt: FormEvent) => {
    evt.preventDefault();
    if (!editingId) return;
    const partnerId = resolvePartnerId(editPartnerInput);
    if (!partnerId) {
      setEditError('请输入有效的合作方');
      return;
    }
    const amountNumber = Number(editAmount);
    if (!amountNumber) {
      setEditError('请输入金额');
      return;
    }
    const normalizedAmount = editType === 'ADJUST' ? amountNumber : Math.abs(amountNumber);
    try {
      setEditSaving(true);
      setEditError(null);
      setEditSuccess(null);
      await api.updateFinanceTransaction(editingId, {
        partner: partnerId,
        amount: normalizedAmount,
        transaction_type: editType,
        note: editNote || undefined,
      });
      setEditSuccess('流水已更新');
      resetEditState();
      await transactionsQuery.reload();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : '更新失败');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确认删除该财务流水？操作不可撤销。')) {
      return;
    }
    try {
      await api.deleteFinanceTransaction(id);
      if (editingId === id) {
        resetEditState();
      }
      await transactionsQuery.reload();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleFilterPartnerInputChange = (value: string) => {
    setFilterPartnerInput(value);
    const resolved = resolvePartnerId(value);
    setFilterPartnerId(resolved);
  };

  return (
    <div className="mt-8 space-y-6">
      {(transactionsQuery.error || partnersQuery.error) && (
        <p className="text-sm text-rose-600">{transactionsQuery.error || partnersQuery.error}</p>
      )}
      {createError && <p className="text-sm text-rose-600">{createError}</p>}
      {createSuccess && <p className="text-sm text-emerald-600">{createSuccess}</p>}
      {editError && <p className="text-sm text-rose-600">{editError}</p>}
      {editSuccess && <p className="text-sm text-emerald-600">{editSuccess}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">财务流水控制台</h2>
          <p className="text-sm text-slate-500">按合作方与时间筛选流水，后续将支持导出下载。</p>
        </div>
        <button
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          onClick={() => setIsCreateModalOpen(true)}
        >
          新建财务流水
        </button>
      </div>

      <FilterBar
        actions={
          <>
            <NavbarButton
              type="button"
              variant="outline"
              onClick={() => {
                setFilterPartnerInput('');
                setFilterPartnerId(null);
                setFilterDateFrom('');
                setFilterDateTo('');
              }}
            >
              重置筛选
            </NavbarButton>
            <NavbarButton type="button" variant="outline" onClick={() => console.info('TODO: 导出财务流水')}>
              导出流水（即将支持）
            </NavbarButton>
          </>
        }
      >
        <FilterBar.Field label="合作方">
          <>
            <input
              list="finance-filter-partners"
              className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm"
              value={filterPartnerInput}
              onChange={(event) => handleFilterPartnerInputChange(event.target.value)}
              placeholder="例如：泰国客户 / #12"
            />
            <datalist id="finance-filter-partners">
              {filterPartnerSuggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </>
        </FilterBar.Field>
        <FilterBar.Field label="开始日期">
          <input
            type="date"
            className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm"
            value={filterDateFrom}
            onChange={(event) => setFilterDateFrom(event.target.value)}
          />
        </FilterBar.Field>
        <FilterBar.Field label="结束日期">
          <input
            type="date"
            className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm"
            value={filterDateTo}
            onChange={(event) => setFilterDateTo(event.target.value)}
          />
        </FilterBar.Field>
      </FilterBar>

      {editingId && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-slate-900">编辑财务流水</h3>
          <form className="mt-4 grid gap-4 md:grid-cols-4" onSubmit={handleUpdate}>
            <label className="text-sm text-slate-600 md:col-span-2">
              <span className="block">合作方</span>
              <input
                list="finance-edit-partners"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={editPartnerInput}
                onChange={(event) => setEditPartnerInput(event.target.value)}
                placeholder="输入名称或 ID"
                required
              />
              <datalist id="finance-edit-partners">
                {editPartnerSuggestions.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            </label>
            <label className="text-sm text-slate-600">
              <span className="block">金额</span>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                type="number"
                step="0.01"
                value={editAmount}
                onChange={(event) => setEditAmount(event.target.value)}
                required
              />
            </label>
            <label className="text-sm text-slate-600">
              <span className="block">流水类型</span>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={editType}
                onChange={(event) => setEditType(event.target.value as FinanceTransactionType)}
                required
              >
                {TRANSACTION_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              <span className="block">备注</span>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={editNote}
                onChange={(event) => setEditNote(event.target.value)}
              />
            </label>
            <div className="flex items-center gap-2 md:col-span-2">
              <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={editSaving}>
                {editSaving ? '保存中…' : '保存修改'}
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600"
                onClick={resetEditState}
              >
                取消
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-semibold text-slate-900">财务流水列表</h3>
          {transactionsQuery.loading && <span className="text-sm text-slate-500">加载中…</span>}
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-4 py-3">合作方</th>
                <th className="px-4 py-3 text-right">金额</th>
                <th className="px-4 py-3">备注</th>
                <th className="px-4 py-3">操作人</th>
                <th className="px-4 py-3">时间</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
              {filteredTransactions.map((txn) => {
                const isAdjust = txn.transaction_type === 'ADJUST';
                const displayAmount = isAdjust ? txn.amount : Math.abs(txn.amount);
                const displaySign = isAdjust
                  ? txn.amount >= 0
                    ? '+'
                    : '-'
                  : txn.transaction_type === 'PAYMENT'
                  ? '-'
                  : '+';
                const amountColor = isAdjust
                  ? txn.amount >= 0
                    ? 'text-emerald-600'
                    : 'text-rose-600'
                  : txn.transaction_type === 'PAYMENT'
                  ? 'text-rose-600'
                  : 'text-emerald-600';
                return (
                  <tr key={txn.id}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{txn.partner_name || `合作方#${txn.partner}`}</div>
                      <div className="text-xs text-slate-500">ID: {txn.partner}</div>
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${amountColor}`}>
                      <div>
                        {displaySign}¥ {Math.abs(displayAmount).toFixed(2)}
                      </div>
                      <div className="text-xs text-slate-500">{TRANSACTION_TYPE_LABELS[txn.transaction_type]}</div>
                    </td>
                    <td className="px-4 py-3">{txn.note || '-'}</td>
                    <td className="px-4 py-3">{txn.operator || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{new Date(txn.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 text-xs font-semibold">
                        <button
                          className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 hover:bg-slate-50"
                          onClick={() => startEdit(txn.id)}
                        >
                          编辑
                        </button>
                        <button
                          className="rounded-full border border-rose-200 px-3 py-1 text-rose-600 hover:bg-rose-50"
                          onClick={() => handleDelete(txn.id)}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filteredTransactions.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-sm text-slate-500">
                    暂无财务流水记录。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-900">新建财务流水</h3>
              <button
                className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600"
                onClick={closeCreateModal}
              >
                关闭
              </button>
            </div>
            <form className="mt-4 grid gap-4 md:grid-cols-4" onSubmit={handleCreate}>
              <label className="text-sm text-slate-600 md:col-span-2">
                <span className="block">合作方</span>
                <input
                  list="finance-create-partners"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={createPartnerInput}
                  onChange={(event) => setCreatePartnerInput(event.target.value)}
                  placeholder="输入名称或 ID"
                  required
                />
                <datalist id="finance-create-partners">
                  {createPartnerSuggestions.map((suggestion) => (
                    <option key={suggestion} value={suggestion} />
                  ))}
                </datalist>
              </label>
              <label className="text-sm text-slate-600">
                <span className="block">金额</span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  type="number"
                  step="0.01"
                  value={createAmount}
                  onChange={(event) => setCreateAmount(event.target.value)}
                  required
                />
              </label>
              <label className="text-sm text-slate-600">
                <span className="block">流水类型</span>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={createType}
                  onChange={(event) => setCreateType(event.target.value as FinanceTransactionType)}
                  required
                >
                  {TRANSACTION_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-slate-600">
                <span className="block">备注</span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={createNote}
                  onChange={(event) => setCreateNote(event.target.value)}
                />
              </label>
              <div className="md:col-span-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600"
                  onClick={closeCreateModal}
                >
                  取消
                </button>
                <button
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={isCreating}
                >
                  {isCreating ? '提交中…' : '创建流水'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
