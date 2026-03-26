from rest_framework.routers import DefaultRouter
from django.urls import path, include

from .views import (
    PurchaseOrderViewSet,
    SalesOrderViewSet,
    ReceivingLogViewSet,
    ShippingLogViewSet,
    StockAdjustmentViewSet,
    FinancialTransactionViewSet,
    FinancePartnerSummaryView,
    FinancePartnerDetailView,
    CustomerPreferredProductViewSet,
)

router = DefaultRouter()
router.register(r'purchase-orders', PurchaseOrderViewSet, basename='purchase-order')
router.register(r'sales-orders', SalesOrderViewSet, basename='sales-order')
router.register(r'customer-preferred-products', CustomerPreferredProductViewSet, basename='customer-preferred-product')
router.register(r'stock-adjustments', StockAdjustmentViewSet, basename='stock-adjustment')
router.register(r'receiving-logs', ReceivingLogViewSet, basename='receiving-log')
router.register(r'shipping-logs', ShippingLogViewSet, basename='shipping-log')
router.register(r'finance/transactions', FinancialTransactionViewSet, basename='finance-transaction')

urlpatterns = [
    path('', include(router.urls)),
    path('finance/partners/', FinancePartnerSummaryView.as_view(), name='finance-partner-summary'),
    path('finance/partners/<int:partner_id>/', FinancePartnerDetailView.as_view(), name='finance-partner-detail'),
]
