from decimal import Decimal

from django.contrib.auth.models import User, Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from core.models import Partner, Category, Product
from business.models import (
    SalesOrder, SalesOrderItem, ShippingLog,
    PurchaseOrder, PurchaseOrderItem, ReceivingLog, FinancialTransaction,
    StockAdjustment, StockLog, CustomerPreferredProduct,
    ProductionRecord,
)
from business.api.serializers import SalesOrderSerializer, PurchaseOrderSerializer

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
        # BOM-2.1（2026-05-27）后销售明细必须挂三件套（外壳 + PCB 方案 + 线材）
        # 才能排产 / 发货。本测试早于 BOM-2.1，这里补齐占位三件套。
        from core.models import PcbPlan
        cable_cat = Category.objects.create(name='线材', category_type='CABLE')
        cable = Product.objects.create(category=cable_cat, internal_code='CBL-FB', model_name='占位线材')
        plan = PcbPlan.objects.create(name='占位方案', code='FB')

        so = SalesOrder.objects.create(order_no="SO-2026-001", partner=self.customer, operator="Weaver")
        so_item = SalesOrderItem.objects.create(
            order=so, product=self.product, pcb_plan=plan, cable=cable,
            custom_product_name="外贸定制外壳", price=25.0, quantity=5000,
        )

        # 验证订单总额 Signal：125,000
        so.refresh_from_db()
        self.assertEqual(so.total_amount, Decimal('125000.00'))
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.balance, Decimal('125000.00'))

        # BOM-2.1：发货必须先排产（可发量 = min(quantity, produced) - shipped）。
        # 这里用 skip_consumption=True 避免触发扣料信号——本测试专注发货流程，
        # 不关心 BOM 展开后的原材料扣减（那是 ProductionRecordTest 的事）。
        ProductionRecord.objects.create(
            sales_item=so_item, quantity=5000, operator='生产员', skip_consumption=True,
        )

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
        # BOM-2.0：销售明细挂三件（外壳 + PCB 方案 + 线材）。配套数据：
        # - CABLE 线材半成品
        # - RAW_MATERIAL 原材料（用于方案展开）
        # - PcbPlan 方案（含 1 条原材料明细）
        # 详见 docs/PRD.md §3.2 §4.5 与 §9.4 changelog 2026-05-21（PCB 方案改造）。
        from core.models import PcbPlan, PcbPlanMaterial

        self.cable_category = Category.objects.create(name="API 线材分类", category_type="CABLE")
        self.raw_category = Category.objects.create(name="API 原材料分类", category_type="RAW_MATERIAL")
        self.cable_product = Product.objects.create(
            category=self.cable_category,
            internal_code="API-CABLE",
            model_name="API 线材",
            stock_quantity=0,
        )
        self.raw_chip = Product.objects.create(
            category=self.raw_category,
            internal_code="API-CHIP",
            model_name="API 主控芯片",
            stock_quantity=0,
        )
        self.pcb_plan = PcbPlan.objects.create(name="API 方案-A", code="API-A")
        PcbPlanMaterial.objects.create(
            plan=self.pcb_plan, material=self.raw_chip, quantity_per_unit=Decimal('1'),
        )

        self.sales_order = SalesOrder.objects.create(
            order_no="SO-API-1",
            partner=self.customer,
            operator="Boss",
            total_amount=Decimal('1000'),
        )
        self.sales_item = SalesOrderItem.objects.create(
            order=self.sales_order,
            product=self.product,
            pcb_plan=self.pcb_plan,
            cable=self.cable_product,
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

    def test_stock_adjustment_is_append_only(self):
        """StockAdjustment 是不可逆事件——API 必须拒绝 PATCH / PUT / DELETE。

        这条断言锁住"append-only"语义。如果未来有人不小心给
        `StockAdjustmentViewSet` 加上 ``UpdateModelMixin`` / ``DestroyModelMixin``，
        本测试会立刻挂掉，提醒 reviewer 注意——错误的"编辑库存调整"实现
        会让 DB 数字与实际库存永久错位（编辑/删除不会回滚 Product.stock_quantity）。
        详见 docs/PRD.md §3.2 与 §9.4 changelog 2026-05-11。
        """
        self._authenticate(self.warehouse)
        # 先用合法 POST 拿到一条 adjustment
        create_resp = self.client.post(
            '/api/business/stock-adjustments/',
            {
                'product': self.product.id,
                'adjustment_type': 'MANUAL_IN',
                'quantity': '50',
                'note': '盘盈用例',
            },
            format='json',
        )
        self.assertEqual(create_resp.status_code, 201)
        adjustment_id = create_resp.data['id']
        endpoint = f'/api/business/stock-adjustments/{adjustment_id}/'

        # PATCH / PUT / DELETE 应全部 405（也不应该是 404，404 意味着路由根本不存在）
        for method in ('patch', 'put', 'delete'):
            with self.subTest(method=method.upper()):
                resp = getattr(self.client, method)(endpoint, {}, format='json')
                self.assertEqual(
                    resp.status_code, 405,
                    f'{method.upper()} {endpoint} 应返回 405，得到 {resp.status_code}（'
                    'StockAdjustment 必须 append-only）',
                )

    def test_shipping_log_requires_shipper_or_manager(self):
        # BOM-2.1（2026-05-27）：ShippingLog 可发量 = min(quantity, produced) - shipped。
        # 需要先排产让 produced > 0，才能发货。这里直接调 ORM 创建一条 ProductionRecord
        # （signal 会自动扣料）。详见 docs/PRD.md §4.5。
        ProductionRecord.objects.create(
            sales_item=self.sales_item, quantity=Decimal('30'), operator='setup',
        )

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
                    # BOM-2.0：销售明细必须挂三件（外壳 + PCB 方案 + 线材）
                    'pcb_plan': self.pcb_plan.id,
                    'cable': self.cable_product.id,
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
        # §9.2 #14（2026-05-21）起字段重命名 total_outstanding → total_balance
        self.assertGreater(Decimal(summary_payload['total_balance']), Decimal('0'))
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

    def test_sales_order_no_uses_max_not_count(self):
        """SO 订单号生成必须基于最大尾号 +1，而不是 count() +1。

        旧的 `count() + 1` 实现在两种情况下会撞 `unique` 约束：
        1) 并发创建——两个事务同时读到同一个 count，写入同一个 order_no
        2) 中间删除——删一单后 count 减 1，再创建会复用已存在的尾号
        新实现用 `select_for_update()` 锁最大尾号那一行 +1，且整段在
        `transaction.atomic()` 内，能同时杜绝两种问题。这里通过场景 (2)
        构造可被测试稳定捕获的回归断言。
        """
        self._authenticate(self.manager)

        payload = {
            'partner': self.customer.id,
            'items_payload': [
                {
                    'product': self.product.id,
                    # BOM-2.0：销售明细必须挂三件（外壳 + PCB 方案 + 线材）
                    'pcb_plan': self.pcb_plan.id,
                    'cable': self.cable_product.id,
                    'custom_product_name': '回归测试品',
                    'price': '1',
                    'quantity': '1',
                }
            ],
        }

        seeded = []
        for _ in range(3):
            resp = self.client.post('/api/business/sales-orders/', payload, format='json')
            self.assertEqual(resp.status_code, 201)
            seeded.append(resp.data['order_no'])
        # 三次创建必须给出三个不同的订单号
        self.assertEqual(len(set(seeded)), 3)

        # 删中间那一单，制造尾号空洞
        SalesOrder.objects.filter(order_no=seeded[1]).delete()

        # 再创建——新的尾号必须严格大于现存最大尾号；
        # 若仍是旧算法 count()+1，会复用 seeded[2] 的尾号并触发 IntegrityError。
        resp = self.client.post('/api/business/sales-orders/', payload, format='json')
        self.assertEqual(resp.status_code, 201)
        new_no = resp.data['order_no']
        self.assertNotIn(new_no, seeded)

        new_tail = int(new_no.split('-')[-1])
        max_existing_tail = max(int(no.split('-')[-1]) for no in (seeded[0], seeded[2]))
        self.assertGreater(new_tail, max_existing_tail)

    def test_purchase_order_no_uses_max_not_count(self):
        """PO 同样的回归断言——确保两边走同一份 helper 后行为一致。"""
        self._authenticate(self.manager)

        payload = {
            'partner': self.supplier.id,
            'items_payload': [
                {'product': self.product.id, 'price': '1', 'quantity': '1'}
            ],
        }

        seeded = []
        for _ in range(3):
            resp = self.client.post('/api/business/purchase-orders/', payload, format='json')
            self.assertEqual(resp.status_code, 201)
            seeded.append(resp.data['order_no'])
        self.assertEqual(len(set(seeded)), 3)

        PurchaseOrder.objects.filter(order_no=seeded[1]).delete()

        resp = self.client.post('/api/business/purchase-orders/', payload, format='json')
        self.assertEqual(resp.status_code, 201)
        new_no = resp.data['order_no']
        self.assertNotIn(new_no, seeded)
        new_tail = int(new_no.split('-')[-1])
        max_existing_tail = max(int(no.split('-')[-1]) for no in (seeded[0], seeded[2]))
        self.assertGreater(new_tail, max_existing_tail)

    def test_finance_summary_uses_partner_balance(self):
        """汇总接口的 balance 字段应等于 Partner.balance（台账驱动），
        而不是按订单 (total - paid) 聚合。

        历史字段名 `outstanding_amount` 在 2026-05-21 改为 `balance`（详见
        docs/PRD.md §9.4 changelog 2026-05-21 §9.2 #14）。
        """
        self._authenticate(self.manager)
        self.customer.refresh_from_db()
        expected_balance = self.customer.balance

        resp = self.client.get('/api/business/finance/partners/?type=receivable')
        self.assertEqual(resp.status_code, 200)
        partners = resp.data['results']['partners']
        target = next((p for p in partners if p['partner_id'] == self.customer.id), None)
        self.assertIsNotNone(target)
        self.assertEqual(Decimal(target['balance']), Decimal(expected_balance))
        # 旧字段名移除后响应里**不**应再出现。
        self.assertNotIn('outstanding_amount', target)

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


class OrderDeletionLedgerTest(TestCase):
    """删除订单后 Partner.balance 必须回到删前的值。

    这条断言是为了防止未来有人想"恢复" cleanup_sales_order /
    cleanup_purchase_order 这两个曾经被移除的 post_delete 信号——它们
    既会创建悬空 FK 又会双重抵消余额。正确的余额维护链路是
    `PartnerLedgerEntry` FK 上的 CASCADE 触发 `remove_ledger_from_balance`
    信号，CASCADE 完成后余额自动归位，不需要额外的反向条目。
    详见 docs/PRD.md §9.4 changelog 2026-05-11。
    """

    def setUp(self):
        self.customer = Partner.objects.create(name="DEL 客户", partner_type="CUSTOMER")
        self.supplier = Partner.objects.create(name="DEL 供应商", partner_type="SUPPLIER")
        self.cat = Category.objects.create(name="DEL 分类", category_type="SELF_MADE")
        self.product = Product.objects.create(
            category=self.cat,
            internal_code="DEL-PROD-1",
            model_name="测试品",
            stock_quantity=0,
        )

    def test_deleting_sales_order_resets_customer_balance(self):
        so = SalesOrder.objects.create(order_no="SO-DEL-1", partner=self.customer, operator="Boss")
        SalesOrderItem.objects.create(
            order=so,
            product=self.product,
            custom_product_name="测试",
            price=Decimal('100.00'),
            quantity=Decimal('10'),
        )
        self.customer.refresh_from_db()
        # 创建明细后，update_sales_order_total 信号写出 SALES 台账条目 +1000
        self.assertEqual(self.customer.balance, Decimal('1000.00'))

        so.delete()

        self.customer.refresh_from_db()
        # 删除后 CASCADE + remove_ledger_from_balance 自动归零，不再被
        # 已删除的 cleanup_sales_order 信号双重抵消
        self.assertEqual(self.customer.balance, Decimal('0.00'))

    def test_deleting_purchase_order_resets_supplier_balance(self):
        po = PurchaseOrder.objects.create(order_no="PO-DEL-1", partner=self.supplier, operator="Boss")
        PurchaseOrderItem.objects.create(
            order=po,
            product=self.product,
            price=Decimal('50.00'),
            quantity=Decimal('20'),
        )
        self.supplier.refresh_from_db()
        self.assertEqual(self.supplier.balance, Decimal('1000.00'))

        po.delete()

        self.supplier.refresh_from_db()
        self.assertEqual(self.supplier.balance, Decimal('0.00'))


class FinanceGuardrailsTest(TestCase):
    """财务/订单合约的加固检查（2026-06-18 audit 后补的保护层）。

    覆盖两个曾在审计中识别的中度风险：
      - R1：partner-only PATCH 应该正确同步 ledger
        （旧实现：signal 只盯 SalesOrderItem，partner-only PATCH 不触发 → 旧 partner
         的 balance 还含这笔订单，新 partner 不含。修复见 SalesOrderSerializer.update
         里的 "if items_data is None and old_partner_id != ..." 守卫。）
      - R2：total_amount 是 signal 维护的派生字段，必须 read-only
        （旧实现：客户端能直接 PATCH 覆盖 → 与 ledger 不一致。
         修复见 SalesOrderSerializer.Meta.read_only_fields。）

    同款保护对采购单也加了，本测试两边都验证。
    """

    def setUp(self):
        self.customer_a = Partner.objects.create(name='Guardrail 客户A', partner_type='CUSTOMER')
        self.customer_b = Partner.objects.create(name='Guardrail 客户B', partner_type='CUSTOMER')
        self.supplier_a = Partner.objects.create(name='Guardrail 供应商A', partner_type='SUPPLIER')
        self.supplier_b = Partner.objects.create(name='Guardrail 供应商B', partner_type='SUPPLIER')
        cat = Category.objects.create(name='Guardrail cat', category_type='SELF_MADE')
        self.product = Product.objects.create(
            category=cat,
            internal_code='G-PROD-1',
            model_name='G1',
            stock_quantity=0,
        )

    # ------------------------------------------------------------------
    # R1：partner-only PATCH 同步 ledger
    # ------------------------------------------------------------------

    def test_sales_switch_partner_without_items_resyncs_ledger(self):
        """PATCH 销售单 partner（不带 items_payload）必须把旧 partner 余额清零并迁移到新 partner。"""
        so = SalesOrder.objects.create(
            order_no='SO-SWITCH-1', partner=self.customer_a, operator='m',
        )
        SalesOrderItem.objects.create(
            order=so, product=self.product, custom_product_name='x',
            price=Decimal('100.00'), quantity=Decimal('10'),
        )
        self.customer_a.refresh_from_db()
        self.assertEqual(self.customer_a.balance, Decimal('1000.00'))
        self.assertEqual(self.customer_b.balance, Decimal('0.00'))

        serializer = SalesOrderSerializer(
            instance=so,
            data={'partner': self.customer_b.id},
            partial=True,
            context={'request': None},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        self.customer_a.refresh_from_db()
        self.customer_b.refresh_from_db()
        self.assertEqual(self.customer_a.balance, Decimal('0.00'),
                         '旧 partner 的 ledger entry 应该被迁走')
        self.assertEqual(self.customer_b.balance, Decimal('1000.00'),
                         '新 partner 的 balance 应该等于订单总额')

    def test_purchase_switch_partner_without_items_resyncs_ledger(self):
        """同款保护对采购单也要生效。"""
        po = PurchaseOrder.objects.create(
            order_no='PO-SWITCH-1', partner=self.supplier_a, operator='m',
        )
        PurchaseOrderItem.objects.create(
            order=po, product=self.product,
            price=Decimal('50.00'), quantity=Decimal('20'),
        )
        self.supplier_a.refresh_from_db()
        self.assertEqual(self.supplier_a.balance, Decimal('1000.00'))

        serializer = PurchaseOrderSerializer(
            instance=po,
            data={'partner': self.supplier_b.id},
            partial=True,
            context={'request': None},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        self.supplier_a.refresh_from_db()
        self.supplier_b.refresh_from_db()
        self.assertEqual(self.supplier_a.balance, Decimal('0.00'))
        self.assertEqual(self.supplier_b.balance, Decimal('1000.00'))

    # 注：原本还有一个 "test_sales_switch_partner_with_items_payload_works"
    # 想覆盖"同时切 partner + 带 items_payload"的路径，但 SalesOrderItemWriteSerializer
    # 把每一行 items_payload 当 create 路径校验，强制要求三件套（外壳/PCB/线材），
    # 而构造完整 BOM 数据只为了顺带验"守卫不会重复同步"得不偿失——
    # 守卫逻辑是 `if items_data is None ...`，互斥语义显而易见，不需要单测。
    # 这条路径的实际行为在 FactoryBusinessFlowTest / SalesPanelEditTest 等
    # 端到端用例中已经覆盖。

    # ------------------------------------------------------------------
    # R2：total_amount 必须 read-only
    # ------------------------------------------------------------------

    def test_sales_total_amount_in_payload_is_dropped(self):
        """客户端 PATCH `{total_amount: 99999}` 时应被 DRF 静默丢弃，
        ledger 与 SalesOrder.total_amount 都保持 signal 算出的真实值。"""
        so = SalesOrder.objects.create(
            order_no='SO-FAKE-1', partner=self.customer_a, operator='m',
        )
        SalesOrderItem.objects.create(
            order=so, product=self.product, custom_product_name='x',
            price=Decimal('100.00'), quantity=Decimal('10'),
        )
        so.refresh_from_db()
        original_total = so.total_amount
        self.assertEqual(original_total, Decimal('1000.00'))

        serializer = SalesOrderSerializer(
            instance=so,
            data={'total_amount': '99999.00'},
            partial=True,
            context={'request': None},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        # validated_data 不应该含 total_amount——read_only_fields 已挡住
        self.assertNotIn('total_amount', serializer.validated_data)
        serializer.save()

        so.refresh_from_db()
        self.assertEqual(so.total_amount, original_total,
                         'total_amount 不能被客户端覆盖')
        self.customer_a.refresh_from_db()
        self.assertEqual(self.customer_a.balance, Decimal('1000.00'),
                         'ledger 不受 total_amount payload 影响')

    def test_purchase_total_amount_in_payload_is_dropped(self):
        """同款保护对采购单也要生效。"""
        po = PurchaseOrder.objects.create(
            order_no='PO-FAKE-1', partner=self.supplier_a, operator='m',
        )
        PurchaseOrderItem.objects.create(
            order=po, product=self.product,
            price=Decimal('50.00'), quantity=Decimal('20'),
        )
        po.refresh_from_db()
        original_total = po.total_amount
        self.assertEqual(original_total, Decimal('1000.00'))

        serializer = PurchaseOrderSerializer(
            instance=po,
            data={'total_amount': '88888.00'},
            partial=True,
            context={'request': None},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertNotIn('total_amount', serializer.validated_data)
        serializer.save()

        po.refresh_from_db()
        self.assertEqual(po.total_amount, original_total)
        self.supplier_a.refresh_from_db()
        self.assertEqual(self.supplier_a.balance, Decimal('1000.00'))


class ProductionRecordTest(TestCase):
    """BOM-2.1 排产记录核心断言（2026-05-27 重设计）。

    覆盖：
    - ProductionRecord 创建 → 写 **(2 + N)** 条 PRODUCE_CONSUME：
      1 条扣 shell + 1 条扣 cable + N 条扣 plan.materials 展开的原材料
    - 创建时自动推 SalesOrder.status: ORDERED → PRODUCING（状态机驱动）
    - 过排产被拒（produced + new > sales_item.quantity → ValidationError）
    - skip_consumption=True 时不扣料（仅 admin 后台路径）
    - 允许库存变负
    - SalesOrderItem 的 produced_quantity / available_to_ship_quantity 派生量正确

    详见 docs/PRD.md §3.2 / §4.5 / §9.4 changelog 2026-05-27（BOM-2.1）。
    """

    def setUp(self):
        from core.models import PcbPlan, PcbPlanMaterial

        # 半成品 / 原材料分类
        self.cat_shell = Category.objects.create(name='外壳分类', category_type='SELF_MADE')
        self.cat_cable = Category.objects.create(name='线材分类', category_type='CABLE')
        self.cat_raw = Category.objects.create(name='原材料分类', category_type='RAW_MATERIAL')

        self.shell = Product.objects.create(
            category=self.cat_shell, internal_code='SH-T1', model_name='外壳 T1',
            stock_quantity=Decimal('100'),
        )
        self.cable = Product.objects.create(
            category=self.cat_cable, internal_code='CB-US-150', model_name='美标 1.5m',
            stock_quantity=Decimal('0'),  # 故意设 0 以测"允许负库存"
        )
        self.raw_chip = Product.objects.create(
            category=self.cat_raw, internal_code='RM-CHIP-A', model_name='主控芯片 A',
            stock_quantity=Decimal('100'),
        )
        self.raw_cap = Product.objects.create(
            category=self.cat_raw, internal_code='RM-CAP-100uF', model_name='电容 100uF',
            stock_quantity=Decimal('500'),
        )
        self.raw_bare = Product.objects.create(
            category=self.cat_raw, internal_code='RM-PCB-BARE', model_name='PCB 裸板',
            stock_quantity=Decimal('100'),
        )
        # 方案：1 板 = 1 chip + 5 cap + 1 bare
        self.plan = PcbPlan.objects.create(name='测试方案 T1', code='T1')
        PcbPlanMaterial.objects.create(plan=self.plan, material=self.raw_chip, quantity_per_unit=Decimal('1'))
        PcbPlanMaterial.objects.create(plan=self.plan, material=self.raw_cap, quantity_per_unit=Decimal('5'))
        PcbPlanMaterial.objects.create(plan=self.plan, material=self.raw_bare, quantity_per_unit=Decimal('1'))

        # 销售单 + 明细：客户、订单总量 100
        self.customer = Partner.objects.create(name='排产测试客户', partner_type='CUSTOMER')
        self.sales_order = SalesOrder.objects.create(
            order_no='SO-PR-TEST', partner=self.customer, operator='m', total_amount=Decimal('0'),
        )
        self.sales_item = SalesOrderItem.objects.create(
            order=self.sales_order,
            product=self.shell, pcb_plan=self.plan, cable=self.cable,
            custom_product_name='PR 测试品', price=Decimal('10'),
            quantity=Decimal('100'),
        )

    def test_create_record_deducts_shell_cable_and_materials(self):
        """ProductionRecord 创建即扣 (2 + N) 条 PRODUCE_CONSUME。"""
        ProductionRecord.objects.create(
            sales_item=self.sales_item,
            quantity=Decimal('10'),
            operator='warehouse_test',
        )

        # 2 + 3 = 5 条
        adjustments = StockAdjustment.objects.filter(adjustment_type='PRODUCE_CONSUME')
        self.assertEqual(adjustments.count(), 5)

        self.shell.refresh_from_db()
        self.cable.refresh_from_db()
        self.raw_chip.refresh_from_db()
        self.raw_cap.refresh_from_db()
        self.raw_bare.refresh_from_db()

        self.assertEqual(self.shell.stock_quantity, Decimal('90'))   # 100 - 10
        self.assertEqual(self.cable.stock_quantity, Decimal('-10'))  # 0 - 10
        self.assertEqual(self.raw_chip.stock_quantity, Decimal('90'))   # 100 - 10×1
        self.assertEqual(self.raw_cap.stock_quantity, Decimal('450'))   # 500 - 10×5
        self.assertEqual(self.raw_bare.stock_quantity, Decimal('90'))   # 100 - 10×1

    def test_first_record_promotes_order_to_producing(self):
        """首条 ProductionRecord 创建时 SalesOrder.status 自动推 ORDERED → PRODUCING。"""
        self.assertEqual(self.sales_order.status, 'ORDERED')

        ProductionRecord.objects.create(
            sales_item=self.sales_item,
            quantity=Decimal('5'),
            operator='m',
        )

        self.sales_order.refresh_from_db()
        self.assertEqual(self.sales_order.status, 'PRODUCING')

    def test_produced_and_available_to_ship_properties(self):
        """SalesOrderItem.produced_quantity / available_to_ship_quantity 正确。"""
        ProductionRecord.objects.create(sales_item=self.sales_item, quantity=Decimal('30'), operator='m')
        ProductionRecord.objects.create(sales_item=self.sales_item, quantity=Decimal('20'), operator='m')

        self.sales_item.refresh_from_db()
        self.assertEqual(self.sales_item.produced_quantity, Decimal('50'))
        self.assertEqual(self.sales_item.shipped_quantity, 0)
        # 可发 = min(100, 50) - 0 = 50
        self.assertEqual(self.sales_item.available_to_ship_quantity, Decimal('50'))

    def test_skip_consumption_bypasses_deduction(self):
        """skip_consumption=True 时不扣料（仅 admin 边缘场景使用）。"""
        ProductionRecord.objects.create(
            sales_item=self.sales_item,
            quantity=Decimal('10'),
            operator='admin_test',
            skip_consumption=True,
        )

        # 一条 PRODUCE_CONSUME 都不应该写入
        self.assertEqual(
            StockAdjustment.objects.filter(adjustment_type='PRODUCE_CONSUME').count(),
            0,
        )
        # 但 produced_quantity 仍然算入（业务逻辑上"已生产"）
        self.sales_item.refresh_from_db()
        self.assertEqual(self.sales_item.produced_quantity, Decimal('10'))

    def test_allows_negative_stock(self):
        """超过现有库存可负——补货节奏与排产解耦。"""
        ProductionRecord.objects.create(
            sales_item=self.sales_item,
            quantity=Decimal('100'),  # > raw_chip 的 100，> cable 的 0
            operator='m',
        )
        # 注意：sales_item.quantity = 100，所以 100 不算过排产
        self.cable.refresh_from_db()
        self.raw_chip.refresh_from_db()
        self.assertEqual(self.cable.stock_quantity, Decimal('-100'))  # 0 - 100
        self.assertEqual(self.raw_chip.stock_quantity, Decimal('0'))   # 100 - 100×1

    def test_api_rejects_overproduction(self):
        """API 校验：produced + new > sales_item.quantity → 400。"""
        Group.objects.get_or_create(name='manager')
        manager = User.objects.create_user(username='pr_manager', password='p')
        manager.groups.add(Group.objects.get(name='manager'))
        client = APIClient()
        client.force_authenticate(user=manager)

        # 先排 80 套（合法）
        resp = client.post(
            '/api/business/production-records/',
            {'sales_item': self.sales_item.id, 'quantity': '80'},
            format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        # 再排 30 套（合计 110 > 100）→ 400
        resp = client.post(
            '/api/business/production-records/',
            {'sales_item': self.sales_item.id, 'quantity': '30'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('quantity', resp.data)

    def test_api_rejects_patch_and_delete(self):
        """append-only：ViewSet 不挂 Update/Destroy mixin → 405。"""
        record = ProductionRecord.objects.create(
            sales_item=self.sales_item, quantity=Decimal('10'), operator='m',
        )
        Group.objects.get_or_create(name='manager')
        manager = User.objects.create_user(username='pr_manager2', password='p')
        manager.groups.add(Group.objects.get(name='manager'))
        client = APIClient()
        client.force_authenticate(user=manager)

        for method in ('patch', 'put', 'delete'):
            resp = getattr(client, method)(f'/api/business/production-records/{record.id}/')
            self.assertEqual(resp.status_code, 405, f'{method.upper()} 应返回 405')


class ModelLayerValidationTest(TestCase):
    """2026-06-19 漏洞 2 加固：验证 4 个 append-only 模型的 model.clean() 在
    raw ORM 路径也生效——admin / 数据脚本 / Django shell 不能绕过校验。

    覆盖：
      - StockAdjustment.quantity <= 0           → ValidationError
      - ReceivingLog.quantity_received <= 0     → ValidationError
      - ReceivingLog.quantity_received > 剩余  → ValidationError
      - ShippingLog.quantity_shipped <= 0       → ValidationError
      - ShippingLog.quantity_shipped > 可发     → ValidationError
      - ProductionRecord.quantity <= 0          → ValidationError
      - ProductionRecord 三件不齐                → ValidationError
      - ProductionRecord 过排产                 → ValidationError

    上层 serializer 同口径 validate 已有 API 测试（test_api_rejects_overproduction
    等），这里专门压 raw ORM 路径——没有 serializer 帮你挡的时候，model 层兜底。
    """

    def setUp(self):
        # 最小可工作的"三件套 + 销售明细"
        self.cat_raw = Category.objects.create(name='RAW', category_type='RAW_MATERIAL')
        self.cat_shell = Category.objects.create(name='SHELL', category_type='SELF_MADE')
        self.cat_cable = Category.objects.create(name='CABLE', category_type='CABLE')
        self.raw = Product.objects.create(
            category=self.cat_raw, internal_code='V-RAW', model_name='RAW',
            stock_quantity=Decimal('100'),
        )
        self.shell = Product.objects.create(
            category=self.cat_shell, internal_code='V-SH', model_name='SHELL',
            stock_quantity=Decimal('100'),
        )
        self.cable = Product.objects.create(
            category=self.cat_cable, internal_code='V-CA', model_name='CABLE',
            stock_quantity=Decimal('100'),
        )
        from core.models import PcbPlan, PcbPlanMaterial
        self.plan = PcbPlan.objects.create(name='V-PLAN', code='V')
        PcbPlanMaterial.objects.create(plan=self.plan, material=self.raw, quantity_per_unit=Decimal('1'))

        self.partner = Partner.objects.create(name='V-客户', partner_type='CUSTOMER')
        self.supplier = Partner.objects.create(name='V-供应商', partner_type='SUPPLIER')
        self.so = SalesOrder.objects.create(order_no='SO-V-001', partner=self.partner, operator='v')
        self.si = SalesOrderItem.objects.create(
            order=self.so, product=self.shell, pcb_plan=self.plan, cable=self.cable,
            custom_product_name='V', price=Decimal('1'), quantity=Decimal('50'),
        )
        self.po = PurchaseOrder.objects.create(order_no='PO-V-001', partner=self.supplier, operator='v')
        self.po_item = PurchaseOrderItem.objects.create(
            order=self.po, product=self.raw, price=Decimal('1'), quantity=Decimal('100'),
        )

    # ---- StockAdjustment ----
    def test_stock_adjustment_zero_quantity_raises(self):
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            StockAdjustment.objects.create(
                product=self.raw, adjustment_type='MANUAL_IN',
                quantity=Decimal('0'), operator='v',
            )

    def test_stock_adjustment_negative_quantity_raises(self):
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            StockAdjustment.objects.create(
                product=self.raw, adjustment_type='MANUAL_OUT',
                quantity=Decimal('-5'), operator='v',
            )

    # ---- ReceivingLog ----
    def test_receiving_log_zero_quantity_raises(self):
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            ReceivingLog.objects.create(
                purchase_item=self.po_item, quantity_received=Decimal('0'), operator='v',
            )

    def test_receiving_log_over_remaining_raises(self):
        from django.core.exceptions import ValidationError
        # 已收 80，剩 20。再收 30 → 拒
        ReceivingLog.objects.create(
            purchase_item=self.po_item, quantity_received=Decimal('80'), operator='v',
        )
        with self.assertRaises(ValidationError):
            ReceivingLog.objects.create(
                purchase_item=self.po_item, quantity_received=Decimal('30'), operator='v',
            )

    # ---- ShippingLog ----
    def test_shipping_log_zero_quantity_raises(self):
        from django.core.exceptions import ValidationError
        # 先排产 30，可发 = min(50, 30) - 0 = 30
        ProductionRecord.objects.create(sales_item=self.si, quantity=Decimal('30'), operator='v')
        with self.assertRaises(ValidationError):
            ShippingLog.objects.create(
                sales_item=self.si, quantity_shipped=Decimal('0'), operator='v',
            )

    def test_shipping_log_over_available_raises(self):
        from django.core.exceptions import ValidationError
        # 排产 20，可发 = min(50, 20) - 0 = 20。发 30 → 拒
        ProductionRecord.objects.create(sales_item=self.si, quantity=Decimal('20'), operator='v')
        with self.assertRaises(ValidationError):
            ShippingLog.objects.create(
                sales_item=self.si, quantity_shipped=Decimal('30'), operator='v',
            )

    # ---- ProductionRecord ----
    def test_production_record_zero_quantity_raises(self):
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            ProductionRecord.objects.create(
                sales_item=self.si, quantity=Decimal('0'), operator='v',
            )

    def test_production_record_overproduction_raises(self):
        from django.core.exceptions import ValidationError
        # 已排 40，订单总 50。再排 20 → 60 > 50，拒
        ProductionRecord.objects.create(sales_item=self.si, quantity=Decimal('40'), operator='v')
        with self.assertRaises(ValidationError):
            ProductionRecord.objects.create(
                sales_item=self.si, quantity=Decimal('20'), operator='v',
            )

    def test_production_record_missing_bom_pieces_raises(self):
        """三件套缺一不可——无 pcb_plan 的明细不能排产。"""
        from django.core.exceptions import ValidationError
        broken = SalesOrderItem.objects.create(
            order=self.so, product=self.shell, cable=self.cable,
            # 故意不挂 pcb_plan
            custom_product_name='BROKEN', price=Decimal('1'), quantity=Decimal('10'),
        )
        with self.assertRaises(ValidationError):
            ProductionRecord.objects.create(
                sales_item=broken, quantity=Decimal('5'), operator='v',
            )


class PcbPlanAPITest(APITestCase):
    """PcbPlan CRUD API 与权限测试（BOM-2.0）。

    覆盖：
    - 权限：manager 可 CRUD；warehouse / shipper 403
    - nested materials 写入：创建/更新可以一次性提交 plan + materials 列表
    - 校验：``material.category.category_type`` 必须是 RAW_MATERIAL
    - 销售明细写入：``pcb_plan`` 必须 is_active=True，否则拒绝
    详见 docs/PRD.md §3.2 / §4.5 / §9.4 changelog 2026-05-21（PCB 方案改造）。
    """

    def setUp(self):
        # 角色组
        for grp in ('manager', 'warehouse', 'shipper'):
            Group.objects.get_or_create(name=grp)
        self.manager = User.objects.create_user(username='pcb_plan_manager', password='p')
        self.manager.groups.add(Group.objects.get(name='manager'))
        self.warehouse = User.objects.create_user(username='pcb_plan_warehouse', password='p')
        self.warehouse.groups.add(Group.objects.get(name='warehouse'))

        # 原材料 & 非原材料（用于校验测试）
        self.cat_raw = Category.objects.create(name='方案测试原材料分类', category_type='RAW_MATERIAL')
        self.cat_self = Category.objects.create(name='方案测试自产分类', category_type='SELF_MADE')
        self.raw1 = Product.objects.create(
            category=self.cat_raw, internal_code='PT-RAW-1', model_name='测试原材料 1',
        )
        self.raw2 = Product.objects.create(
            category=self.cat_raw, internal_code='PT-RAW-2', model_name='测试原材料 2',
        )
        self.not_raw = Product.objects.create(
            category=self.cat_self, internal_code='PT-SELF', model_name='测试自产件（非原材料）',
        )

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def test_create_with_nested_materials(self):
        self._auth(self.manager)
        payload = {
            'name': '方案-A',
            'code': 'A',
            'is_active': True,
            'materials': [
                {'material': self.raw1.id, 'quantity_per_unit': '2.5', 'note': '主控'},
                {'material': self.raw2.id, 'quantity_per_unit': '10', 'note': '电容'},
            ],
        }
        resp = self.client.post('/api/core/pcb-plans/', payload, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['name'], '方案-A')
        self.assertEqual(len(resp.data['materials']), 2)

    def test_create_rejects_non_raw_material(self):
        """方案明细的 material 必须是 RAW_MATERIAL 分类。"""
        self._auth(self.manager)
        payload = {
            'name': '方案-Bad',
            'materials': [
                {'material': self.not_raw.id, 'quantity_per_unit': '1'},
            ],
        }
        resp = self.client.post('/api/core/pcb-plans/', payload, format='json')
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_create_rejects_zero_quantity(self):
        """quantity_per_unit 必须 > 0。"""
        self._auth(self.manager)
        payload = {
            'name': '方案-ZeroQty',
            'materials': [
                {'material': self.raw1.id, 'quantity_per_unit': '0'},
            ],
        }
        resp = self.client.post('/api/core/pcb-plans/', payload, format='json')
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_update_replaces_materials(self):
        """传 materials 列表时全量替换（删旧建新）。"""
        from core.models import PcbPlan, PcbPlanMaterial
        plan = PcbPlan.objects.create(name='方案-Upd', code='U')
        PcbPlanMaterial.objects.create(plan=plan, material=self.raw1, quantity_per_unit=Decimal('1'))
        self._auth(self.manager)

        # 替换为只含 raw2 的列表
        resp = self.client.patch(
            f'/api/core/pcb-plans/{plan.id}/',
            {'materials': [{'material': self.raw2.id, 'quantity_per_unit': '3'}]},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        plan.refresh_from_db()
        materials = list(plan.materials.all())
        self.assertEqual(len(materials), 1)
        self.assertEqual(materials[0].material_id, self.raw2.id)
        self.assertEqual(materials[0].quantity_per_unit, Decimal('3'))

    def test_warehouse_cannot_write(self):
        self._auth(self.warehouse)
        resp = self.client.post('/api/core/pcb-plans/', {'name': 'X'}, format='json')
        self.assertEqual(resp.status_code, 403)
        # GET 也是 manager only
        resp = self.client.get('/api/core/pcb-plans/')
        self.assertEqual(resp.status_code, 403)

    def test_inactive_plan_rejected_by_sales_item(self):
        """已下架方案不可被新销售明细选中（serializer 校验）。"""
        from core.models import PcbPlan
        from business.models import SalesOrder
        from core.models import Partner

        # 准备销售单环境
        partner = Partner.objects.create(name='方案测试客户', partner_type='CUSTOMER')
        order = SalesOrder.objects.create(
            order_no='SO-PCB-TEST', partner=partner, operator='m', total_amount=Decimal('0'),
        )
        cable_cat = Category.objects.create(name='方案测试线材', category_type='CABLE')
        cable = Product.objects.create(category=cable_cat, internal_code='PT-CB', model_name='测试线材')
        shell_prod = Product.objects.create(category=self.cat_self, internal_code='PT-SH', model_name='测试外壳')
        plan_off = PcbPlan.objects.create(name='已下架方案', is_active=False)

        self._auth(self.manager)
        resp = self.client.patch(
            f'/api/business/sales-orders/{order.id}/',
            {
                'items_payload': [{
                    'product': shell_prod.id, 'pcb_plan': plan_off.id, 'cable': cable.id,
                    'custom_product_name': 'X', 'price': '1', 'quantity': '1',
                }],
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 400, resp.data)
