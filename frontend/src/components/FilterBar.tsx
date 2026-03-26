import { useState } from 'react';

interface FilterBarProps {
  placeholder?: string;
  onSearch?(value: string): void;
  children?: React.ReactNode;
}

export default function FilterBar({ placeholder = '搜索…', onSearch, children }: FilterBarProps) {
  const [keyword, setKeyword] = useState('');

  const handleSubmit = (evt: React.FormEvent) => {
    evt.preventDefault();
    onSearch?.(keyword);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-1 items-center rounded-full border border-slate-200 px-3">
        <input
          value={keyword}
          onChange={(evt) => setKeyword(evt.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
        />
      </div>
      {children}
      <button
        type="submit"
        className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
      >
        搜索
      </button>
    </form>
  );
}
