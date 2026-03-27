import { useEffect, useMemo, useState } from 'react';
import InventoryPanel from './components/panels/InventoryPanel';
import PurchasePanel from './components/panels/PurchasePanel';
import SalesOrdersPanel from './components/panels/SalesOrdersPanel';
import ShippingPanel from './components/panels/ShippingPanel';
import WarehouseReceivingPanel from './components/panels/WarehouseReceivingPanel';
import FinanceDetailPanel from './components/panels/FinanceDetailPanel';
import PartnerManagementPanel from './components/panels/PartnerManagementPanel';
import LoginForm from './components/LoginForm';
import { useAuth } from './context/AuthContext';
import { mockOrders, mockProducts } from './mockData';
import { useProducts } from './hooks/useProducts';
import { useCategories } from './hooks/useCategories';
import { useSalesOrders } from './hooks/useSalesOrders';
import { usePurchaseOrders } from './hooks/usePurchaseOrders';
import { usePartners } from './hooks/usePartners';
import { panelConfig, type PanelKey } from './types';

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
  const productsQuery = useProducts(Boolean(accessToken));
  const categoriesQuery = useCategories(Boolean(accessToken));
  const salesOrdersQuery = useSalesOrders(Boolean(accessToken));
  const isManager = Boolean(user?.roles?.includes('manager'));
  const isWarehouse = Boolean(user?.roles?.includes('warehouse'));
  const isShipper = Boolean(user?.roles?.includes('shipper'));
  const partnersNeeded = isManager || isWarehouse || isShipper;
  const partnersQuery = usePartners(Boolean(accessToken && partnersNeeded));
  const purchaseOrdersQuery = usePurchaseOrders(Boolean(accessToken));

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

  const products = productsQuery.data.length ? mapProducts(productsQuery.data) : mockProducts;
  const categories = categoriesQuery.data;
  const salesOrders = salesOrdersQuery.data.length ? mapSalesOrders(salesOrdersQuery.data) : mockOrders;

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
                <button
                  key={key}
                  onClick={() => setActivePanel(key)}
                  className={`rounded-full px-4 py-2 transition-colors ${
                    activePanel === key
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 hover:bg-slate-200'
                  }`}
                >
                  {panelConfig[key].title}
                </button>
              ))}
            </nav>
            <button
              onClick={logout}
              className="rounded-full border border-slate-200 px-4 py-2 text-slate-600 hover:bg-slate-50"
            >
              退出
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        {activePanel === 'inventory' && (
          <InventoryPanel
            products={products}
            loading={productsQuery.loading}
            error={productsQuery.error}
            onRefreshProducts={productsQuery.reload}
            categories={categories}
            onRefreshCategories={categoriesQuery.reload}
          />
        )}
        {activePanel === 'sales' && (
          <SalesOrdersPanel
            orders={salesOrdersQuery.data}
            partners={partnersQuery.data}
            products={productsQuery.data}
            loading={salesOrdersQuery.loading}
            error={salesOrdersQuery.error}
            onRefresh={salesOrdersQuery.reload}
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
            isManager={isManager}
            canCreateEvents={isManager || isWarehouse}
          />
        )}
        {activePanel === 'shipping' && (
          <ShippingPanel
            orders={salesOrdersQuery.data}
            ordersLoading={salesOrdersQuery.loading}
            ordersError={salesOrdersQuery.error}
            onRefreshOrders={salesOrdersQuery.reload}
          />
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
        {activePanel === 'financeDetail' && <FinanceDetailPanel />}
      </main>
    </div>
  );
}

export default App;

function mapProducts(data: ReturnType<typeof useProducts>['data']) {
  if (!data.length) {
    return mockProducts;
  }
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

function mapSalesOrders(data: ReturnType<typeof useSalesOrders>['data']) {
  if (!data.length) {
    return mockOrders;
  }
  return data.map((item) => ({
    id: item.id,
    partner: item.partner_name ?? `客户#${item.partner}`,
    orderNo: item.order_no,
    status: item.status,
    totalAmount: item.total_amount,
    paidAmount: item.paid_amount,
    createdAt: item.created_at,
  }));
}
