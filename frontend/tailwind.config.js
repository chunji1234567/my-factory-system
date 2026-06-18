/** @type {import('tailwindcss').Config} */

// ============================================================================
// MyFactorySystem Design Tokens
// ============================================================================
//
// 视觉语言的"原子"集中定义。所有面板、组件应使用这里的 token 而非
// 散落的 slate-100/200/900 等原始色阶。详见 docs/design-system.md。
//
// 设计原则（2026-06-17 Stage A 落地）：
//   1. 颜色语义化：表达"角色"不是"色阶"。primary / surface / muted / accent / success / danger / warning
//   2. 仅 2 个圆角尺寸：card（大块卡片）、pill（按钮/标签）。input 单独一个稍小的
//   3. 阴影只有 2 层：低（默认）+ 高（hover/选中）
//   4. 间距用 Tailwind 默认刻度，避免散布"4.5/3.25"这类零散值
//
// 添加新 token 之前先问：现有 token 是否已经能表达？语义是否清晰？
//
// ============================================================================

export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      // -------- 语义化颜色 --------
      // 使用：bg-primary / text-on-primary / border-line / text-muted ...
      colors: {
        // 主操作 / 深色文字：黑灰色调
        primary: {
          DEFAULT: '#0f172a',           // slate-900
          hover: '#1e293b',             // slate-800
        },
        'on-primary': '#ffffff',         // 主操作上的文字（白）

        // 表面层：卡片底色 + 页面底色
        surface: {
          DEFAULT: '#ffffff',           // 卡片
          subtle: '#f8fafc',            // 页面底 / 弱化区块（slate-50）
          muted: '#f1f5f9',             // 输入框待激活（slate-100）
        },

        // 文字层级
        ink: {
          DEFAULT: '#0f172a',           // 主标题（slate-900）
          strong: '#1e293b',            // 副标题（slate-800）
          body: '#334155',              // 正文（slate-700）
          muted: '#64748b',             // 弱化（slate-500）
          faint: '#94a3b8',             // 占位 / 失效（slate-400）
        },

        // 线条
        line: {
          DEFAULT: '#f1f5f9',           // 默认细线（slate-100）
          strong: '#e2e8f0',            // 强调线（slate-200）
          focus: '#0f172a',             // 聚焦时（slate-900）
        },

        // 强调色（用于"今日待办 / 待生产"等需要引起注意的）
        accent: {
          DEFAULT: '#b45309',           // amber-700
          surface: '#fef3c7',           // amber-100
          ink: '#92400e',               // amber-800
        },

        // 成功色（用于"已完成 / 已发完"等正向状态）
        success: {
          DEFAULT: '#047857',           // emerald-700
          surface: '#d1fae5',           // emerald-100
        },

        // 危险色（不可逆动作 / 删除 / 报错）
        danger: {
          DEFAULT: '#e11d48',           // rose-600
          surface: '#ffe4e6',           // rose-100
          ink: '#9f1239',               // rose-800
        },

        // 警示色（生产中 / 部分发货 / 暂停）
        warning: {
          DEFAULT: '#d97706',           // amber-600
          surface: '#fef3c7',           // amber-100
        },
      },

      // -------- 圆角 --------
      // 用法：rounded-card / rounded-pill / rounded-input
      borderRadius: {
        card: '1.5rem',                // 24px，大块卡片
        input: '0.75rem',              // 12px，输入框 / 小按钮
        pill: '9999px',                // 完整 pill
      },

      // -------- 阴影 --------
      // 用法：shadow-card / shadow-card-hover
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        'card-hover': '0 4px 6px -1px rgb(15 23 42 / 0.08), 0 2px 4px -1px rgb(15 23 42 / 0.04)',
      },

      // -------- 字号 --------
      // 用法：text-heading / text-body / text-caption / text-mono-stat
      fontSize: {
        // 标题层级
        heading: ['1.5rem', { lineHeight: '2rem', fontWeight: '700' }],         // 24px - h2
        subheading: ['1.125rem', { lineHeight: '1.5rem', fontWeight: '700' }],  // 18px - h3 / 卡片标题
        // 正文层级
        body: ['0.875rem', { lineHeight: '1.25rem', fontWeight: '400' }],       // 14px - 标准正文
        caption: ['0.75rem', { lineHeight: '1rem', fontWeight: '500' }],        // 12px - 弱化辅助
        micro: ['0.6875rem', { lineHeight: '0.875rem', fontWeight: '700', letterSpacing: '0.1em' }], // 11px - UPPER 标签
      },

      // -------- 间距（沿用 Tailwind 默认刻度，仅命名几个语义化的） --------
      spacing: {
        // 页面层级
        'page-x': '1.5rem',            // 页面左右内边距（移动）
        'page-y': '1.5rem',
        // 卡片层级
        'card-x': '1.25rem',           // 20px
        'card-y': '1.25rem',
        // 段落间距
        'section-gap': '1.5rem',       // 24px - 卡片之间
      },
    },
  },
  plugins: [],
};
