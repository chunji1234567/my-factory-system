import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * SearchableSelect —— 可搜索下拉（轻量 Combobox）。
 *
 * 替代原生 `<select>`，给"几十上百个选项的下拉"用：
 *   - 焦点时展开过滤列表，输入关键字即时按 label / value 过滤
 *   - 列表 max-h 受控，溢出滚动
 *   - 点选项即填入并自动关闭
 *   - 失焦时若输入文本不是合法选项，回退到上一次的 value（不污染数据）
 *   - 键盘：↑/↓ 高亮，Enter 选中，ESC 关闭
 *
 * 设计取舍：
 *   * 不用 headlessui / downshift —— 工厂 ERP 体量没必要拖第三方依赖。
 *   * value 仍然是 `string`（option.value），和原生 select 完全对齐——
 *     调用方改造成本只是 `<select value={v} onChange>` → `<SearchableSelect value={v} onChange>`。
 *   * 搜索同时匹配 label + value，方便用 internal_code（如 "SH-001"）秒搜。
 *
 * 用法：
 *   <SearchableSelect
 *     options={[{ value: '1', label: 'iPhone 黑色外壳 (SH-001)' }, ...]}
 *     value={item.product}
 *     onChange={(v) => updateItem('product', v)}
 *     placeholder="请选择外壳"
 *   />
 */

interface Option {
  value: string;
  label: string;
}

interface Props {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** disabled = true 时不可交互，视觉同原生 select 灰态。 */
  disabled?: boolean;
  /** 透传给容器，方便嵌入 grid 时控制宽度。 */
  className?: string;
}

const INPUT_CLS =
  'w-full rounded-input border border-line bg-surface px-3 py-2 text-body outline-none ' +
  'focus:border-line-focus focus:ring-2 focus:ring-primary/5 transition-colors ' +
  'disabled:bg-surface-muted disabled:text-ink-faint disabled:cursor-not-allowed';

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = '请选择',
  disabled = false,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 当前选中的选项（用于闭合时显示其 label）
  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  // 过滤列表：同时匹配 label + value（让用户能输 internal_code 秒搜）
  const filtered = useMemo(() => {
    const kw = query.trim().toLowerCase();
    if (!kw) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(kw) || o.value.toLowerCase().includes(kw),
    );
  }, [options, query]);

  // 打开时把高亮重置到选中项（若选中项在过滤后的列表里）
  useEffect(() => {
    if (!open) return;
    const idx = filtered.findIndex((o) => o.value === value);
    setHighlightIdx(idx >= 0 ? idx : 0);
  }, [open, filtered, value]);

  // 外点关闭：捕获 mousedown 处理失焦的同时不打断选项点击
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  const handleSelect = (opt: Option) => {
    onChange(opt.value);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && filtered[highlightIdx]) {
        e.preventDefault();
        handleSelect(filtered[highlightIdx]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
    }
  };

  // 显示文本：打开时跟着用户输入；闭合时跟着 value
  const displayValue = open ? query : selected?.label ?? '';

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls="searchable-select-list"
        className={INPUT_CLS}
        value={displayValue}
        disabled={disabled}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      {/* 右侧 chevron 提示这是个下拉，而不是普通输入框 */}
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint text-micro">
        ▾
      </span>

      {open && (
        <div
          id="searchable-select-list"
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-input border border-line bg-surface
                     shadow-card-hover py-1"
        >
          {filtered.length === 0 ? (
            <p className="text-caption text-ink-faint text-center py-3">
              无匹配项
            </p>
          ) : (
            filtered.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isHigh = idx === highlightIdx;
              return (
                <button
                  type="button"
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  // mousedown 先于 input 的 blur，避免列表先消失
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(opt);
                  }}
                  className={`w-full text-left px-3 py-2 text-caption transition-colors
                              ${isHigh ? 'bg-surface-subtle' : ''}
                              ${isSelected ? 'font-bold text-ink' : 'text-ink-body'}
                              hover:bg-surface-subtle`}
                >
                  {opt.label}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
