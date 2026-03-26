from decimal import Decimal

from django.contrib.auth.models import User, Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from core.models import Partner, Category, Product
from business.models import (
    SalesOrder, SalesOrderItem, ShippingLog, 
    PurchaseOrder, PurchaseOrderItem, ReceivingLog, FinancialTransaction,
    StockAdjustment, StockLog, CustomerPreferredProduct
)

class FactoryBusinessFlowTest(TestCase):
    def setUp(self):
        """1. 初始化工厂基础档案"""
        # 创建供应商和客户
        self.supplier = Partner.objects.create(name="塑料原料厂", partner_type="SUPPLIER")
        self.customer = Partner.objects.create(name="泰国客户A", partner_type="CUSTOMER")
        
        # 创建产品分类
        self.cat_raw = Category.objects.create(name="原材料", category_type="RAW_MATERIAL")
        self.cat_self = Category.objects.create(name="自产外壳", category_type="SELF_MADE")
        
        # 创建物料：初始库存均为 0
        self.product = Product.objects.create(
            category=self.cat_self,
            internal_code="2026-SH-SD-BK",
            model_name="盾牌外壳黑色",
            stock_quantity=0
        )

    def test_complete_purchase_and_sales_flow(self):
        """测试：采购入库(分批) -> 销售发货(分批) -> 财务余额变动"""

        # --- 第一阶段：采购入库 (入库 10000 个) ---
        po = PurchaseOrder.objects.create(order_no="PO-2026-001", partner=self.supplier, operator="Weaver")
        po_item = PurchaseOrderItem.objects.create(order=po, product=self.product, price=10.0, quantity=10000)

        # 模拟分两批收货：第一批 4000
        ReceivingLog.objects.create(purchase_item=po_item, quantity_received=4000, operator="仓管甲")
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 4000) # 验证库存增加
        
        po.refresh_from_db()
        self.assertEqual(po.status, 'PARTIAL') # 验证状态变为部分入库

        # 第二批收货 6000
        ReceivingLog.objects.create(purchase_item=po_item, quantity_received=6000, operator="仓管乙")
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 10000) # 验证库存补齐
        
        po.refresh_from_db()
        self.assertEqual(po.status, 'RECEIVED') # 验证状态变为全部入库

        # --- 第二阶段：销售发货 (卖出 5000 个) ---
        so = SalesOrder.objects.create(order_no="SO-2026-001", partner=self.customer, operator="Weaver")
        so_item = SalesOrderItem.objects.create(order=so, product=self.product, custom_product_name="外贸定制外壳", price=25.0, quantity=5000)

        # 验证订单总额 Signal：125,000
        so.refresh_from_db()
        self.assertEqual(so.total_amount, Decimal('125000.00'))
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.balance, Decimal('125000.00'))

        # 分两批发货：第一批 2000（库存应保持 10000，不再扣减）
        ShippingLog.objects.create(sales_item=so_item, quantity_shipped=2000, operator="发货员A")
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 10000)

        # 第二批发货 3000，库存仍然维持在 10000
        ShippingLog.objects.create(sales_item=so_item, quantity_shipped=3000, operator="发货员B")
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 10000)
        
        so.refresh_from_db()
        self.assertEqual(so.status, 'COMPLETED') # 验证销售单自动完成

        # --- 第三阶段：财务对账 ---
        # 录入一笔客户回款 -50,000：减少应收
        FinancialTransaction.objects.create(
            partner=self.customer,
            amount=-50000,
            transaction_type=FinancialTransaction.TransactionType.PAYMENT,
            note="首付款",
            operator="财务",
        )
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.balance, Decimal('75000.00'))


class StockAdjustmentTest(TestCase):
    def setUp(self):
        self.cat = Category.objects.create(name="自产外壳", category_type="SELF_MADE")
        self.product = Product.objects.create(
            category=self.cat,
            internal_code="ADJ-001",
            model_name="调整用物料",
            stock_quantity=0
        )

    def test_manual_adjustments_update_stock_and_logs(self):
        StockAdjustment.objects.create(
            product=self.product,
            adjustment_type='MANUAL_IN',
            quantity=Decimal('120.5'),
            operator="仓库调账",
            note="盘盈"
        )
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, Decimal('120.5'))
        log = StockLog.objects.filter(product=self.product).order_by('-created_at').first()
        self.assertEqual(log.change_quantity, Decimal('120.5'))
        self.assertEqual(log.log_type, 'ADJUST')

        StockAdjustment.objects.create(
            product=self.product,
            adjustment_type='MANUAL_OUT',
            quantity=Decimal('20.5'),
            operator="仓库调账",
            note="盘亏"
        )
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, Decimal('100.0'))

    def test_production_adjustment_uses_produce_log_type(self):
        StockAdjustment.objects.create(
            product=self.product,
            adjustment_type='PRODUCE_IN',
            quantity=Decimal('50'),
            operator="生产入库",
            note="首批机加"
        )
        log = StockLog.objects.filter(product=self.product).order_by('-created_at').first()
        self.assertEqual(log.log_type, 'PRODUCE')


class BusinessAPITest(APITestCase):
    def setUp(self):
        for name in ['manager', 'warehouse', 'shipper']:
            Group.objects.get_or_create(name=name)

        self.default_password = 'pass123'
        self.manager = self._create_user('manager_user', 'manager')
        self.warehouse = self._create_user('warehouse_user', 'warehouse')
        self.shipper = self._create_user('shipper_user', 'shipper')

        self.supplier = Partner.objects.create(name="API 供应商", partner_type="SUPPLIER")
        self.customer = Partner.objects.create(name="API 客户", partner_type="CUSTOMER")
        self.category = Category.objects.create(name="API 分类", category_type="SELF_MADE")
        self.product = Product.objects.create(
            category=self.category,
            internal_code="API-PROD",
            model_name="API 产品",
            stock_quantity=0
        )

        self.sales_order = SalesOrder.objects.create(order_no="SO-API-1", partner=self.customer, operator="Boss", total_amount=Decimal('1000'), paid_amount=Decimal('200'))
        self.sales_item = SalesOrderItem.objects.create(
            order=self.sales_order,
            product=self.product,
            custom_product_name="API 商品",
            detail_description="描述：线长50",
            price=Decimal('20.00'),
            quantity=Decimal('100')
        )

        self.purchase_order = PurchaseOrder.objects.create(
            order_no="PO-API-1",
            partner=self.supplier,
            operator="Boss",
            total_amount=Decimal('500'),
            paid_amount=Decimal('150')
        )

        FinancialTransaction.objects.create(
            partner=self.customer,
            amount=Decimal('-300'),
            transaction_type=FinancialTransaction.TransactionType.PAYMENT,
            note="客户付款",
            operator="财务",
        )
        FinancialTransaction.objects.create(
            partner=self.supplier,
            amount=Decimal('-100'),
            transaction_type=FinancialTransaction.TransactionType.PAYMENT,
            note="支付供应商",
            operator="财务",
        )

    def _create_user(self, username, group_name):
        user = User.objects.create_user(username=username, password=self.default_password)
        group = Group.objects.get(name=group_name)
        user.groups.add(group)
        return user

    def _authenticate(self, user):
        self.client.credentials()
        resp = self.client.post('/api/token/', {
            'username': user.username,
            'password': self.default_password
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        token = resp.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_purchase_order_amount_mask_for_warehouse(self):
        payload = {
            "order_no": "PO-API-001",
            "partner": self.supplier.id,
            "operator": "Boss",
            "items_payload": [
                {"product": self.product.id, "price": "12.50", "quantity": "10"}
            ]
        }

        self._authenticate(self.manager)
        resp = self.client.post('/api/business/purchase-orders/', payload, format='json')
        self.assertEqual(resp.status_code, 201)

        self._authenticate(self.manager)
        resp_manager = self.client.get('/api/business/purchase-orders/')
        self.assertEqual(resp_manager.status_code, 200)
        manager_rows = resp_manager.data['results'] if isinstance(resp_manager.data, dict) else resp_manager.data
        self.assertEqual(manager_rows[0]['total_amount'], '125.00')
        self.assertEqual(manager_rows[0]['items'][0]['price'], '12.50')
        today = timezone.now().date().isoformat()
        resp_filtered = self.client.get(f'/api/business/purchase-orders/?status=ORDERED&order_no=PO-API-001&created_from={today}')
        filtered_rows = resp_filtered.data['results'] if isinstance(resp_filtered.data, dict) else resp_filtered.data
        self.assertEqual(len(filtered_rows), 1)

        self._authenticate(self.warehouse)
        resp_wh = self.client.get('/api/business/purchase-orders/')
        self.assertEqual(resp_wh.status_code, 200)
        wh_rows = resp_wh.data['results'] if isinstance(resp_wh.data, dict) else resp_wh.data
        self.assertIsNone(wh_rows[0]['total_amount'])
        self.assertIsNone(wh_rows[0]['items'][0]['price'])

        self._authenticate(self.shipper)
        resp_ship = self.client.get('/api/business/purchase-orders/')
        self.assertEqual(resp_ship.status_code, 403)

    def test_stock_adjustment_creation_by_warehouse(self):
        payload = {
            "product": self.product.id,
            "adjustment_type": "MANUAL_IN",
            "quantity": "25",
            "note": "盘盈"
        }

        self._authenticate(self.warehouse)
        resp = self.client.post('/api/business/stock-adjustments/', payload, format='json')
        self.assertEqual(resp.status_code, 201)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, Decimal('25'))

        resp_list = self.client.get('/api/business/stock-adjustments/?product=%s' % self.product.id)
        self.assertEqual(resp_list.status_code, 200)
        adj_rows = resp_list.data['results'] if isinstance(resp_list.data, dict) else resp_list.data
        self.assertEqual(len(adj_rows), 1)

    def test_shipping_log_requires_shipper_or_manager(self):
        payload = {
            "sales_item": self.sales_item.id,
            "quantity_shipped": "30",
            "tracking_no": "TRACK123"
        }

        self._authenticate(self.warehouse)
        resp = self.client.post('/api/business/shipping-logs/', payload, format='json')
        self.assertEqual(resp.status_code, 403)

        self._authenticate(self.shipper)
        resp_ship = self.client.post('/api/business/shipping-logs/', payload, format='json')
        self.assertEqual(resp_ship.status_code, 201)

        shipped_today = timezone.now().date().isoformat()
        resp_list = self.client.get(f'/api/business/shipping-logs/?sales_order={self.sales_order.id}&shipped_from={shipped_today}')
        self.assertEqual(resp_list.status_code, 200)
        shipping_rows = resp_list.data['results'] if isinstance(resp_list.data, dict) else resp_list.data
        self.assertEqual(len(shipping_rows), 1)

    def test_sales_order_filters(self):
        self._authenticate(self.manager)
        today = timezone.now().date().isoformat()
        resp = self.client.get(f'/api/business/sales-orders/?status=ORDERED&order_no=SO-API&created_from={today}')
        self.assertEqual(resp.status_code, 200)
        sales_rows = resp.data['results'] if isinstance(resp.data, dict) else resp.data
        self.assertGreaterEqual(len(sales_rows), 1)

    def test_sales_order_item_detail_description_persists(self):
        payload = {
            'order_no': 'SO-API-NEW',
            'partner': self.customer.id,
            'items_payload': [
                {
                    'product': self.product.id,
                    'custom_product_name': '客户型号A',
                    'detail_description': '线长120cm, 定标50',
                    'price': '18.50',
                    'quantity': '80'
                }
            ]
        }

        self._authenticate(self.manager)
        resp = self.client.post('/api/business/sales-orders/', payload, format='json')
        self.assertEqual(resp.status_code, 201)
        order_id = resp.data['id']

        detail_resp = self.client.get(f'/api/business/sales-orders/{order_id}/')
        self.assertEqual(detail_resp.status_code, 200)
        items = detail_resp.data['items']
        self.assertEqual(items[0]['detail_description'], '线长120cm, 定标50')

    def test_customer_preferred_product_api(self):
        CustomerPreferredProduct.objects.create(partner=self.customer, name='旧型号1')

        self._authenticate(self.manager)
        list_resp = self.client.get(f'/api/business/customer-preferred-products/?partner={self.customer.id}')
        self.assertEqual(list_resp.status_code, 200)
        rows = list_resp.data['results'] if isinstance(list_resp.data, dict) else list_resp.data
        self.assertGreaterEqual(len(rows), 1)

        create_payload = {'partner': self.customer.id, 'name': '新型号X'}
        create_resp = self.client.post('/api/business/customer-preferred-products/', create_payload, format='json')
        self.assertEqual(create_resp.status_code, 201)

        self._authenticate(self.shipper)
        shipper_resp = self.client.get(f'/api/business/customer-preferred-products/?partner={self.customer.id}')
        self.assertEqual(shipper_resp.status_code, 200)

        shipper_create = self.client.post('/api/business/customer-preferred-products/', create_payload, format='json')
        self.assertEqual(shipper_create.status_code, 403)

    def test_sales_order_event_creation(self):
        self._authenticate(self.manager)
        payload = {'event_type': 'REMARK', 'content': '客户反馈需提前备货'}
        resp = self.client.post(f'/api/business/sales-orders/{self.sales_order.id}/events/', payload, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['event_type'], 'REMARK')

    def test_purchase_order_event_creation(self):
        po = PurchaseOrder.objects.create(order_no="PO-EVENT", partner=self.supplier, operator="Boss")
        self._authenticate(self.manager)
        payload = {'event_type': 'REMARK', 'content': '供应商确认备货'}
        resp = self.client.post(f'/api/business/purchase-orders/{po.id}/events/', payload, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_receiving_log_listing_filter(self):
        po = PurchaseOrder.objects.create(order_no="PO-API-LIST", partner=self.supplier, operator="Boss")
        po_item = PurchaseOrderItem.objects.create(order=po, product=self.product, price=Decimal('10'), quantity=Decimal('50'))
        ReceivingLog.objects.create(purchase_item=po_item, quantity_received=Decimal('10'), operator="WH")

        self._authenticate(self.warehouse)
        today = timezone.now().date().isoformat()
        resp = self.client.get(f'/api/business/receiving-logs/?purchase_order={po.id}&received_from={today}')
        self.assertEqual(resp.status_code, 200)
        recv_rows = resp.data['results'] if isinstance(resp.data, dict) else resp.data
        self.assertEqual(len(recv_rows), 1)

    def test_finance_receivable_summary_and_detail(self):
        self._authenticate(self.manager)
        resp = self.client.get('/api/business/finance/partners/?type=receivable')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('results', resp.data)
        summary_payload = resp.data['results']
        self.assertEqual(summary_payload['type'], 'receivable')
        self.assertGreater(Decimal(summary_payload['total_outstanding']), Decimal('0'))
        self.assertGreater(len(summary_payload['partners']), 0)

        detail = self.client.get(f'/api/business/finance/partners/{self.customer.id}/?type=receivable')
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data['partner_id'], self.customer.id)
        self.assertGreaterEqual(len(detail.data['orders']), 1)
        self.assertGreaterEqual(len(detail.data['transactions']), 1)

    def test_finance_payable_summary_and_detail(self):
        self._authenticate(self.manager)
        resp = self.client.get('/api/business/finance/partners/?type=payable')
        self.assertEqual(resp.status_code, 200)
        summary_payload = resp.data['results']
        self.assertEqual(summary_payload['type'], 'payable')
        self.assertGreaterEqual(len(summary_payload['partners']), 1)

        detail = self.client.get(f'/api/business/finance/partners/{self.supplier.id}/?type=payable')
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data['partner_id'], self.supplier.id)
        self.assertGreaterEqual(len(detail.data['orders']), 1)

    def test_financial_transaction_api(self):
        self._authenticate(self.manager)
        payload = {
            'partner': self.customer.id,
            'amount': '150.00',
            'note': '追加收款'
        }
        resp = self.client.post('/api/business/finance/transactions/', payload, format='json')
        self.assertEqual(resp.status_code, 201)

        list_resp = self.client.get(f'/api/business/finance/transactions/?partner={self.customer.id}')
        self.assertEqual(list_resp.status_code, 200)
        tx_rows = list_resp.data['results'] if isinstance(list_resp.data, dict) else list_resp.data
        self.assertGreaterEqual(len(tx_rows), 1)

        self._authenticate(self.warehouse)
        resp_forbidden = self.client.post('/api/business/finance/transactions/', payload, format='json')
        self.assertEqual(resp_forbidden.status_code, 403)
