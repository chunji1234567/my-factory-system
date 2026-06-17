import { useEffect, useMemo, useState } from 'react';
import InventoryPanel from './components/panels/InventoryPanel';
import PurchasePanel from './components/panels/PurchasePanel';
import SalesOrdersPanel from './components/panels/SalesOrdersPanel';
import ShippingPanel from './components/panels/ShippingPanel';
import WarehouseReceivingPanel from './components/panels/WarehouseReceivingPanel';
import FinanceDetailPanel from './components/panels/FinanceDetailPanel';
import PartnerManagementPanel from './components/panels/PartnerManagementPanel';
import SelfMadeGalleryPanel from './components/panels/SelfMadeGalleryPanel';
import ProductionPanel from './components/panels/ProductionPanel';
import PcbPlanPanel from './components/panels/PcbPlanPanel';
import LoginForm from './components/LoginForm';
import { useAuth } from './context/AuthContext';
import { useProducts } from './hooks/useProducts';
import NavbarButton from './components/common/NavbarButton';
import { useCategories } from './hooks/useCategories';
import { usePurchaseOrders } from './hooks/usePurchaseOrders';
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
  const purchaseOrdersQuery = usePurchaseOrders(Boolean(accessToken) && (isManager || isWarehouse));
  // 注：useSalesOrders / useShippingLogs 已不在 App.tsx 中央获取——
  // SalesOrdersPanel 与 ShippingPanel 都自管对应 hook（带 filter + pagination）。

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
    return <div className="flex min-h-screen items-center justify-center text-slate-600">正在加载用户信息…</div>;
  }

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-slate-600">无法获取当前用户信息，请重新登录。</div>;
  }

  if (!allowedPanels.length) {
    return <div className="flex min-h-screen items-center justify-center text-slate-600">当前角色暂无可用面板，请联系管理员。</div>;
  }

  const inventoryProducts = mapProducts(productsQuery.data);
  const categories = categoriesQuery.data;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white shadow">
        <div className="mx-auto max-w-6xl px-4 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">My Factory System</p>
            <h1 className="text-2xl font-semibold text-slate-800">运营指挥台</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-slate-600">
            <nav className="flex flex-wrap gap-2">
              {allowedPanels.map((key) => (
                <NavbarButton key={key} active={activePanel === key} onClick={() => setActivePanel(key)}>
                  {panelConfig[key].title}
                </NavbarButton>
              ))}
            </nav>
            <NavbarButton variant="outline" onClick={logout}>
              退出
            </NavbarButton>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
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
          <PurchasePanel
            orders={purchaseOrdersQuery.data}
            loading={purchaseOrdersQuery.loading}
            error={purchaseOrdersQuery.error}
            onRefresh={purchaseOrdersQuery.reload}
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
          <WarehouseReceivingPanel
            orders={purchaseOrdersQuery.data}
            partners={partnersQuery.data}
            loading={purchaseOrdersQuery.loading}
            error={purchaseOrdersQuery.error}
            onRefresh={purchaseOrdersQuery.reload}
          />
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
        {activePanel === 'financeDetail' && <FinanceDetailPanel />}
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
