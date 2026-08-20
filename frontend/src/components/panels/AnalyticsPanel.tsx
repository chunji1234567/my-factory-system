import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';

import { api, type AnalyticsCategoryOption } from '../../api/client';
import { toast } from '../../utils/toast';
import { formatMoney } from '../../utils/money';
import { Card, PageHeader, Section, StatTriple } from '../primitives';

/**
 * 经营分析中心（2026-06-20 新增，2026-08-21 扩展）。
 *
 * 视图：
 *   ① 销售 vs 采购金额趋势——双线折线图
 *   ② 排产吞吐量趋势——单线折线图
 *   ③ 物料消耗（实际口径）——从 PRODUCE_CONSUME 聚合，可 xlsx 导出
 *   ④ 方案销售（订单需求侧）——每个 PCB 方案在期间的销量 + 金额
 *   ⑤ 物料需求（订单需求侧）——外壳/线材 1:1，方案按 quantity_per_unit 展开
 *
 * 顶部时间选择器（起-止日期）+ 分组切换（日/周/月）。
 * 物料相关的表都支持分类筛选 + 分页。
 * 详见 backend/business/api/analytics_views.py。
 */

type GroupBy = 'day' | 'week' | 'month';
type MaterialSortKey = 'quantity' | 'total_value' | 'daily_avg';
type DemandSortKey = 'quantity' | 'total_value';
type PlanSortKey = 'quantity' | 'revenue';

const GROUP_OPTIONS: Array<{ value: GroupBy; label: string }> = [
  { value: 'day', label: '按日' },
  { value: 'week', label: '按周' },
  { value: 'month', label: '按月' },
];

const PAGE_SIZE_OPTIONS = [20, 50, 100];

const SOURCE_LABEL: Record<'shell' | 'cable' | 'plan', string> = {
  shell: '外壳',
  cable: '线材',
  plan: '方案',
};

/** 默认时间范围：本月 1 号到今天。 */
function defaultRange() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return {
    from: `${y}-${m}-01`,
    to: `${y}-${m}-${d}`,
  };
}

export default function AnalyticsPanel() {
  const [range, setRange] = useState(defaultRange);
  const [groupBy, setGroupBy] = useState<GroupBy>('day');

  // 物料消耗（实际）表 —— 排序 / 分类 / 分页
  const [materialSort, setMaterialSort] = useState<MaterialSortKey>('quantity');
  const [materialCategory, setMaterialCategory] = useState<number | null>(null);
  const [materialPage, setMaterialPage] = useState(1);
  const [materialPageSize, setMaterialPageSize] = useState(20);

  // 方案销售表 —— 排序 / 分页
  const [planSort, setPlanSort] = useState<PlanSortKey>('quantity');
  const [planPage, setPlanPage] = useState(1);
  const [planPageSize, setPlanPageSize] = useState(20);

  // 物料需求（订单侧）表 —— 排序 / 分类 / 分页
  const [demandSort, setDemandSort] = useState<DemandSortKey>('quantity');
  const [demandCategory, setDemandCategory] = useState<number | null>(null);
  const [demandPage, setDemandPage] = useState(1);
  const [demandPageSize, setDemandPageSize] = useState(20);

  const [trendData, setTrendData] = useState<Awaited<ReturnType<typeof api.getAnalyticsTrend>> | null>(null);
  const [throughputData, setThroughputData] = useState<Awaited<ReturnType<typeof api.getAnalyticsProductionThroughput>> | null>(null);
  const [materialData, setMaterialData] = useState<Awaited<ReturnType<typeof api.getAnalyticsMaterialConsumption>> | null>(null);
  const [planSalesData, setPlanSalesData] = useState<Awaited<ReturnType<typeof api.getAnalyticsPlanSales>> | null>(null);
  const [demandData, setDemandData] = useState<Awaited<ReturnType<typeof api.getAnalyticsMaterialDemand>> | null>(null);

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // range / groupBy / 各表分类 变了就重拉。分页 / 排序在前端处理，不触发重拉。
  useEffect(() => {
    if (!range.from || !range.to || range.from > range.to) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.getAnalyticsTrend({ ...range, group_by: groupBy }),
      api.getAnalyticsProductionThroughput({ ...range, group_by: groupBy }),
      api.getAnalyticsMaterialConsumption({ ...range, category: materialCategory }),
      api.getAnalyticsPlanSales(range),
      api.getAnalyticsMaterialDemand({ ...range, category: demandCategory }),
    ])
      .then(([trend, throughput, material, planSales, demand]) => {
        if (cancelled) return;
        setTrendData(trend);
        setThroughputData(throughput);
        setMaterialData(material);
        setPlanSalesData(planSales);
        setDemandData(demand);
        // 拉新数据后回到第 1 页
        setMaterialPage(1);
        setPlanPage(1);
        setDemandPage(1);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(`加载失败：${err?.message ?? '未知错误'}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, groupBy, materialCategory, demandCategory]);

  // 表格排序 + 分页（客户端处理）
  const sortedMaterialRows = useMemo(() => {
    if (!materialData) return [];
    return [...materialData.rows].sort((a, b) => b[materialSort] - a[materialSort]);
  }, [materialData, materialSort]);
  const pagedMaterialRows = useMemo(
    () => paginate(sortedMaterialRows, materialPage, materialPageSize),
    [sortedMaterialRows, materialPage, materialPageSize],
  );

  const sortedPlanRows = useMemo(() => {
    if (!planSalesData) return [];
    return [...planSalesData.rows].sort((a, b) => b[planSort] - a[planSort]);
  }, [planSalesData, planSort]);
  const pagedPlanRows = useMemo(
    () => paginate(sortedPlanRows, planPage, planPageSize),
    [sortedPlanRows, planPage, planPageSize],
  );

  const sortedDemandRows = useMemo(() => {
    if (!demandData) return [];
    return [...demandData.rows].sort((a, b) => b[demandSort] - a[demandSort]);
  }, [demandData, demandSort]);
  const pagedDemandRows = useMemo(
    () => paginate(sortedDemandRows, demandPage, demandPageSize),
    [sortedDemandRows, demandPage, demandPageSize],
  );

  const handleExportMaterials = async () => {
    if (range.from > range.to) {
      toast.error('起始日期不能晚于结束日期');
      return;
    }
    try {
      setExporting(true);
      const { blob, filename } = await api.downloadMaterialConsumptionXlsx({
        ...range,
        category: materialCategory,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('物料消耗 xlsx 已下载');
    } catch (err: any) {
      toast.error(`导出失败：${err?.message ?? '未知错误'}`);
    } finally {
      setExporting(false);
    }
  };

  const categoryOptions = materialData?.categories ?? demandData?.categories ?? [];

  return (
    <div className="space-y-section-gap animate-in fade-in duration-500 pb-20">
      <PageHeader
        title="经营分析"
        description="销售 / 采购 / 排产 / 物料消耗 / 方案销售——按自定义时段汇总"
      />

      {/* 顶部时间 + 分组切换 */}
      <Card flat tone="subtle" padding="tight">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-caption text-ink-body font-bold">时间</span>
          <input
            type="date"
            value={range.from}
            max={range.to}
            onChange={(e) => setRange((prev) => ({ ...prev, from: e.target.value }))}
            className="rounded-input border border-line bg-surface px-3 py-1.5 text-caption outline-none
                       focus:border-line-focus focus:ring-2 focus:ring-primary/5"
          />
          <span className="text-caption text-ink-faint">→</span>
          <input
            type="date"
            value={range.to}
            min={range.from}
            onChange={(e) => setRange((prev) => ({ ...prev, to: e.target.value }))}
            className="rounded-input border border-line bg-surface px-3 py-1.5 text-caption outline-none
                       focus:border-line-focus focus:ring-2 focus:ring-primary/5"
          />
          <div className="w-px h-6 bg-line mx-1" />
          <span className="text-caption text-ink-body font-bold">分组</span>
          <div className="flex rounded-pill border border-line-strong overflow-hidden">
            {GROUP_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setGroupBy(opt.value)}
                className={`px-3 py-1.5 text-caption font-bold transition-colors ${
                  groupBy === opt.value
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface text-ink-body hover:bg-surface-subtle'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {loading && <span className="text-caption text-ink-faint ml-2">加载中…</span>}
        </div>
      </Card>

      {/* KPI 卡片 */}
      {(trendData || throughputData) && (
        <StatTriple
          stats={[
            {
              label: '销售总额',
              value: formatMoney(trendData?.totals.sales ?? 0),
              tone: 'success',
            },
            {
              label: '采购总额',
              value: formatMoney(trendData?.totals.purchase ?? 0),
              tone: 'accent',
            },
            {
              label: '排产吞吐',
              value: `${(throughputData?.total ?? 0).toLocaleString()} 套`,
              tone: 'default',
            },
          ]}
        />
      )}

      {/* ① 销售 vs 采购趋势 */}
      <Section title="销售 vs 采购金额趋势">
        {!trendData || trendData.series.length === 0 ? (
          <p className="text-center text-caption text-ink-faint py-10">
            该时段没有销售或采购数据
          </p>
        ) : (
          <div className="w-full h-80">
            <ResponsiveContainer>
              <LineChart data={trendData.series} margin={{ top: 12, right: 24, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => (v >= 10000 ? `${(v / 10000).toFixed(1)}万` : String(v))}
                />
                <Tooltip
                  formatter={(v: number) => formatMoney(v)}
                  labelFormatter={(l) => `时段：${l}`}
                />
                <Legend />
                <Line type="monotone" dataKey="sales" name="销售金额" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="purchase" name="采购金额" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {/* ② 排产吞吐量趋势 */}
      <Section title="排产吞吐量趋势">
        {!throughputData || throughputData.series.length === 0 ? (
          <p className="text-center text-caption text-ink-faint py-10">
            该时段没有排产记录
          </p>
        ) : (
          <div className="w-full h-72">
            <ResponsiveContainer>
              <LineChart data={throughputData.series} margin={{ top: 12, right: 24, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number) => `${v.toLocaleString()} 套`}
                  labelFormatter={(l) => `时段：${l}`}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="quantity"
                  name="排产套数"
                  stroke="#059669"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {/* ③ 物料消耗表（实际消耗口径） */}
      <Section
        title="物料消耗（实际）"
        action={
          <div className="flex items-center gap-2">
            <CategorySelect
              value={materialCategory}
              onChange={(v) => {
                setMaterialCategory(v);
                setMaterialPage(1);
              }}
              options={categoryOptions}
            />
            <button
              onClick={handleExportMaterials}
              disabled={exporting || !materialData || materialData.rows.length === 0}
              className="rounded-pill bg-primary text-on-primary px-4 py-1.5 text-caption font-bold
                         hover:bg-primary-hover active:scale-95 transition-all
                         disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {exporting ? '导出中…' : '导出 xlsx'}
            </button>
          </div>
        }
      >
        {!materialData || sortedMaterialRows.length === 0 ? (
          <p className="text-center text-caption text-ink-faint py-10">
            该时段没有物料消耗记录
          </p>
        ) : (
          <>
            {/* 摘要行 */}
            <div className="mb-3 flex items-center gap-4 text-caption text-ink-faint flex-wrap">
              <span>共 <strong className="text-ink">{materialData.summary.material_count}</strong> 种物料</span>
              <span>总消耗 <strong className="text-ink">{materialData.summary.total_quantity.toLocaleString()}</strong></span>
              <span>总价值 <strong className="text-ink">{formatMoney(materialData.summary.total_value)}</strong></span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-caption">
                <thead>
                  <tr className="bg-surface-subtle text-ink-body">
                    <th className="text-left px-3 py-2">物料名</th>
                    <th className="text-left px-3 py-2">编号</th>
                    <th className="text-left px-3 py-2">分类</th>
                    <SortableHeader
                      label="消耗数量"
                      active={materialSort === 'quantity'}
                      onClick={() => setMaterialSort('quantity')}
                    />
                    <th className="text-right px-3 py-2">加权单价</th>
                    <SortableHeader
                      label="总价值"
                      active={materialSort === 'total_value'}
                      onClick={() => setMaterialSort('total_value')}
                    />
                    <SortableHeader
                      label="日均消耗"
                      active={materialSort === 'daily_avg'}
                      onClick={() => setMaterialSort('daily_avg')}
                    />
                  </tr>
                </thead>
                <tbody>
                  {pagedMaterialRows.map((r) => (
                    <tr key={r.product_id} className="border-b border-line last:border-0 hover:bg-surface-subtle/40">
                      <td className="px-3 py-2">{r.model_name}</td>
                      <td className="px-3 py-2 font-mono text-ink-faint">{r.internal_code}</td>
                      <td className="px-3 py-2 text-ink-faint">{r.category}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.quantity.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatMoney(r.avg_price)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatMoney(r.total_value)}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.daily_avg.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              total={sortedMaterialRows.length}
              page={materialPage}
              pageSize={materialPageSize}
              onPageChange={setMaterialPage}
              onPageSizeChange={(size) => {
                setMaterialPageSize(size);
                setMaterialPage(1);
              }}
            />
          </>
        )}
      </Section>

      {/* ④ 方案销售（订单需求侧） */}
      <Section title="方案销售">
        {!planSalesData || sortedPlanRows.length === 0 ? (
          <p className="text-center text-caption text-ink-faint py-10">
            该时段没有带方案的销售明细
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-4 text-caption text-ink-faint flex-wrap">
              <span>共 <strong className="text-ink">{planSalesData.summary.plan_count}</strong> 个方案</span>
              <span>总销量 <strong className="text-ink">{planSalesData.summary.total_quantity.toLocaleString()}</strong></span>
              <span>销售额 <strong className="text-ink">{formatMoney(planSalesData.summary.total_revenue)}</strong></span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-caption">
                <thead>
                  <tr className="bg-surface-subtle text-ink-body">
                    <th className="text-left px-3 py-2">方案名</th>
                    <th className="text-left px-3 py-2">编号</th>
                    <th className="text-left px-3 py-2">状态</th>
                    <SortableHeader
                      label="销售数量"
                      active={planSort === 'quantity'}
                      onClick={() => setPlanSort('quantity')}
                    />
                    <th className="text-right px-3 py-2">加权单价</th>
                    <SortableHeader
                      label="销售金额"
                      active={planSort === 'revenue'}
                      onClick={() => setPlanSort('revenue')}
                    />
                  </tr>
                </thead>
                <tbody>
                  {pagedPlanRows.map((r) => (
                    <tr key={r.plan_id} className="border-b border-line last:border-0 hover:bg-surface-subtle/40">
                      <td className="px-3 py-2">{r.plan_name}</td>
                      <td className="px-3 py-2 font-mono text-ink-faint">{r.plan_code || '—'}</td>
                      <td className="px-3 py-2">
                        {r.is_active ? (
                          <span className="text-ink-faint">启用中</span>
                        ) : (
                          <span className="text-danger">已下架</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{r.quantity.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatMoney(r.avg_price)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatMoney(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              total={sortedPlanRows.length}
              page={planPage}
              pageSize={planPageSize}
              onPageChange={setPlanPage}
              onPageSizeChange={(size) => {
                setPlanPageSize(size);
                setPlanPage(1);
              }}
            />
          </>
        )}
      </Section>

      {/* ⑤ 物料需求（订单展开侧） */}
      <Section
        title="物料需求（订单展开）"
        action={
          <CategorySelect
            value={demandCategory}
            onChange={(v) => {
              setDemandCategory(v);
              setDemandPage(1);
            }}
            options={categoryOptions}
          />
        }
      >
        {!demandData || sortedDemandRows.length === 0 ? (
          <p className="text-center text-caption text-ink-faint py-10">
            该时段没有销售订单需求
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-4 text-caption text-ink-faint flex-wrap">
              <span>共 <strong className="text-ink">{demandData.summary.material_count}</strong> 种物料</span>
              <span>总需求 <strong className="text-ink">{demandData.summary.total_quantity.toLocaleString()}</strong></span>
              <span>金额 <strong className="text-ink">{formatMoney(demandData.summary.total_value)}</strong></span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-caption">
                <thead>
                  <tr className="bg-surface-subtle text-ink-body">
                    <th className="text-left px-3 py-2">物料名</th>
                    <th className="text-left px-3 py-2">编号</th>
                    <th className="text-left px-3 py-2">分类</th>
                    <th className="text-left px-3 py-2">来源</th>
                    <SortableHeader
                      label="需求数量"
                      active={demandSort === 'quantity'}
                      onClick={() => setDemandSort('quantity')}
                    />
                    <th className="text-right px-3 py-2">加权单价</th>
                    <SortableHeader
                      label="需求价值"
                      active={demandSort === 'total_value'}
                      onClick={() => setDemandSort('total_value')}
                    />
                  </tr>
                </thead>
                <tbody>
                  {pagedDemandRows.map((r) => (
                    <tr key={r.product_id} className="border-b border-line last:border-0 hover:bg-surface-subtle/40">
                      <td className="px-3 py-2">{r.model_name}</td>
                      <td className="px-3 py-2 font-mono text-ink-faint">{r.internal_code}</td>
                      <td className="px-3 py-2 text-ink-faint">{r.category}</td>
                      <td className="px-3 py-2 text-ink-faint">
                        {r.sources.map((s) => SOURCE_LABEL[s]).join(' / ')}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{r.quantity.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatMoney(r.avg_price)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatMoney(r.total_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              total={sortedDemandRows.length}
              page={demandPage}
              pageSize={demandPageSize}
              onPageChange={setDemandPage}
              onPageSizeChange={(size) => {
                setDemandPageSize(size);
                setDemandPage(1);
              }}
            />
          </>
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 局部组件 & 工具
// ---------------------------------------------------------------------------

function paginate<T>(rows: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

interface SortableHeaderProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function SortableHeader({ label, active, onClick }: SortableHeaderProps) {
  return (
    <th className="text-right px-3 py-2">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 font-bold transition-colors ${
          active ? 'text-primary' : 'text-ink-body hover:text-ink'
        }`}
      >
        {label}
        {active && <span className="text-micro">↓</span>}
      </button>
    </th>
  );
}

interface CategorySelectProps {
  value: number | null;
  onChange: (v: number | null) => void;
  options: AnalyticsCategoryOption[];
}

function CategorySelect({ value, onChange, options }: CategorySelectProps) {
  // 按 category_type 分组
  const grouped = useMemo(() => {
    const map = new Map<string, AnalyticsCategoryOption[]>();
    for (const o of options) {
      const key = o.category_type_display || o.category_type;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return Array.from(map.entries());
  }, [options]);

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className="rounded-input border border-line bg-surface px-3 py-1.5 text-caption outline-none
                 focus:border-line-focus focus:ring-2 focus:ring-primary/5"
    >
      <option value="">全部分类</option>
      {grouped.map(([label, items]) => (
        <optgroup key={label} label={label}>
          {items.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

interface PagerProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

function Pager({ total, page, pageSize, onPageChange, onPageSizeChange }: PagerProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-caption text-ink-faint flex-wrap">
      <span>
        {start}–{end} / 共 {total} 条
      </span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1">
          每页
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-input border border-line bg-surface px-2 py-1 text-caption outline-none
                       focus:border-line-focus focus:ring-2 focus:ring-primary/5"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className="rounded-input border border-line px-3 py-1 hover:bg-surface-subtle
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          上一页
        </button>
        <span className="min-w-[64px] text-center">
          {safePage} / {totalPages}
        </span>
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          className="rounded-input border border-line px-3 py-1 hover:bg-surface-subtle
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          下一页
        </button>
      </div>
    </div>
  );
}
