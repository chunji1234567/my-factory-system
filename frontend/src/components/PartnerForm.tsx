import { useState } from 'react';
import { api } from '../api/client';

const partnerOptions = [
  { value: 'CUSTOMER', label: '客户' },
  { value: 'SUPPLIER', label: '供应商' },
  { value: 'BOTH', label: '两者' },
  { value: 'SELF', label: '自用' },
];

export default function PartnerForm() {
  const [name, setName] = useState('');
  const [type, setType] = useState('CUSTOMER');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (evt: React.FormEvent) => {
    evt.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      await api.createPartner({ name, partner_type: type });
      setMessage('合作伙伴创建成功');
      setName('');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-semibold text-slate-900">新建合作伙伴</h3>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-sm text-slate-700">
        <label className="block">
          <span className="text-slate-500">名称</span>
          <input
            value={name}
            onChange={(evt) => setName(evt.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            placeholder="输入名称"
            required
          />
        </label>
        <label className="block">
          <span className="text-slate-500">类型</span>
          <select
            value={type}
            onChange={(evt) => setType(evt.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          >
            {partnerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {message && (
          <p className={`text-sm ${message.includes('成功') ? 'text-emerald-600' : 'text-rose-600'}`}>
            {message}
          </p>
        )}
        <button
          type="submit"
          className="w-full rounded-xl bg-slate-900 px-4 py-2 text-white font-semibold disabled:opacity-60"
          disabled={loading}
        >
          {loading ? '提交中…' : '创建'}
        </button>
      </form>
    </section>
  );
}
