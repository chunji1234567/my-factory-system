import { useEffect, useMemo } from 'react';
import {
  panelConfig,
  panelGroupConfig,
  panelGroupOrder,
  type PanelKey,
  type PanelGroup,
} from '../types';

/**
 * 侧边导航（Stage C-9 redesign，2026-06-18）。
 *
 * 替代旧的顶部横向 nav。按业务环节分组（日常作业 / 订单管理 / 仓库与资产 /
 * 合作方与配置），组内按业务时序排，与 docs/types.ts 的 panelGroupConfig 对齐。
 *
 * 桌面：固定 left-0 + 宽 w-64，主内容 lg:pl-64 让出空间
 * 移动：默认隐藏，由父组件控制 `open` 切换 + 半透明 backdrop 点外关闭
 *
 * 权限：父组件传 `allowedPanels`（已经按 user.roles 过滤过），sidebar 不再二次校验。
 */

interface Props {
  allowedPanels: readonly PanelKey[];
  activePanel: PanelKey;
  onSelect: (key: PanelKey) => void;
  /** 当前登录用户的显示名（顶部品牌区下方展示）。 */
  userName?: string;
  /** 当前用户的角色列表（小字展示在用户名下方）。 */
  userRoles?: string[];
  onLogout: () => void;
  /** 移动端抽屉是否展开（桌面端忽略）。 */
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({
  allowedPanels,
  activePanel,
  onSelect,
  userName,
  userRoles,
  onLogout,
  mobileOpen,
  onMobileClose,
}: Props) {
  // 把 allowedPanels 按 group 聚合，丢掉空组
  const grouped = useMemo(() => {
    const map = new Map<PanelGroup, PanelKey[]>();
    for (const key of allowedPanels) {
      const g = panelConfig[key].group;
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(key);
    }
    return panelGroupOrder
      .map((g) => ({ group: g, items: map.get(g) ?? [] }))
      .filter((row) => row.items.length > 0);
  }, [allowedPanels]);

  // 移动端打开时锁背景滚动
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <>
      {/* 移动端 backdrop */}
      {mobileOpen && (
        <div
          onClick={onMobileClose}
          className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm lg:hidden"
          aria-hidden
        />
      )}

      {/* 侧边栏本体 */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-surface border-r border-line
                    flex flex-col transition-transform duration-300
                    ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
                    lg:translate-x-0 lg:shadow-card`}
      >
        {/* 顶部品牌区 */}
        <div className="px-5 py-5 border-b border-line">
          <p className="text-micro text-ink-faint uppercase tracking-widest">
            My Factory System
          </p>
          <h1 className="text-subheading text-ink mt-1">运营指挥台</h1>
          {userName && (
            <div className="mt-3 pt-3 border-t border-line">
              <p className="text-caption font-bold text-ink truncate">{userName}</p>
              {userRoles && userRoles.length > 0 && (
                <p className="text-micro text-ink-faint mt-0.5">
                  {userRoles.map(roleLabel).join(' · ')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 导航分组 */}
        <nav className="flex-1 overflow-y-auto py-3">
          {grouped.map(({ group, items }) => (
            <div key={group} className="mb-4">
              <p className="px-5 mb-1 text-micro font-bold text-ink-faint uppercase tracking-wider">
                {panelGroupConfig[group].title}
              </p>
              <ul className="space-y-0.5">
                {items.map((key) => {
                  const active = key === activePanel;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(key);
                          onMobileClose();
                        }}
                        className={`w-full text-left px-5 py-2 text-caption font-bold transition-colors
                                    ${
                                      active
                                        ? 'bg-primary/10 text-primary border-l-2 border-primary'
                                        : 'text-ink-body hover:bg-surface-subtle border-l-2 border-transparent'
                                    }`}
                      >
                        {panelConfig[key].title}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* 底部退出 */}
        <div className="px-5 py-4 border-t border-line">
          <button
            type="button"
            onClick={onLogout}
            className="w-full rounded-pill border border-line-strong text-ink-body py-2 text-caption font-bold
                       hover:bg-surface-subtle hover:border-line-focus transition-all"
          >
            退出登录
          </button>
        </div>
      </aside>
    </>
  );
}

function roleLabel(r: string): string {
  if (r === 'manager') return '经理';
  if (r === 'warehouse') return '仓库';
  if (r === 'shipper') return '物流';
  return r;
}
