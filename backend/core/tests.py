from decimal import Decimal

from django.test import TestCase
from django.db.utils import IntegrityError
from rest_framework.test import APIClient

from core.models import Category, Product, Partner

class CoreDataTest(TestCase):
    def setUp(self):
        """初始化基础档案"""
        self.cat = Category.objects.create(name="自产外壳", category_type="SELF_MADE")
        self.partner = Partner.objects.create(name="通用客户", partner_type="BOTH")

    def test_product_unique_code(self):
        """测试：内部编号必须唯一"""
        Product.objects.create(
            category=self.cat,
            internal_code="2026-SH-SD-BK",
            model_name="黑色外壳"
        )
        # 尝试创建一个编号一模一样的产品，应该抛出 IntegrityError 异常
        with self.assertRaises(IntegrityError):
            Product.objects.create(
                category=self.cat,
                internal_code="2026-SH-SD-BK",
                model_name="另一个重复编号的外壳"
            )

    def test_category_protection(self):
        """测试：如果分类下有产品，禁止删除该分类"""
        prod = Product.objects.create(
            category=self.cat,
            internal_code="PROT-001",
            model_name="受保护的产品"
        )
        # 尝试删除分类，应该因为 PROTECT 约束而失败
        from django.db.models.deletion import ProtectedError
        with self.assertRaises(ProtectedError):
            self.cat.delete()

    def test_partner_display(self):
        """测试：合作伙伴的字符串显示是否直观"""
        self.assertEqual(str(self.partner), "通用客户")


class ProductAPITest(TestCase):
    """利用 DRF APIClient 创建 mock 数据，并验证产品列表接口"""

    def setUp(self):
        self.client = APIClient()
        self.shell_category = Category.objects.create(name="自产外壳", category_type="SELF_MADE")
        self.raw_category = Category.objects.create(name="塑料颗粒", category_type="RAW_MATERIAL")

        self.shell_product = Product.objects.create(
            category=self.shell_category,
            internal_code="2026-SH-GL-BK",
            model_name="黑色高亮外壳",
            stock_quantity=500
        )
        self.raw_product = Product.objects.create(
            category=self.raw_category,
            internal_code="RM-ABS-01",
            model_name="ABS 原粒",
            stock_quantity=2000
        )

    def test_product_list_endpoint_returns_mock_payload(self):
        response = self.client.get('/api/core/products/')
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload), 2)

        products_by_code = {item['internal_code']: item for item in payload}
        shell_payload = products_by_code['2026-SH-GL-BK']
        raw_payload = products_by_code['RM-ABS-01']

        # 验证嵌套分类信息和关键字段
        self.assertEqual(shell_payload['category_detail']['name'], self.shell_category.name)
        self.assertEqual(shell_payload['category_detail']['category_type'], self.shell_category.category_type)
        self.assertEqual(Decimal(shell_payload['stock_quantity']), Decimal('500'))
        self.assertIsNone(shell_payload['image'])

        self.assertEqual(raw_payload['category_detail']['name'], self.raw_category.name)
        self.assertEqual(Decimal(raw_payload['stock_quantity']), Decimal('2000'))
