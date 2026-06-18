# UX Audit（2026-06-17，Stage B 输出）

> 目的：扫所有面板，识别操作重复 / 页面杂乱 / 信息冗余三类痛点，给出 redesign 建议。
> 不写代码，纯文档。用户 review 后画圈，再实施。
> 写作时参考：`docs/design-system.md`（Card / PageHeader / Section / StatTriple / ActionBar / Pill 原语已就绪）+ `docs/PRD.md` §4.5（BOM-2.1 流程）。

## 0. 评估维度

每个面板按 5 个维度打分，便于横向比较与排优先级：

1. **操作重复 (Repetition)**——同一个动作要重复输入/重复点击 N 次（典型反例：逐行排产、逐行添加 draft、逐项调整库存）。
2. **信息架构 (IA)**——一页是否塞了三件互不相关的事；用户脑子里要切换的"心理模型"个数。
3. **信息冗余 (Density)**——展示了一堆"我现在用不到的数字"（典型反例：表头列了 6 列数字，其中 4 列日常忽略）。
4. **视觉杂乱 (Noise)**——同一信息密度下，色彩 / 圆角 / 字号 / 间距是否过载（典型反例：一行里 4 种灰阶、3 种圆角、紧贴 4 个 chip）。
5. **复用差 (Reuse)**——自造卡片、自造表头、自造按钮，没用 primitives，导致同一概念在不同面板长得不一样。

每个维度按 高/中/低 三档；面板总优先级 = max(各维度)，并参考用户在系统使用频率（生产 / 发货是每天用，PCB / 合作方是低频）。

---

## 1. 跨面板共性问题

这 5 个问题在 8/10 的面板里都能找到，应在动具体面板前就有共识：

### 1.1 自造卡片 — 严重的视觉碎片化

几乎每个面板都在用裸的 `bg-white rounded-3xl border border-slate-100 shadow-sm p-5`、`rounded-[2rem]`、`rounded-[2.5rem]`、`rounded-[3rem]` 这类临时圆角。`ShippingPanel` 系列里同时出现 `rounded-[1.5rem] md:rounded-[3rem]`、`rounded-[2rem]`、`rounded-[2.5rem]` 三种圆角，没人能说出"什么时候用哪个"。

**建议**：所有内容块统一用 `<Card>`、二级块用 `<Card tone="subtle" flat>`，圆角 token 只剩 `card / input / pill` 三档（design-system.md §2.2）。这件事不是"美化"，是去歧义——同一概念长得一样，用户读屏更快。

### 1.2 没有批量化思维

整个系统几乎找不到"全选 + 批量操作"的影子：
- `ProductionPanel`：每条销售明细要单独填数量 + 单独点按钮 + 单独 confirm
- `ShippingEntryForm`：每条 draft 都是一行四列下拉/输入，"添加更多明细"按钮只是把空行复制一份
- `ReceivingOrderTable`：每条 item 都要点"确认收货"打开 modal，逐条填数量
- `InventoryPanel`：唯一有"批量"形态的面板（选多个 → 一起调整），但仍要为每条单独填数量
- `FinanceDetailPanel`：删除/编辑都是逐条

**建议（横向规则）**：所有列表类操作都要回答"如果有 30 条要处理，用户怎么办"。常见模式：
- "全部当作 X" 一键填充（如发货：全部今日发完 / 排产：全部按 awaiting 排满）
- 多选 + 公共编辑栏（如批量改状态）
- "上次的值" 一键复用（运单号已经在做，要扩展到数量 / 备注）

### 1.3 标题区都是孤立的 h2 + 副标题，没法承载操作

每个面板的标题区都是手写的：
```
<h2 className="text-2xl font-bold ...">销售管理</h2>
<p className="text-xs text-slate-400 mt-1 uppercase">Outbound Sales</p>
```
然后右边可能有一个新建按钮、可能有一个 "⚠ 不可逆" 灰底 pill、可能什么都没有。导致每个面板顶部的"重量感"不一致，标题旁有时是 button 有时是 pill。

**建议**：统一用 `<PageHeader title subtitle actions={...}>`，"⚠ 创建排产即扣料" 这种警示放到 `<Card tone="danger" padding="tight">` 里、不要跟标题挤一行。

### 1.4 中文 + 英文标签双语 = 三倍视觉负担

很多面板：标题中文 + 副标题英文（"Outbound Sales & Orders" / "Inbound Logistics Control" / "Recent 30 Shipping Activities" / "Purchase Order Context" / "Historical Orders" / "Financial Ledger Audit" / "Transaction History"），还有更迷的 "BY: SYSTEM"、"REF: -"、"UID-12"。

**建议**：UPPER-tracking 风格的"装饰性英文"全部砍掉。只在三个地方保留：
- 面板顶部副标题（如"今日排产"），且翻成简体中文一句话（如"以销售明细为主视角，输入数量即生产扣料"）。
- 表格列头（仍中文）。
- 真正的标识符（订单号 / 编号），用 mono 字体即可，不需要 "UID-" 前缀。

整套系统的英文副标题数目应当从目前 30+ 缩减到 0~3 个。

### 1.5 状态变更 = 一个 select + 一个按钮 = 永远要点两下

`ShippingStatusTable` 和 `PurchasePanel` 里的状态推进都是"选一个 → 点按钮"。但 90% 的情况用户只是想"推进到下一档"。当前还有个反逻辑：select 的初值 = order.status，必须先选别的才能解锁按钮。

**建议**：状态推进改成一键"下一档"按钮（`<NavbarButton>推进至「生产中」</NavbarButton>`），下方用 `<Pill>` 显示当前状态。只有需要回退或跳档时才走"更多 → 修改状态"的二级菜单。这一改全系统至少省掉 4 个 select 控件。

---

## 2. 面板逐个审计

### 2.1 ProductionPanel（排产中心）— 用户痛点最重

**当前结构**：单页一个搜索框 + 一行 12 列的网格表头 + N 行表格。每行：订单号/客户、商品、订单/已排/已发/待排 4 列数字、一个数字输入框、一个"排产"按钮。点按钮 → window.confirm → POST。表格行上限 = 50（pageSize=50）。

**关键痛点**：

- **操作重复 (高)**：用户的日常是"今天给 8 个客户都排产，每个排 2~6 套"。意味着 8 次输入 + 8 次点击 + 8 次 `window.confirm` 弹窗。`window.confirm` 还是浏览器原生 alert，体验非常笨重，且无法批量。✅
- **操作冗长 (高)**：每条排产都要弹一个 `window.confirm` 念整段"扣料(2+N)条…不可逆…如要撤销需录反向 StockAdjustment"。同一句话用户一天看 8 遍，第三遍开始就只会闭眼按确认——这种"重复提示"已经反过来把"真正需要警示"的语义抹平了。✅
- **信息冗余 (中)**：表头 4 列数字（订单 / 已排 / 已发 / 待排），其中"已发"在排产场景下毫无用处（用户排产时不关心发货进度，那是 ShippingPanel 的事）。"订单总量" 和 "已排" 其实只有差值（=待排）才是用户决策依据。✅
- **视觉杂乱 (中)**：12 列网格 + 每行 7 个不同重量的文字 + amber 高亮的"待排"数字 + 黑色按钮 + 灰色禁用行，一屏 30 行下来视觉抖动很大。
- **复用差 (高)**：表头/表行是手写的 grid，状态颜色直接 `text-amber-700` 硬编码，没用 `<Card>` / `<Pill>`。✅

**Redesign 提议**：

1. **核心动作改成"卡片网格 + 默认全填 + 一键提交"**：
   - 每条销售明细 = 一张卡片（用 `<Card interactive>`），3 列网格（桌面）。
   - 卡片顶部 1 行：客户名 + 订单号（小灰字 mono）+ 商品名。
   - 卡片中部用 `<StatTriple>` 显示"已生产 / 待排产 / 订单总量"（**去掉"已发"**，那是 ShippingPanel 的事，看排产的人不需要）。
   - 卡片底部：一个大输入框，placeholder 默认是 `awaiting`（如 "今日 8"），用户改一下就行；用 `<Pill tone="accent">` 显示"建议全排满"。
2. **加全局 ActionBar**：列表上方放 `<ActionBar>` 一行：
   - "全部按建议填满" 按钮 → 把所有空输入框默认填成 `awaiting`
   - "全部清空"
   - "一键提交（已填 N 张）" 按钮 → 单条 confirm，列出本次共会扣 X 套外壳/Y 套线材/Z 条原材料汇总，然后并行 POST。
   - 这一改把"一天 8 次确认"压到"1 次确认（看汇总后按）+ N 次后台请求"。
3. **window.confirm → 抽屉式确认**：用 `<Modal>` 或新建 `<ConfirmSheet>` primitive：左侧是即将排产的明细列表，右侧是"汇总扣料"。这个抽屉是"心理模型"上"我承认这一批确实要扣料"的强提示。单条排产时一次只跳一行的版本可以保留。
4. **顶部"⚠ 创建排产即扣料"的 amber 胶囊去掉**：放进 ActionBar 上方的 `<Card tone="accent" padding="tight">`，且只显示一次，不要每个面板都挤在 h2 旁边。
5. **状态徽章去掉**：现在每行有 `order.status`（ORDERED/PRODUCING…）小灰字。排产场景下用户不在意原始状态，能用 `<Pill tone="accent">急</Pill>` 这类业务标签替代。"PRODUCING" 这种英文常量字符串永远不应该出现在前端。
6. **awaiting=0 的行**：现在是灰色低透明度还在列表里。建议默认折叠到"今日已排完（N 张）"的可点开 `<Section>`，列表只显示真正需要操作的卡片。

**Mock 一行的目标布局**（文字描述）：
```
┌─────────────────────────────────────────────────────────┐
│ 张家港 五金厂              SO-20260617-005   弯头螺杆 4mm │
│                                                          │
│   已生产 12         待排产 8 ●          总量 20          │
│                                                          │
│   今日排产  [   8   ] 套      [按建议排满]   [立即排产]  │
└─────────────────────────────────────────────────────────┘
```
一屏 6 张这种卡，远比现在 12 行表格干净。

**优先级**：**高**（每日核心操作，痛点最集中）

---

### 2.2 ShippingPanel 系列（发货控制）— 用户痛点第二重

**当前结构**：单页竖直三段：① ShippingStatusTable（按订单+明细展示已发进度，含状态推进 select+button + 客户搜索 + 状态 tab）② ShippingEntryForm（多行 draft：每行 4 个输入下拉 + 删除按钮）③ ShippingHistoryLog（流水表 + 分页）。三段之间是 `<hr>`。

**关键痛点**：

- **信息架构混乱 (高)**：三个模块本质是三件事——"看进度 / 录新发货 / 看历史"。挤在一个垂直滚动里，用户做"录新发货"时 ① 在视野上方挤位置，做"看历史"时 ②③ 都在抢注意力。这是用户原话"页面杂乱"最典型的体现。✅
- **操作重复 (高)**：录发货时每行都要选订单 → 选明细 → 填数量 → 填单号。8 个客户发货 = 8×4=32 次交互。"运单号智能同步"做了首行→其它行，但同一订单里多明细分两行时仍要选两次订单。✅
- **信息冗余 (高)**：StatusTable 一列叫"已生产 / 已发 / 总量 · 可发"——一个 cell 里 4 个数字 + 4 个灰色标签。"已生产"和"总量"在发货场景下没有决策意义，用户只关心"可发"。✅
- **视觉杂乱 (高)**：①里有 5 个 status tab、4 列表头、订单+明细+进度三层嵌套卡，②里有蓝色加号、删除按钮、四列下拉，③里有蓝色单号 chip、灰色"无单号"chip、emerald "+12"chip。3 段拼起来视觉密度爆炸。✅
- **复用差 (高)**：①的明细卡用 `bg-slate-50 rounded-2xl`，②的 draft 行用 `bg-slate-50/50 rounded-[1.75rem]`，③的 cell 又是另一种圆角。没有一个共同的"明细卡"组件。✅

**Redesign 提议**：

1. **把三段抽成 Tab**：顶部 `<PageHeader title="发货控制" actions={tabs}>`，三个 tab：「待发列表」「录入发货」「历史流水」。用户一次只看一件事。这是最重要的一改，能直接消解"页面杂乱"的指控。
2. **「待发列表」Tab 重做**：
   - 默认筛选 = `available_to_ship > 0`（不显示生产中的项目）。需要时给一个 "包含未生产完" 的开关。
   - 列表改为卡片：每张卡 = 一个销售订单，里面展开 N 个 `<Card tone="subtle">` 明细块。
   - 每个明细块右侧直接放一个 `<Pill tone="accent">可发 8</Pill>` + 一个 `[一键全发]` 按钮——点了直接 POST `ShippingLog{quantity_shipped=available}`，跳过录入页。这是用户最常见的操作：今天 5 条全发了。
   - **去掉每行的状态推进 select+button**：发货录入后 signal `auto_complete_sales_order` 已经会自动推 SHIPPED/COMPLETED，"手动推进状态"是多余的（也违反 BOM-2.1 设计）。"管理操作"列直接砍掉。
   - 5 个 status tab（全部 / 已下单 / 生产中 / 发货中 / 已完成）保留，但用 `<Pill>` 风格而不是黑色实心 tab，减少视觉重量。
3. **「录入发货」Tab 重做（操作重复的重点解药）**：
   - 默认行不再是 4 列空输入。改成"先选订单 → 自动把该订单所有可发明细列成行 → 每行 quantity 默认 = available_to_ship"。用户的工作流变成"选订单 → 改 1~2 个数字 → 提交"。
   - 运单号字段移出每行，提升到表单顶部"本次运单号（应用到所有行）"——只有"分单"的场景才需要在某些行覆盖。
   - 提交按钮上方放汇总：`即将创建 5 条发货记录，共发出 24 套，运单号 SF12345`。
   - 增加"复用上次"按钮——选订单后，如果上一次给该订单发货过，按钮变成"按上次的分配（A明细8/B明细4）一键填入"。
4. **「历史流水」Tab 重做**：
   - 桌面端 4 列表 → 改为按日期分组的时间线（每天一个 `<Section title="2026-06-16（周一）">`），日期内卡片。这种"流水"语义适合时间线，不适合表格。
   - 桌面端目前的"物流状态 / 时间"列右上"📅 + 蓝胶囊 + 灰胶囊"两层信息合并成一行 `<Pill>SF12345 · 14:23</Pill>`。
   - 数据范围：title 写"最新发货日志"但又"Recent 30 Shipping Activities"——副标题英文砍掉，title 改成"近 30 条发货流水"。
5. **详情 Modal 现状**：点行打开"销售订单详情记录"显示事件流。这功能错位——发货中心不该展示销售订单的备注流。建议**整个删掉**，需要看事件流的人去销售管理面板看。

**Mock 「录入发货」Tab 的目标布局**：
```
─ 选择订单 [SO-20260617-005 张家港五金厂] ─────────────────
─ 本次运单号 [SF1234567]  ───────────────────────────────── 

  待发明细（自动列出）：
  ┌─ 弯头螺杆 4mm   可发 8   今日发 [ 8 ] [按可发量填满] ─┐
  ┌─ 直筒螺杆 6mm   可发 5   今日发 [ 5 ] [按可发量填满] ─┐
  ┌─ T 型螺帽       可发 3   今日发 [ 0 ] [按可发量填满] ─┐ (取消勾选 → 0)

  汇总：即将提交 2 条发货，共 13 套 · 运单 SF1234567
                                        [清空] [一键提交]
```
跟现在的"4 列下拉，自己拼明细"形成代际差。

**优先级**：**高**（用户原话痛点最严重）

---

### 2.3 SalesOrdersPanel（销售管理）

**当前结构**：标题 + 筛选（客户 + 状态）+ 列表表格（4 列：客户/单号、状态、金额、操作）+ 点行展开 OrderDetailsView + 编辑/创建 Modal（含 OrderItemsEditor）+ 记录动态 Modal + 分页。

**关键痛点**：

- **信息冗余 (中)**：表格只有 4 列其实合理，但"管理"列同时塞了"记录动态 + 编辑订单"两个 outline 按钮，且 "记录动态" 是低频操作（只有 manager 用），抢了视觉重量。
- **操作冗余 (中)**：创建销售单时每条明细要选三件（外壳 + PCB 方案 + 线材）。这件事本身合理，但表单的 OrderItemsEditor 没看过原文（但 form state 里管理 6 个字段：product/pcbPlan/cable/price/quantity/customName/detailDescription），一条明细要填 7 项。
- **信息架构 (低)**：编辑销售单时禁止改 status（已经在代码里注释，对，是正确的）——但 UI 上看不出来"为什么状态不在这里改"，用户得用脑子记。
- **复用差 (中)**：表格自造，移动端卡片自造，状态 chip 用 `<StatusBadge>` 复用了（好）。
- **小问题**：`PurchasePanel` 表头里有 `text-rigth` 拼写错误（其他面板没这问题），class 不会生效。

**Redesign 提议**：

1. **"记录动态"按钮折叠到行展开里**：现在每行右侧 2 个 outline 按钮。把"记录动态"移到点行展开的 `<OrderDetailsView>` 底部（事件流的下方）作为大号入口"+ 添加业务动态"。这样列表行只剩 1 个"编辑"按钮，视觉立刻清爽。
2. **状态 + 金额合并为顶部摘要带**：行展开后，第一行用 `<StatTriple>` 显示"订单总额 / 已发金额 / 待收款"——这是销售员真正想知道的，而不是埋在事件流里。
3. **编辑表单"客户" + "明细"两步**：用 `<Section>` 分两段，客户选定后再展示明细编辑。明细行用一张大 `<Card tone="subtle">`，三件下拉用 grid-cols-3 排版，价格 / 数量 放在卡片底部一行——避免 7 列一行那种密集恐惧。
4. **筛选区简化**：现在两栏（客户 / 状态）。状态筛选改成顶部 `<Pill>` row 替代下拉（"全部 / 待处理 / 生产中 / 已发货 / 已完成"），客户搜索框单独留。
5. **金额展示去 `¥` 前空格**："¥ 1234.00" 改 "¥1,234.00"。Number(order.total_amount).toFixed(2) 用 `Intl.NumberFormat` 自动加千分位。
6. **副标题英文砍掉**："Outbound Sales & Orders" 去掉，或者改成中文短句"按客户查看销售订单与明细"。

**优先级**：**中**（结构不算糟，主要是细节打磨）

---

### 2.4 PurchasePanel（采购管理）

**当前结构**：与 SalesOrdersPanel 几乎对称——筛选、表格、点行展开 OrderDetailsView、编辑/创建 Modal、记录动态 Modal、分页。

**关键痛点**：

- **重复造轮子 (高)**：与 SalesOrdersPanel 90% 重复——筛选 + 表格 + 4 列结构 + 行展开 + Modal + 事件 Modal。两个面板的差只在于：客户 vs 供应商、status 枚举、明细字段。但都写了一遍。
- **复用差 (高)**：与 §2.3 一致问题。
- **代码 bug**：`text-rigth`（typo）、`bg-白`（中文字符渗入 class，行 174）——这是真错误，class 不生效，列头视觉左对齐了。
- **筛选/分页方式落后**：用 `usePaginatedFilter` 客户端筛选，与 SalesOrdersPanel 用 server-side filter 的范式不一致（rules/frontend-rules.md 已规范）。
- **信息冗余 (低)**：表格上没有"已收金额 / 待结款"信息——其实采购员关心这个，可以加。

**Redesign 提议**：

1. **抽公共组件 `<OrderListShell>`**：把 SalesOrdersPanel + PurchasePanel 的"标题 + 筛选 + 表格 + 展开 + Modal" 抽成一个 generic 组件，传入 `mode = "sales" | "purchase"` + filterSchema + columnSchema + ItemsEditor 配置。直接减少 600 行代码，且修一处全修。
2. **筛选改 server-side**：与 SalesOrdersPanel 对齐，hook 接收 typed params。
3. **修 typo 与中文 class**：第 174 行 `bg-白` 改 `bg-white`，第 190 行 `text-rigth` 改 `text-right`。
4. **加"已收 / 待收"列**：在金额列下方加一行小字 "已收 ¥800 · 待收 ¥200"——采购员日常关心进度，目前要点开看明细 + 切换合作方面板看台账，路径太长。

**优先级**：**中**（视觉问题不严重但重复代码多，重做一次能拉动整体一致性）

---

### 2.5 WarehouseReceivingPanel + warehouse/* 子组件（收货中心）

**当前结构**：标题 + 搜索 + 两个 status tab（"待收货订单" / "部分到货"）+ N 张订单卡（每个订单内嵌一张 item 表）+ 分页 + 收货 Modal。

**关键痛点**：

- **操作重复 (高)**：每个订单 × 每条 item 都要点"确认收货" → 打开 Modal → 选物料 → 填数量 → 填备注 → 确认。Modal 已经预选了某一行 item，但仍要在 Modal 里有个"选择收货物料"下拉，逻辑上多此一举。
- **信息架构 (中)**：每张订单卡内嵌一张表（"采购物料明细 / 收货进度 / 操作"），桌面端是 table、移动端是卡片堆叠。订单 + 明细两层嵌套很重。
- **信息冗余 (中)**：进度列同时显示"received / total"数字 + 1px 进度条 + emerald 颜色——三个表达冗余，留一个就够。
- **视觉杂乱 (中)**：单张订单卡 = "供应商头部（slate-50/30 底）" + "桌面表头（slate-50/50 底）" + "item 行（hover slate-50/30）" + "item 内 bg-white 嵌套卡片（border + shadow）"——四层背景叠在一起，user 眼睛不知道往哪看。Modal 里又有一个"slate-900 实心暗卡"作为订单上下文 banner，跟整体浅色调对比强烈。
- **状态 tab 浪费空间**：tab 占了整行宽度还 scale-105、shadow-xl，但其实只有两个选项（且可以点同一个切换）——用 `<Pill>` 即可。

**Redesign 提议**：

1. **收货 Modal 简化**：用户从某一行点"确认收货"打开 Modal 后，已经明确了 item，**Modal 里"选择收货物料"下拉直接去掉**（变成只读显示）。Modal 只剩 2 个输入：数量、备注。
2. **"按可收量一键填满"**：Modal 里数量字段 placeholder 改成 `剩 12 个`，默认值就填 `剩 12`，用户改一下就行。
3. **多 item 批量收货**：在订单卡顶部加 `[全部按可收量收货]` 按钮 → 弹一个抽屉列出该订单所有未收完的 item + 每行预填数量 → 一次性 POST N 条 ReceivingLog。这是收货员的日常（一批货来了，一次性入库）。
4. **嵌套层数砍掉**：订单卡 = `<Card>`，里面直接列 item 卡 `<Card tone="subtle" flat padding="tight">`，去掉中间的"hidden md:block / md:hidden"双重渲染。
5. **进度条 + 数字二选一**：保留 "8/12" 数字 + 颜色（emerald=完成 / ink-body=进行中），把进度条删掉——日常用户只看数字。
6. **状态 tab**：替换成顶部右侧两个 `<Pill>`（"仅未收完 ·开"），点击切换。
7. **Modal 顶部那张深色 banner 删掉**：换成 `<PageHeader title={partner_name} subtitle={order_no} compact>`，统一风格。

**优先级**：**中**（每日操作，但目前是"能用"，redesign 收益主要在批量化）

---

### 2.6 InventoryPanel（库存中心）

**当前结构**：标题 + 顶部筛选（搜索 + 分类）+ 选中浮现 amber 批量操作区 + 按分类分组的列表（每组用 `<ProductTable>` 渲染）+ 新建分类 Modal + 新建产品 Modal。

**关键痛点**：

- **信息架构 (中)**：批量操作区只在选中时出现，但选中 1 件时也是大的 amber 卡 + 不可逆 rose 警示 + 详细 chip 列表——一件物料触发整个浮现块有点过。
- **操作重复 (中)**：选中 N 件后仍要给每件填数量。可以加"全部填 X"快捷键。
- **视觉杂乱 (中)**：批量操作区里同时有：amber-50 大底 + rose-50 警示卡 + 蓝色 chip + 黑色 select + 黑色按钮 + 灰色"清空" link——5 种颜色挤在一个区块。
- **信息冗余 (低)**：分类筛选下拉本身合理。但 selectedProducts.map → chip 列表展示已选物料的模型名，超过 5 件后会换行成 2~3 行 chip，视觉重——可以折叠成"已选 5 件（点击展开）"。
- **复用差 (中)**：amber 卡是手写大块 JSX，rose 警示是另一种手写，没用 `<Card tone="accent">` / `<Card tone="danger">`。

**Redesign 提议**：

1. **批量操作区改进**：
   - 用 `<Card tone="accent">` 容器替代手写 amber-50。
   - 不可逆 rose 警示折叠成 `<Card tone="danger" padding="tight">` 单行：⚠ 提交后不可撤销。
   - 已选物料 chip 列表 > 3 件时自动折叠为 "已选 5 件 ⌄"。
   - 加 `[全部填 1]` `[全部填 0.5]` 这类快捷按钮（针对常见盘点单位）。
2. **顶部"新建分类 / 新建产品" 移到 PageHeader 右侧**：现在塞在 FilterBar.actions 里，与"重置筛选"挤在一起，重要性失衡。
3. **分类筛选改 `<Pill>` row**：6~10 个分类用 chip 横排比下拉好选。
4. **`<ProductTable>` 没读，但建议传 `<StatTriple>` 表示"在库 / 安全库存 / 占用"**：节省每行的列数。
5. **副标题英文砍掉**（如果有）。

**优先级**：**中低**（仓管面板，结构基本正确，主要是收敛视觉）

---

### 2.7 SelfMadeGalleryPanel（自产件图库）

**当前结构**：顶部 section（搜索 + 分类 + 新建产品按钮）+ section "自产外壳图库"（grid-cols-3 卡片，每卡一张图 + 4 个数据 + 出库/入库按钮）+ 分页 + 调整 Modal + 新建产品 Modal。

**关键痛点**：

- **视觉杂乱 (中)**：每张卡里有"型号"、"编号"、"单位"、"库存"、"安全库存"5 个标签——其实"单位"和"安全库存"日常不查，可以折叠到详情。
- **信息冗余 (中)**：库存 vs 安全库存共 4 个数字 + 一个颜色（rose=低于安全）。可以合并成 `<StatTriple>` 或单行 "库存 120 / 安全 50 · 充足"。
- **操作重复 (中)**：每张卡的"出库/入库"打开同样的 Modal，逐件操作。如果一次盘点要调整 10 件，要点 10 次。
- **复用差 (高)**：用了 `rounded-2xl border border-slate-200 bg-slate-50 shadow-inner`、自造 modal（不是统一 Modal）、自造按钮（不是 NavbarButton）——和 InventoryPanel 同类业务完全风格不一致。整段文件像是早期写的，没跟着后期重构。
- **副标题问题**：title 写"自产外壳图库"但 SELF_MADE_TYPES 里包含 CABLE（线材）。文字不准确。

**Redesign 提议**：

1. **统一到 InventoryPanel 的批量交互**：勾选多张图卡 → 顶部浮现批量调整栏（同 InventoryPanel）。
2. **卡片瘦身**：图 + 型号 + 库存（1 行大字） + 出库/入库按钮。其它字段（单位 / 安全库存 / 编号）放到 hover 时浮现或点开抽屉。
3. **改用 `<Card interactive>` 包整张图卡**：去掉 `bg-slate-50 shadow-inner` 这种过时风格。
4. **标题"自产外壳图库"改"自产成品图库"或"工坊产物图库"**：因为已包含 CABLE。
5. **新建产品按钮**移到 `<PageHeader actions>`。
6. **调整 Modal**：复用 InventoryPanel 同款（已经有不可逆提示卡 + IN/OUT 二选一）；目前两个面板都各有一套，应统一。

**优先级**：**中低**（也是仓管，但视觉迭代历史最旧，redesign 后能跟 InventoryPanel 显著拉齐）

---

### 2.8 PartnerManagementPanel + partners/* 系列（合作方）

**当前结构**：列表态（PartnerHeader 创建栏 + 类型切换 chip + 关键词搜索 + PartnerTable 三列：名称/属性/余额 + 分页）⇄ 详情态（PartnerDetailView 头部摘要 + 三 tab：关联订单 / 转账流水 / 财务台账 + 内嵌内容）。

**关键痛点**：

- **信息架构 (中)**：PartnerHeader 顶部"快速创建行" + "列表类型切换 chip + 关键词搜索"是 2 个 section 堆叠。"创建合作方"是低频操作，但占了顶部最重的视觉位置。
- **信息冗余 (中)**：列表只有 3 列（名称/属性/余额），相当干净。但属性那列只有"客户/供应商/全能"3 种，用 `<Pill>` 更易扫读。
- **视觉杂乱 (高)**：详情视图 = 3 套子视图（订单 / 转账 / 台账）。"关联订单"视图里每张订单卡有"订单号(mono uppercase) + 日期 + 大写英文 status chip"——一行 4 种字体重量。每个 item 又是 `bg-white border 卡`，三层卡嵌套（外圈 slate-50 卡 → 中间 white 卡 → 小灰 chip）。Ledger 表格列又有"业务类型 / 借方 / 贷方 / 净额 / 备注"5 列——日常用户不熟"借/贷"，用"+/-"和净额其实够了。
- **操作冗余 (中)**：详情头部有"关闭详情"按钮（rose 色），但用户的心智模型是"返回上一页"——按钮文字应该是"← 返回列表"而不是"关闭详情"。
- **复用差 (高)**：详情卡是手写一整段，三 tab 是自造按钮组，分页是手写"上一页/下一页"按钮（在 Container 里）+ 又用了 `<Pagination>` 组件（在 orders / txns 列表里）——同一页两套分页。

**Redesign 提议**：

1. **"创建合作方"折叠到 `<PageHeader actions>` 的 `+新建` 按钮 → 弹 Modal**。当前的顶部创建栏几乎只占视觉重量，操作量很低。
2. **PartnerTable**：属性列改 `<Pill tone="success">客户</Pill>` / `<Pill tone="warning">供应商</Pill>` / `<Pill tone="accent">全能</Pill>`。余额负数加 `<Pill tone="danger">`。
3. **详情视图重做**：
   - 头部用 `<PageHeader title={partner_name} subtitle="UID-12" backTo="列表" actions={ExportButton}>`。
   - 三 tab 用 `<Pill>` row（黑色实心切到 surface tone）。
   - "关联订单" tab 的每张订单卡用 `<Card tone="subtle">`，里面 item 用 `<Card flat padding="tight">`——两层而非三层。
   - "财务台账" tab 列从 6 列减到 4 列：日期 / 类型 / 金额（带 + - 颜色）/ 备注。借方/贷方两列合并（只有调整笔需要分别显示，那时再用 +/- 表达）。
4. **分页两套统一**：在 Container 里把 ledger / orders / txns 三套分页都用 `<Pagination>`。
5. **底部"所有账务数据均实时同步…仅供内部对账使用"**：删掉。这是 boilerplate 文字，用户读完一次就不会再读。

**优先级**：**中**（manager 才用，频次低，但视觉问题集中在详情视图，做了能拉高品味）

---

### 2.9 FinanceDetailPanel（财务流水）

**当前结构**：标题 + 多色提示 banner（error/success 各 4 条）+ 筛选（合作方 datalist + 起止日期）+（条件渲染）编辑表单 amber section + 列表表格 + 创建 Modal（自造 fixed inset 而非 `<Modal>` 组件）。

**关键痛点**：

- **风格落后 (高)**：通篇用了 `rounded-2xl border border-slate-100 shadow-sm` 老式风格，没用 NavbarButton，按钮直接 `rounded-full bg-slate-900`。和 PCB / Production / Shipping 等新面板气质差一截。
- **信息架构 (中)**：所有内容垂直堆叠：error banner（4 条 if-then 显示）+ 筛选 + （编辑表单）+ 列表 + 创建 Modal。错误提示是 4 个独立的 `<p>`，会同时显示多个；操作完成后 success 也是 banner 而非 toast。
- **操作重复 (高)**：删除时用 `window.confirm`（"确认删除该财务流水？操作不可撤销"）——每删一条弹一次。
- **复用差 (高)**：自造 modal `<div className="fixed inset-0 z-50 …">`，没用统一 `<Modal>`。
- **信息冗余 (中)**：列表 6 列（合作方/金额/备注/操作人/时间/操作）。"操作人" 列大多数 row 是同一人，"时间" 列用了 `toLocaleString` 完整时间戳——可以省到 yyyy-mm-dd 或相对时间。
- **核心交互不流畅**：编辑时把表单"嵌入"列表上方的 amber section 里，但创建用 Modal。两种模式不一致。

**Redesign 提议**：

1. **风格升级到当前标准**：所有 `rounded-2xl` 改 `rounded-card`、按钮统一 `<NavbarButton>`、Modal 用统一组件。这一项即工作量最大。
2. **错误提示改 toast 或单一 banner**：避免同时 4 行错误堆叠。可加一个 `<Toast>` primitive 收口。
3. **编辑改 Modal**：与创建对齐，都走 Modal。点行编辑 → 弹 Modal（同布局，title="编辑财务流水"）。这样列表区不会因为编辑膨胀一大段。
4. **删除不弹 window.confirm**：行末加红色小按钮，点击进入"已选中删除模式"——表头出现 `<ActionBar>已选 1 条 · [删除] [取消]`。批量删除天然解决。
5. **列表瘦身**：6 列 → 4 列（合作方 / 金额 + 类型 / 备注 / 时间）。操作人放到行 hover tooltip 或编辑 Modal 里。
6. **筛选区加"最近 7 天 / 30 天" 快捷 chip**：日期选两次是常见操作，给两个预设大幅提升效率。

**优先级**：**中**（manager 才用，但是当前风格落后最明显的面板，redesign 能让整体一致性快速提升）

---

### 2.10 PcbPlanPanel（PCB 方案）

**当前结构**：标题 + 筛选（名称/编号 + 是否含已下架）+ 列表（每张方案卡：标题 + 操作按钮 + 物料 chip 网格）+ 分页 + 编辑 Modal（基本信息 + 物料配方表）。

**关键痛点**：

- **信息架构 (低)**：结构本身合理——列表 + 编辑 modal。
- **操作冗余 (中)**：编辑时每条物料行是 12 列 grid（select + 数量 + 备注 + 删除）。一个常见 PCB 有 10~30 条物料，编辑模态框很长。"启用/下架" 用 window.confirm。
- **信息冗余 (低)**：每张方案卡展开列出全部物料（grid-cols-3）。物料多时整张卡很高。
- **视觉杂乱 (低)**：rose-500 删除按钮 + slate-200 outline 按钮 + 黑色实心保存按钮，三种重量。
- **复用差 (中)**：方案卡是 `bg-white rounded-3xl border p-5 shadow-sm` 手写，物料 chip 是 `bg-slate-50 rounded-xl`——没用 primitives。
- **奇怪的提示**：模态底部"提示：编辑方案时，提交后会**全量替换**物料列表…如果只想改基本信息，不要触发添加/删除物料行"——这是后端 API 限制泄露到 UI 文案。用户不该知道"提交方式"。

**Redesign 提议**：

1. **方案卡折叠物料**：默认只展示"方案名 + 编号 + 是否启用 + 物料数量（10 条）"。物料列表点击 "展开物料" 才显示——多数时间用户只是浏览方案列表，不需要看到所有原材料 chip。
2. **编辑 Modal 配方区改为"卡片列表"**：每条物料一张 `<Card tone="subtle" flat padding="tight">`，左侧大字"物料名 × 数量"，右侧编辑按钮。点编辑变成行内编辑。增删变成顶部 `[+ 添加物料]` 大按钮。
3. **改"全量替换"为"仅修改本卡"模式**：每张物料卡都是可编辑单元，用户感受不到"全量替换"——后端怎么实现是后端的事，提示文案 **整段删掉**。
4. **window.confirm 替成 `<Pill>` 状态切换**：方案卡上的"启用 / 下架" 改成 `<Pill tone={active ? 'success' : 'muted'}>` 直接点击切换 + 顶部 toast 确认。
5. **物料 chip 改 `<Pill>`**：统一组件。

**优先级**：**低**（manager 低频操作，且功能正确，只是品味问题）

---

## 3. 推荐重做顺序

基于"用户痛点严重程度 × 每日使用频次"双维度排：

| # | 面板 | 主要驱动 | 预估工作量 |
|---|---|---|---|
| 1 | **ProductionPanel** | 用户原话点名 + 每日核心操作 + 操作重复最严重 + window.confirm 笨重 | 中 |
| 2 | **ShippingPanel 系列** | 用户原话点名 + 三段拼接最杂乱 + 录入流程最繁琐 | 大 |
| 3 | **PurchasePanel + SalesOrdersPanel** | 抽公共组件 `<OrderListShell>` 一次拉平两个面板 + 修 typo + 改 server-side 范式 | 中 |
| 4 | **WarehouseReceivingPanel** | 收货 Modal 简化 + 全部收货一键化 | 中 |
| 5 | **FinanceDetailPanel** | 整体风格升级 + 自造 modal 替换 | 中 |

**InventoryPanel / SelfMadeGalleryPanel** 排在第 5 之后，先做 Card / Pill / StatTriple 替换，等到 Stage C 后期再批量处理。**PartnerManagementPanel / PcbPlanPanel** 是低频操作，最后做。

### 建议的重做节奏

- **Sprint 1 (1 周)**：完成 #1 + #2。这两个面板共用"卡片明细 + 一键批量提交"这个新交互范式，要一次定下来不要反复改。
- **Sprint 2 (1 周)**：完成 #3（抽 `<OrderListShell>`）。借这次抽象，把 SalesOrdersPanel/PurchasePanel/WarehouseReceivingPanel 的"订单卡 + 明细列表 + 展开详情"形态共用一个 primitive。
- **Sprint 3 (3-5 天)**：完成 #4 + #5 + 库存两个面板的视觉收敛。

---

## 4. 设计师可以放心忽略的部分

短期内（Stage B+C）不需要改的：

- **PcbPlanPanel**：方案管理是 manager 一周用 1~2 次的低频面板，当前结构合理（列表 + Modal 编辑）。除"全量替换提示文案"必须删掉外，其它问题都可接受。
- **PartnerManagementPanel 列表态**：3 列表格干净，只需要把 partner_type 改 `<Pill>` 即可。
- **InventoryPanel 的批量浮现机制本身**：用户已经熟悉"勾选 → 浮现批量栏 → 一起调"，这个流程是对的，只是视觉过载。
- **OrderDetailsView（共享组件，没读）**：与 SalesOrdersPanel/PurchasePanel 复用，如果展开内容已经"够用"就别动。改太多会牵连到事件流的展示。
- **SelfMadeGalleryPanel 的图库 grid 形态**：3 列卡片配图本身合理，只是卡片内容要瘦身。

这些可以放到 Stage D / E 慢慢迭代，不阻塞主路径。
