import { useState } from 'react';
import { api } from '../api/client';

const options = [
  { value: 'RAW_MATERIAL', label: '原材料' },
  { value: 'SELF_MADE', label: '自产件' },
  { value: 'FINISHED', label: '成品' },
];

interface Props {
  onSuccess?: () => void;
}

export default function CategoryForm({ onSuccess }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState('RAW_MATERIAL');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (evt: React.FormEvent) => {
    evt.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      await api.createCategory({ name, category_type: type });
      setName('');
      setMessage('分类创建成功');
      onSuccess?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-sm text-slate-700">
        <label className="block">
          <span className="text-slate-500">名称</span>
          <input
            value={name}
            onChange={(evt) => setName(evt.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
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
            {options.map((option) => (
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
          {loading ? '提交中…' : '创建分类'}
        </button>
      </form>
    </section>
  );
}
