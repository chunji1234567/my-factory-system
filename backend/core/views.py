# core/views.py
import django_filters
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters as drf_filters, generics, status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Product, Category, Partner, PcbPlan
from .serializers import (
    ProductSerializer,
    CategorySerializer,
    PartnerSerializer,
    PcbPlanSerializer,
    CurrentUserSerializer,
)
from business.api.permissions import IsManager, IsManagerOrWarehouse

class ProductListView(generics.ListCreateAPIView):
    """产品列表与创建。

    GET + POST 均仅 manager / warehouse 可访问——产品是 inventory /
    purchase / self-made-gallery 等面板的主数据，shipper 实际不消费此
    接口（前端 App.tsx 已按角色 gating useProducts hook）。详见
    docs/PRD.md §9.4 changelog 2026-05-11。
    """
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [IsManagerOrWarehouse]


class CategoryListView(generics.ListCreateAPIView):
    """分类列表与创建。与 ProductListView 同口径：仅 manager / warehouse。"""
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsManagerOrWarehouse]


class PartnerListCreateView(generics.ListCreateAPIView):
    queryset = Partner.objects.all()
    serializer_class = PartnerSerializer

    def get_permissions(self):
        if self.request.method in ('GET', 'POST'):
            return [IsManager()]
        return super().get_permissions()


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = CurrentUserSerializer(request.user)
        return Response(serializer.data)


class PcbPlanFilter(django_filters.FilterSet):
    """PCB 方案 list 端点的过滤参数。

    - `is_active=true/false`：只看启用 / 只看下架
    - `name`（icontains）：按名称模糊搜
    - `code`（icontains）：按方案编号模糊搜
    """

    name = django_filters.CharFilter(field_name='name', lookup_expr='icontains')
    code = django_filters.CharFilter(field_name='code', lookup_expr='icontains')

    class Meta:
        model = PcbPlan
        fields = ['is_active', 'name', 'code']


class PcbPlanViewSet(viewsets.ModelViewSet):
    """PCB 方案 CRUD。

    - 权限：**manager only**（方案 = 主数据，影响销售/生产成本，仓管/发货员只读消费方案）
    - 排序：默认 `-is_active, name`（model Meta 定义）
    - 软删除：用 ``is_active=False`` 下架而不是物理删除——避免破坏历史排产明细的
      PROTECT 引用（详见 ``ProductionOrderLine.pcb_plan.on_delete``）

    详见 docs/PRD.md §3.2 / §4.5 / §9.4 changelog 2026-05-21（PCB 方案改造）。
    """

    queryset = PcbPlan.objects.prefetch_related('materials__material__category').all()
    serializer_class = PcbPlanSerializer
    permission_classes = [IsManager]
    filter_backends = [DjangoFilterBackend, drf_filters.OrderingFilter]
    filterset_class = PcbPlanFilter
    ordering_fields = ['name', 'is_active', 'created_at', 'updated_at']


class HealthCheckView(APIView):
    """轻量健康检查端点（部署探活用）。

    - 路径：`/health/`（不放在 `/api/` 前缀下，方便反代统一探活规则）
    - 权限：`AllowAny`——必须无需鉴权即可访问，否则反代会拿到 401 误判服务挂了
    - 返回：`{"status": "ok"}` + 200；不做数据库探活（DB 探活走
      `python manage.py check --database default`，单独跑）
    - 详见 docs/PRD.md §9.2 changelog 2026-05-21 与 rules/deployment-rules.md §6
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []  # 跳过 JWT 校验，避免无效 token 导致 401

    def get(self, request):
        return Response({"status": "ok"}, status=status.HTTP_200_OK)
