import { useEffect, useMemo, useState } from 'react';
import InventoryPanel from './components/panels/InventoryPanel';
import PurchasePanel from './components/panels/PurchasePanel';
import SalesOrdersPanel from './components/panels/SalesOrdersPanel';
import ShippingPanel from './components/panels/ShippingPanel';
import WarehouseReceivingPanel from './components/panels/WarehouseReceivingPanel';
import PartnerManagementPanel from './components/panels/PartnerManagementPanel';
import SelfMadeGalleryPanel from './components/panels/SelfMadeGalleryPanel';
import ProductionPanel from './components/panels/ProductionPanel';
import PcbPlanPanel from './components/panels/PcbPlanPanel';
import LoginForm from './components/LoginForm';
import { useAuth } from './context/AuthContext';
import { useProducts } from './hooks/useProducts';
import { Sidebar } from './components/Sidebar';
import { useCategories } from './hooks/useCategories';
import { usePartners } from './hooks/usePartners';
import { panelConfig, type PanelKey, type InventoryProduct } from './types';

const panelKeysList = Object.keys(panelConfig) as PanelKey[];
const ACTIVE_PANEL_STORAGE_KEY = 'mfs-active-panel';

function getInitialPanel(): PanelKey {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const panelFromUrl = params.get('panel');
    if (panelFromUrl && panelKeysList.includes(panelFromUrl as PanelKey)) {
      return panelFromUrl as PanelKey;
    }

    const storedPanel = window.localStorage.getItem(ACTIVE_PANEL_STORAGE_KEY);
    if (storedPanel && panelKeysList.includes(storedPanel as PanelKey)) {
      return storedPanel as PanelKey;
    }
  }

  return panelKeysList[0];
}

function App() {
  const [activePanel, setActivePanel] = useState<PanelKey>(getInitialPanel);
  /** 移动端抽屉开关；桌面 lg 以上 sidebar 永久显示，忽略此 state。 */
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const panelKeys = useMemo(() => panelKeysList, []);
  const { accessToken, logout, user, userLoading } = useAuth();
  // 角色 flag 提前计算，给下方 hook gating 使用。
  const isManager = Boolean(user?.roles?.includes('manager'));
  const isWarehouse = Boolean(user?.roles?.includes('warehouse'));
  const isShipper = Boolean(user?.roles?.includes('shipper'));
  // products / categories 是 manager+warehouse 的主数据（后端权限同口径）；
  // shipper 不消费这两个接口，避免发出 403 请求。
  const productsQuery = useProducts(Boolean(accessToken) && (isManager || isWarehouse));
  const categoriesQuery = useCategories(Boolean(accessToken) && (isManager || isWarehouse));
  // /api/core/partners/ 后端权限 IsManager only（详见 docs/PRD.md §2.2）。
  // warehouse / shipper 的面板不需要 partners 列表——
  //   - WarehouseReceivingPanel 仅作为 dead prop 接收，内部不消费；
  //   - ShippingPanel 通过 sales_item.order.partner_name 嵌套字段拿合作方名。
  // 因此这里只在 manager 时触发，避免 warehouse/shipper 静默 403。
  const partnersQuery = usePartners(Boolean(accessToken) && isManager);
  // 注：useSalesOrders / useShippingLogs / usePurchaseOrders 都不在 App.tsx 中央获取——
  // SalesOrdersPanel / ShippingPanel / PurchasePanel / WarehouseReceivingPanel 各自
  // 自管对应 hook（带 filter + pagination）。这样 panel 切换时也不会强制全量重拉。

  const allowedPanels = useMemo(() => {
    if (!user) {
      return [] as PanelKey[];
    }
    return panelKeys.filter((key) =>
      panelConfig[key].roles.some((role) => user.roles.includes(role))
    );
  }, [panelKeys, user]);

  useEffect(() => {
    if (allowedPanels.length && !allowedPanels.includes(activePanel)) {
      setActivePanel(allowedPanels[0]);
    }
  }, [allowedPanels, activePanel]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.set('panel', activePanel);
    const query = params.toString();
    const newUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', newUrl);
    window.localStorage.setItem(ACTIVE_PANEL_STORAGE_KEY, activePanel);
  }, [activePanel]);

  if (!accessToken) {
    return <LoginForm />;
  }

  if (userLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-subtle text-body text-ink-muted">
        正在加载用户信息…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-subtle text-body text-ink-muted">
        无法获取当前用户信息，请重新登录。
      </div>
    );
  }

  if (!allowedPanels.length) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-subtle text-body text-ink-muted">
        当前角色暂无可用面板，请联系管理员。
      </div>
    );
  }

  const inventoryProducts = mapProducts(productsQuery.data);
  const categories = categoriesQuery.data;

  return (
    <div className="min-h-screen bg-surface-subtle">
      {/* 侧边导航：桌面 fixed 永久展示；移动端 mobileNavOpen 控制抽屉 */}
      <Sidebar
        allowedPanels={allowedPanels}
        activePanel={activePanel}
        onSelect={setActivePanel}
        userName={user?.username}
        userRoles={user?.roles}
        onLogout={logout}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      {/* 移动端顶部 bar：汉堡按钮 + 当前面板标题（桌面端隐藏） */}
      <header className="lg:hidden sticky top-0 z-30 bg-surface border-b border-line">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="rounded-input border border-line-strong p-2 text-ink-body hover:bg-surface-subtle transition-colors"
            aria-label="打开导航"
          >
            <span className="block w-5">
              <span className="block h-0.5 bg-current mb-1" />
              <span className="block h-0.5 bg-current mb-1" />
              <span className="block h-0.5 bg-current" />
            </span>
          </button>
          <p className="text-subheading text-ink truncate">{panelConfig[activePanel].title}</p>
        </div>
      </header>

      {/* 主内容：桌面端给 sidebar 让 256px */}
      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-8 lg:py-10">
        {activePanel === 'inventory' && (
          <InventoryPanel
            products={inventoryProducts}
            loading={productsQuery.loading}
            error={productsQuery.error}
            onRefreshProducts={productsQuery.reload}
            categories={categories}
            onRefreshCategories={categoriesQuery.reload}
          />
        )}
        {activePanel === 'sales' && (
          /* SalesOrdersPanel 自管订单数据（带 filter + 分页），不再从 App.tsx 拿 orders / loading / error / onRefresh。 */
          <SalesOrdersPanel
            partners={partnersQuery.data}
            products={productsQuery.data}
            categories={categoriesQuery.data}
            isManager={isManager}
            canCreateEvents={isManager || isShipper}
          />
        )}
        {activePanel === 'purchase' && (
          /* PurchasePanel 自管 usePurchaseOrders（带 filter + 分页），
             不再从 App.tsx 拿 orders / loading / error / onRefresh。
             WarehouseReceivingPanel 也自管同一个 hook，两个面板独立查询——
             从一边提交不会自动刷新另一边的视图（切回时会重新拉）。 */
          <PurchasePanel
            products={productsQuery.data}
            partners={partnersQuery.data}
            categories={categoriesQuery.data}
            isManager={isManager}
            canCreateEvents={isManager || isWarehouse}
          />
        )}
        {activePanel === 'shipping' && (
          /* ShippingPanel 自管 useSalesOrders / useShippingLogs（带 filter + pagination）。 */
          <ShippingPanel />
        )}
        {activePanel === 'receiving' && (
          /* WarehouseReceivingPanel 自管 usePurchaseOrders（带 filter + 分页）。
             与 PurchasePanel 独立查询，互不刷新。 */
          <WarehouseReceivingPanel />
        )}
        {activePanel === 'partners' && (
          <PartnerManagementPanel
            partners={partnersQuery.data}
            loading={partnersQuery.loading}
            error={partnersQuery.error}
            onRefresh={partnersQuery.reload}
          />
        )}
        {activePanel === 'selfMadeGallery' && (
          <SelfMadeGalleryPanel
            products={productsQuery.data}
            categories={categoriesQuery.data}
            loading={productsQuery.loading}
            error={productsQuery.error}
            onRefresh={productsQuery.reload}
            onRefreshCategories={categoriesQuery.reload}
          />
        )}
        {/* 2026-06-18：financeDetail 面板已合并进 partners（合作方与结算）的"流水"标签。 */}
        {activePanel === 'production' && (
          /* ProductionPanel 自管 useProductionOrders / useSalesOrders / useProducts / usePcbPlans，
             不需要从 App.tsx 传任何数据。详见 docs/PRD.md §4.5 排产流程。 */
          <ProductionPanel />
        )}
        {activePanel === 'pcbPlans' && (
          /* PcbPlanPanel（manager only）：维护 PCB 方案配方。
             方案被销售明细 / 排产明细引用，排产 EXECUTED 时按方案展开扣减原材料。
             详见 docs/PRD.md §3.2 §4.5 §9.4 changelog 2026-05-21（PCB 方案改造）。 */
          <PcbPlanPanel />
        )}
        </div>
      </main>
    </div>
  );
}

export default App;

function mapProducts(data: ReturnType<typeof useProducts>['data']): InventoryProduct[] {
  return data.map((item) => ({
    id: item.id,
    internalCode: item.internal_code,
    modelName: item.model_name,
    stockQuantity: item.stock_quantity,
    minStock: item.min_stock,
    category: item.category_detail?.name ?? '未分类',
    categoryType: item.category_detail?.category_type,
    categoryId: item.category,
  }));
}
