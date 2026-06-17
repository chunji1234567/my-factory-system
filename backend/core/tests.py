from decimal import Decimal

from django.contrib.auth.models import Group, User
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
    """利用 DRF APIClient 创建 mock 数据，并验证产品列表接口。

    注意：`/api/core/products/` 现在需要 manager / warehouse 角色才能 GET
    （详见 docs/PRD.md §9.4 changelog 2026-05-11，shipper 不消费此接口）。
    测试通过 force_authenticate 一个 manager 用户来满足权限要求。
    """

    def setUp(self):
        self.client = APIClient()
        # 鉴权：products GET 需 manager / warehouse；这里给一个 manager 用户。
        manager_group, _ = Group.objects.get_or_create(name='manager')
        self.user = User.objects.create_user(username='product_api_test_manager')
        self.user.groups.add(manager_group)
        self.client.force_authenticate(user=self.user)

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
        # DRF 默认开启了 PageNumberPagination（PAGE_SIZE=20），响应是
        # {count, next, previous, results} 的分页结构而不是裸列表。
        products = payload['results'] if isinstance(payload, dict) and 'results' in payload else payload
        self.assertEqual(len(products), 2)

        products_by_code = {item['internal_code']: item for item in products}
        shell_payload = products_by_code['2026-SH-GL-BK']
        raw_payload = products_by_code['RM-ABS-01']

        # 验证嵌套分类信息和关键字段
        self.assertEqual(shell_payload['category_detail']['name'], self.shell_category.name)
        self.assertEqual(shell_payload['category_detail']['category_type'], self.shell_category.category_type)
        self.assertEqual(Decimal(shell_payload['stock_quantity']), Decimal('500'))
        self.assertIsNone(shell_payload['image'])

        self.assertEqual(raw_payload['category_detail']['name'], self.raw_category.name)
        self.assertEqual(Decimal(raw_payload['stock_quantity']), Decimal('2000'))


class HealthCheckTest(TestCase):
    """/health/ 端点回归：

    1. 未鉴权也能 200（部署反代探活必须无需 token）
    2. 返回体形如 {"status": "ok"}

    详见 docs/PRD.md §9.2 changelog 2026-05-21 与 rules/deployment-rules.md §6。
    """

    def setUp(self):
        self.client = APIClient()

    def test_health_returns_ok_without_auth(self):
        response = self.client.get('/health/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_health_works_even_with_invalid_token(self):
        """即使带了错误的 token，health 也不能抛 401——authentication_classes=[]."""
        self.client.credentials(HTTP_AUTHORIZATION='Bearer not-a-real-token')
        response = self.client.get('/health/')
        self.assertEqual(response.status_code, 200)
