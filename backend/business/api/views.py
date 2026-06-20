from decimal import Decimal
import csv

from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum, Count, Max, OuterRef, Subquery, DecimalField
from django.db.models.functions import Coalesce
from django.core.paginator import Paginator
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date
from rest_framework import viewsets, mixins, filters, renderers
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from business.models import (
    PurchaseOrder,
    SalesOrder,
    ReceivingLog,
    ShippingLog,
    StockAdjustment,
    Partner,
    FinancialTransaction,
    CustomerPreferredProduct,
    PartnerLedgerEntry,
    ProductionRecord,
)
from .serializers import (
    PurchaseOrderSerializer,
    SalesOrderSerializer,
    SalesOrderListSerializer,  # 2026-06-19 性能加固：list 路径用瘦身版
    ReceivingLogSerializer,
    ShippingLogSerializer,
    StockAdjustmentSerializer,
    CustomerPreferredProductSerializer,
    OrderEventSerializer,
    PurchaseOrderEventSerializer,
    ProductionRecordSerializer,
)
from .permissions import (
    ManagerOrWarehouseReadOnly,
    ManagerOrShipperReadOnly,
    ManagerOrFulfillmentReadOnly,
    IsManagerOrWarehouse,
    IsManagerOrShipper,
    IsManager,
)
from .filters import (
    PurchaseOrderFilter,
    SalesOrderFilter,
    ReceivingLogFilter,
    ShippingLogFilter,
    StockAdjustmentFilter,
    FinancialTransactionFilter,
    ProductionRecordFilter,
)
from .finance_serializers import (
    FinancePartnerSummarySerializer,
    FinanceOrderSerializer,
    FinancePurchaseOrderSerializer,
    FinanceTransactionSerializer,
    FinancePartnerDetailSerializer,
)

class CSVRenderer(renderers.BaseRenderer):
    media_type = 'text/csv'
    format = 'csv'
    charset = 'utf-8'

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


class PDFRenderer(renderers.BaseRenderer):
    """让 DRF 内容协商承认 application/pdf。

    没有这个 renderer，前端发 `Accept: application/pdf` 会在 DRF 进入 view
    之前直接被挡掉，返回 406 "Could not satisfy the request Accept header"。
    用于发货单 PDF 导出（详见 ShippingLogViewSet.export_pdf）。
    """
    media_type = 'application/pdf'
    format = 'pdf'
    charset = None
    render_style = 'binary'

    def render(self, data, accepted_media_type=None, renderer_context=None):
        # data 已经是 bytes（PDF 二进制），直接返回。
        return data


LEDGER_ENTRY_TYPE_LABELS = {
    'SALES': '销售订单',
    'PURCHASE': '采购订单',
    'FINANCE': '财务流水',
    'ADJUST': '余额调整',
    'OPENING': '期初余额',
}

ORDER_ORDERING_FIELDS = {
    'created_at', '-created_at', 'total_amount', '-total_amount',
    'order_no', '-order_no', 'status', '-status'
}

TRANSACTION_ORDERING_FIELDS = {'created_at', '-created_at', 'amount', '-amount'}


def parse_positive_int(value, default, max_value=None):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    if number <= 0:
        return default
    if max_value and number > max_value:
        return max_value
    return number


class PurchaseOrderViewSet(mixins.ListModelMixin,
                           mixins.RetrieveModelMixin,
                           mixins.CreateModelMixin,
                           mixins.UpdateModelMixin,
                           mixins.DestroyModelMixin,
                           viewsets.GenericViewSet):
    serializer_class = PurchaseOrderSerializer
    permission_classes = [IsAuthenticated, ManagerOrWarehouseReadOnly]
    ordering = ['-created_at']
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = PurchaseOrderFilter
    ordering_fields = ['created_at', 'total_amount']

    def get_queryset(self):
        qs = (
            PurchaseOrder.objects.all()
            .prefetch_related('items__product', 'items__receipts', 'events')
            .select_related('partner')
        )
        # 默认隐藏已归档单（2026-06-19）。**仅 list 路径**强制过滤——retrieve /
        # destroy / archive / unarchive 都需要能命中归档单。客户端在 list 上
        # 显式传 ?is_archived=<...> 时 FilterSet 接管，这里不叠加默认。
        # 详见 docs/PRD.md §9.4 归档机制。
        if self.action == 'list' and 'is_archived' not in self.request.query_params:
            qs = qs.filter(is_archived=False)
        return qs

    def perform_destroy(self, instance):
        # 归档单冻结——不能删（2026-06-19 归档机制）
        if instance.is_archived:
            from rest_framework.exceptions import ValidationError as DRFValidationError
            raise DRFValidationError({'detail': '该采购单已归档，请先取消归档再删除'})
        super().perform_destroy(instance)

    @action(detail=True, methods=['get', 'post'], permission_classes=[IsAuthenticated, IsManagerOrWarehouse], url_path='events')
    def events(self, request, pk=None):
        order = self.get_object()
        if request.method.lower() == 'get':
            serializer = PurchaseOrderEventSerializer(order.events.order_by('-created_at'), many=True)
            return Response(serializer.data)
        # 归档单冻结：不允许追加事件
        if order.is_archived:
            return Response({'detail': '该采购单已归档，不能追加事件'}, status=400)
        serializer = PurchaseOrderEventSerializer(data=request.data, context={'order': order, 'request': request})
        serializer.is_valid(raise_exception=True)
        event = serializer.save()
        return Response(PurchaseOrderEventSerializer(event).data, status=201)

    # ----- 归档机制（2026-06-19 新增，详见 docs/PRD.md §9.4） ----------------
    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated, IsManager], url_path='archive-batch')
    def archive_batch(self, request):
        """一键归档所有 status=RECEIVED 且 is_archived=False 的采购单（manager only）。

        返回 ``{archived_count: N}``。无 payload。
        前端"年末归档"按钮点确认后调这个 endpoint。
        """
        from django.utils import timezone
        operator = request.user.get_full_name() or request.user.get_username()
        eligible = PurchaseOrder.objects.filter(status='RECEIVED', is_archived=False)
        archived_count = eligible.count()
        eligible.update(
            is_archived=True,
            archived_at=timezone.now(),
            archived_by=operator,
        )
        return Response({'archived_count': archived_count})

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManager])
    def archive(self, request, pk=None):
        """单条归档（manager only）。要求 status=RECEIVED。"""
        from django.utils import timezone
        order = self.get_object()
        if order.is_archived:
            return Response({'detail': '该采购单已归档'}, status=400)
        if order.status != 'RECEIVED':
            return Response({'detail': '仅 RECEIVED 状态的采购单可归档'}, status=400)
        operator = request.user.get_full_name() or request.user.get_username()
        order.is_archived = True
        order.archived_at = timezone.now()
        order.archived_by = operator
        order.save(update_fields=['is_archived', 'archived_at', 'archived_by'])
        return Response(PurchaseOrderSerializer(order, context={'request': request}).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManager])
    def unarchive(self, request, pk=None):
        """单条取消归档（manager only）。取消后订单可再次编辑。"""
        order = self.get_object()
        if not order.is_archived:
            return Response({'detail': '该采购单未归档'}, status=400)
        order.is_archived = False
        order.archived_at = None
        order.archived_by = ''
        order.save(update_fields=['is_archived', 'archived_at', 'archived_by'])
        return Response(PurchaseOrderSerializer(order, context={'request': request}).data)

    @action(
        detail=True,
        methods=['get'],
        url_path='pdf',
        renderer_classes=[PDFRenderer],
    )
    def pdf(self, request, pk=None):
        """单张采购订单确认书 PDF（A4 单页，给供应商签字）。

        业务约定（2026-06-19，详见 docs/PRD.md §9.4）：
          - 订单号显示规则：仅显示 partner_order_no；空则不显示订单号。
            我们的内部 order_no 在 PDF 里完全不出现。
        """
        from datetime import date as _date
        from django.http import JsonResponse, HttpResponse
        from .order_confirmation_pdf import generate_purchase_order_confirmation_pdf

        order = self.get_object()
        try:
            pdf_bytes = generate_purchase_order_confirmation_pdf(order)
        except Exception as exc:  # pragma: no cover
            return JsonResponse({'detail': f'PDF 生成失败：{exc}'}, status=500)

        # 2026-06-19：文件名格式 = <供应商名>_采购订单_<供应商单号 或 日期+id>.pdf
        # 供应商单号空时回退到 "日期_id" 段——避免文件名冲突。
        # 路径分隔符和 Windows 非法字符全部剥掉（中文/空格保留）。
        def _safe(s: str) -> str:
            return ''.join(ch for ch in s if ch not in '/\\:*?"<>|').strip()

        partner_name = _safe(getattr(order.partner, 'name', '') or '供应商')
        po_no = _safe(order.partner_order_no or '')
        if po_no:
            filename = f'{partner_name}_采购订单_{po_no}.pdf'
        else:
            filename = (
                f'{partner_name}_采购订单_'
                f'{_date.today().strftime("%Y%m%d")}_{order.id}.pdf'
            )
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        # RFC 5987 编码处理中文文件名
        from urllib.parse import quote
        response['Content-Disposition'] = (
            f"attachment; filename=order.pdf; filename*=UTF-8''{quote(filename)}"
        )
        return response


class SalesOrderViewSet(mixins.ListModelMixin,
                        mixins.RetrieveModelMixin,
                        mixins.CreateModelMixin,
                        mixins.UpdateModelMixin,
                        mixins.DestroyModelMixin,
                        viewsets.GenericViewSet):
    serializer_class = SalesOrderSerializer
    # 权限调整 2026-06-18：warehouse 也需要 LIST 销售订单 —— ProductionPanel
    # 内部把销售明细打平成排产候选行（详见 docs/PRD.md §4.5）。
    # manager 仍然全权（创建 / 编辑 / 删 / 改 status）；warehouse + shipper 只读。
    permission_classes = [IsAuthenticated, ManagerOrFulfillmentReadOnly]
    ordering = ['-created_at']
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = SalesOrderFilter
    ordering_fields = ['created_at', 'total_amount']

    def get_serializer_class(self):
        """list 路径用瘦身版（去掉 pcb_plan.materials + events 嵌套），其它路径用完整版。

        2026-06-19 性能加固：原 SalesOrderSerializer 单条响应 ~16KB，200 张单 12 秒。
        换 SalesOrderListSerializer 后预计 ~2KB / 条，200 张单 1-2 秒。
        详见 SalesOrderListSerializer 文档 + docs/PRD.md §9.4 changelog。
        """
        if self.action == 'list':
            return SalesOrderListSerializer
        return SalesOrderSerializer

    def get_queryset(self):
        # list 路径用更轻的 prefetch（无 materials 链路），retrieve 等仍走全量。
        # prefetch 的成本主要在 ORM 跑 IN 查询 + Python 构造对象图——list 接口
        # 既然不输出 materials，prefetch materials 就是纯浪费。
        if self.action == 'list':
            qs = (
                SalesOrder.objects
                .all()
                .prefetch_related(
                    'items__product', 'items__cable', 'items__pcb_plan', 'items__shippings',
                    'items__production_records',  # produced_quantity 派生量要用
                )
                .select_related('partner')
            )
        else:
            qs = (
                SalesOrder.objects
                .all()
                .prefetch_related(
                    'items__product', 'items__cable', 'items__shippings',
                    # 完整版：pcb_plan_detail 嵌套 materials → 一次性把展开链路 prefetch
                    'items__pcb_plan__materials__material__category',
                )
                .select_related('partner')
            )
        # 默认隐藏已归档单（2026-06-19）。**仅 list 路径**强制过滤——retrieve /
        # destroy / archive / unarchive 都需要能命中归档单。客户端在 list 上
        # 显式传 ?is_archived=<...> 时 FilterSet 接管，这里不叠加默认。
        # 详见 docs/PRD.md §9.4 归档机制。
        if self.action == 'list' and 'is_archived' not in self.request.query_params:
            qs = qs.filter(is_archived=False)
        return qs

    def perform_destroy(self, instance):
        # 归档单冻结——不能删（2026-06-19 归档机制）
        if instance.is_archived:
            from rest_framework.exceptions import ValidationError as DRFValidationError
            raise DRFValidationError({'detail': '该销售单已归档，请先取消归档再删除'})
        super().perform_destroy(instance)

    @action(detail=True, methods=['get', 'post'], permission_classes=[IsAuthenticated, IsManagerOrShipper], url_path='events')
    def events(self, request, pk=None):
        order = self.get_object()
        if request.method.lower() == 'get':
            serializer = OrderEventSerializer(order.events.order_by('-created_at'), many=True)
            return Response(serializer.data)
        # 归档单冻结：不允许追加事件
        if order.is_archived:
            return Response({'detail': '该销售单已归档，不能追加事件'}, status=400)
        serializer = OrderEventSerializer(data=request.data, context={'order': order, 'request': request})
        serializer.is_valid(raise_exception=True)
        event = serializer.save()
        return Response(OrderEventSerializer(event).data, status=201)

    @action(detail=True, methods=['patch'], permission_classes=[IsAuthenticated, IsManagerOrShipper])
    def status(self, request, pk=None):
        order = self.get_object()
        # 归档单冻结——不能改 status（2026-06-19 归档机制）
        if order.is_archived:
            return Response({'detail': '该销售单已归档，不能改状态'}, status=400)
        target_status = request.data.get('status')
        valid_statuses = {choice[0] for choice in SalesOrder.STATUS_CHOICES}

        if target_status not in valid_statuses:
            return Response({'detail': 'Invalid status'}, status=400)

        if order.status == target_status:
            return Response({'id': order.id, 'status': order.status})

        if not self._is_valid_transition(order.status, target_status):
            return Response({'detail': '非法的状态转换'}, status=400)

        order.status = target_status
        order.save(update_fields=['status'])
        return Response({'id': order.id, 'status': order.status})

    @staticmethod
    def _is_valid_transition(current, target):
        flow = ['ORDERED', 'PRODUCING', 'SHIPPED', 'COMPLETED']
        try:
            current_index = flow.index(current)
            target_index = flow.index(target)
        except ValueError:
            return False
        # 只允许保持原状态或前进到下一阶段
        return target_index == current_index + 1

    # ----- 归档机制（2026-06-19 新增，详见 docs/PRD.md §9.4） ----------------
    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated, IsManager], url_path='archive-batch')
    def archive_batch(self, request):
        """一键归档所有 status=COMPLETED 且 is_archived=False 的销售单（manager only）。

        返回 ``{archived_count: N}``。无 payload。
        前端"年末归档"按钮点确认后调这个 endpoint。
        """
        from django.utils import timezone
        operator = request.user.get_full_name() or request.user.get_username()
        eligible = SalesOrder.objects.filter(status='COMPLETED', is_archived=False)
        archived_count = eligible.count()
        eligible.update(
            is_archived=True,
            archived_at=timezone.now(),
            archived_by=operator,
        )
        return Response({'archived_count': archived_count})

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManager])
    def archive(self, request, pk=None):
        """单条归档（manager only）。要求 status=COMPLETED。"""
        from django.utils import timezone
        order = self.get_object()
        if order.is_archived:
            return Response({'detail': '该销售单已归档'}, status=400)
        if order.status != 'COMPLETED':
            return Response({'detail': '仅 COMPLETED 状态的销售单可归档'}, status=400)
        operator = request.user.get_full_name() or request.user.get_username()
        order.is_archived = True
        order.archived_at = timezone.now()
        order.archived_by = operator
        order.save(update_fields=['is_archived', 'archived_at', 'archived_by'])
        return Response(SalesOrderSerializer(order, context={'request': request}).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManager])
    def unarchive(self, request, pk=None):
        """单条取消归档（manager only）。取消后订单可再次编辑。"""
        order = self.get_object()
        if not order.is_archived:
            return Response({'detail': '该销售单未归档'}, status=400)
        order.is_archived = False
        order.archived_at = None
        order.archived_by = ''
        order.save(update_fields=['is_archived', 'archived_at', 'archived_by'])
        return Response(SalesOrderSerializer(order, context={'request': request}).data)

    @action(
        detail=True,
        methods=['get'],
        url_path='pdf',
        renderer_classes=[PDFRenderer],
    )
    def pdf(self, request, pk=None):
        """单张销售订单确认书 PDF（A4 单页，给客户签字）。

        业务约定（2026-06-19，详见 docs/PRD.md §9.4）：
          - 订单号显示规则：仅显示 partner_order_no；空则不显示订单号。
            我们的内部 order_no 在 PDF 里完全不出现。
        """
        from datetime import date as _date
        from django.http import JsonResponse, HttpResponse
        from .order_confirmation_pdf import generate_sales_order_confirmation_pdf

        order = self.get_object()
        try:
            pdf_bytes = generate_sales_order_confirmation_pdf(order)
        except Exception as exc:  # pragma: no cover
            return JsonResponse({'detail': f'PDF 生成失败：{exc}'}, status=500)

        # 2026-06-19：文件名格式 = <客户名>_销售订单_<客户单号 或 日期+id>.pdf
        # 同 PurchaseOrderViewSet.pdf 口径。
        def _safe(s: str) -> str:
            return ''.join(ch for ch in s if ch not in '/\\:*?"<>|').strip()

        partner_name = _safe(getattr(order.partner, 'name', '') or '客户')
        po_no = _safe(order.partner_order_no or '')
        if po_no:
            filename = f'{partner_name}_销售订单_{po_no}.pdf'
        else:
            filename = (
                f'{partner_name}_销售订单_'
                f'{_date.today().strftime("%Y%m%d")}_{order.id}.pdf'
            )
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        from urllib.parse import quote
        response['Content-Disposition'] = (
            f"attachment; filename=order.pdf; filename*=UTF-8''{quote(filename)}"
        )
        return response


class CustomerPreferredProductViewSet(mixins.ListModelMixin,
                                      mixins.CreateModelMixin,
                                      mixins.DestroyModelMixin,
                                      viewsets.GenericViewSet):
    serializer_class = CustomerPreferredProductSerializer
    permission_classes = [IsAuthenticated, ManagerOrShipperReadOnly]
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']

    def get_queryset(self):
        queryset = CustomerPreferredProduct.objects.select_related('partner')
        partner_id = self.request.query_params.get('partner')
        if partner_id:
            queryset = queryset.filter(partner_id=partner_id)
        return queryset


class ReceivingLogViewSet(mixins.ListModelMixin,
                          mixins.CreateModelMixin,
                          viewsets.GenericViewSet):
    serializer_class = ReceivingLogSerializer
    permission_classes = [IsAuthenticated, IsManagerOrWarehouse]
    ordering = ['-received_at']
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = ReceivingLogFilter
    ordering_fields = ['received_at', 'quantity_received']

    def get_queryset(self):
        return ReceivingLog.objects.select_related('purchase_item__order', 'purchase_item__product')


class ShippingLogViewSet(mixins.ListModelMixin,
                         mixins.CreateModelMixin,
                         viewsets.GenericViewSet):
    serializer_class = ShippingLogSerializer
    permission_classes = [IsAuthenticated, IsManagerOrShipper]
    ordering = ['-shipped_at']
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = ShippingLogFilter
    ordering_fields = ['shipped_at', 'quantity_shipped']

    def get_queryset(self):
        return ShippingLog.objects.select_related('sales_item__order__partner', 'sales_item__product')

    @action(
        detail=False,
        methods=['get'],
        url_path='export-pdf',
        # 必须挂 PDFRenderer，否则 DRF 内容协商会在进 view 前用 406 挡掉
        # 前端发的 `Accept: application/pdf`（详见 PDFRenderer 注释）。
        renderer_classes=[PDFRenderer],
    )
    def export_pdf(self, request):
        """把一组 ShippingLog 导出成发货单 PDF（详见 shipping_note_pdf.py）。

        查询参数：``log_ids=1,2,3`` —— 按 id 过滤；同客户的多笔会被合并成
        同一页发货单，不同客户分页。

        返回 ``application/pdf``，文件名 ``shipping_notes_{YYYYMMDD}.pdf``。
        """
        from datetime import date as _date
        from django.http import JsonResponse
        from .shipping_note_pdf import generate_shipping_note_pdf

        # 注意：错误响应必须用 JsonResponse 而不是 DRF Response——
        # 这个 action 的 renderer_classes 只有 PDFRenderer（DRF 内容协商需要），
        # Response 会被 PDFRenderer 把错误 dict 当二进制 PDF 输出，前端拿到的
        # 就是损坏的 PDF。JsonResponse 直接走 Django 旁路，绕开 DRF 渲染管线。
        raw_ids = request.query_params.get('log_ids', '')
        try:
            ids = [int(s) for s in raw_ids.split(',') if s.strip()]
        except ValueError:
            return JsonResponse({'detail': '无效的 log_ids 参数'}, status=400)
        if not ids:
            return JsonResponse({'detail': '请提供至少一个 log_ids'}, status=400)

        logs = list(self.get_queryset().filter(id__in=ids))
        if not logs:
            return JsonResponse({'detail': '没有找到对应的发货流水'}, status=404)

        pdf_bytes = generate_shipping_note_pdf(logs)
        filename = f'shipping_notes_{_date.today().strftime("%Y%m%d")}.pdf'
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class StockAdjustmentViewSet(mixins.ListModelMixin,
                             mixins.RetrieveModelMixin,  # 让 detail GET 可用 → PATCH/PUT/DELETE 落 405
                             mixins.CreateModelMixin,
                             viewsets.GenericViewSet):
    # 注：故意**不挂** UpdateModelMixin / DestroyModelMixin。StockAdjustment 是
    # append-only 事件，PATCH/PUT/DELETE 必须返回 405（不能是 404，否则路由
    # 根本不存在让人以为是 URL 错误）。详见 rules/backend-rules.md §1.5
    # 与 docs/PRD.md §3.2 / §9.4 changelog 2026-05-11。
    serializer_class = StockAdjustmentSerializer
    permission_classes = [IsAuthenticated, IsManagerOrWarehouse]
    ordering = ['-created_at']
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = StockAdjustmentFilter
    ordering_fields = ['created_at', 'quantity']

    def get_queryset(self):
        return StockAdjustment.objects.select_related('product')


class ProductionRecordViewSet(mixins.ListModelMixin,
                              mixins.RetrieveModelMixin,
                              mixins.CreateModelMixin,
                              viewsets.GenericViewSet):
    """排产记录 ViewSet（BOM-2.1，2026-05-27）。

    权限：所有 3 个角色（manager / warehouse / shipper）均可排产。

    操作：
    - GET（list/retrieve）+ POST（create）；**没有** PATCH / DELETE
    - 创建即扣料：signal ``auto_consume_on_production_record_create`` 在
      ``post_save(created=True)`` 时写 (2 + N) 条 StockAdjustment(PRODUCE_CONSUME)
    - 首条记录创建时另一信号 ``auto_promote_to_producing`` 把销售单
      ORDERED → PRODUCING

    append-only：要"撤销"必须录反向 ``StockAdjustment(MANUAL_IN)``；
    与 backend-rules.md §1.5 总则一致。

    详见 docs/PRD.md §3.2 / §4.5 / §9.4 changelog 2026-05-27。
    """
    serializer_class = ProductionRecordSerializer
    permission_classes = [IsAuthenticated]  # 三角色都可操作
    ordering = ['-executed_at']
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = ProductionRecordFilter
    ordering_fields = ['executed_at', 'quantity']

    def get_queryset(self):
        return (
            ProductionRecord.objects.all()
            .select_related(
                'sales_item__order__partner',
                'sales_item__product',
                'sales_item__cable',
                'sales_item__pcb_plan',
            )
        )


class FinancialTransactionViewSet(mixins.ListModelMixin,
                                  mixins.CreateModelMixin,
                                  mixins.UpdateModelMixin,
                                  mixins.DestroyModelMixin,
                                  viewsets.GenericViewSet):
    queryset = FinancialTransaction.objects.select_related('partner')
    serializer_class = FinanceTransactionSerializer
    permission_classes = [IsAuthenticated, IsManager]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = FinancialTransactionFilter
    ordering_fields = ['created_at', 'amount']
    ordering = ['-created_at']

    def perform_create(self, serializer):
        serializer.save(operator=self.request.user.get_full_name() or self.request.user.get_username())


class FinancePartnerSummaryView(APIView):
    permission_classes = [IsAuthenticated, IsManager]

    def get(self, request):
        """汇总应收/应付。

        重要变更（paid_amount 废弃后）：
        - balance 直接取自 Partner.balance（= 该合作方所有
          PartnerLedgerEntry.amount 之和），不再按订单做 (total - paid) 累加。
        - 由于不再聚合订单金额，这里改成"按合作方分组"展示——每行 = 一个 partner。
        - search / created_from / created_to 仍然作为"合作方筛选"：
          * search 按合作方名称模糊匹配；
          * created_from/created_to 限定"该合作方在所选时段内有订单"才纳入列表，
            但 balance 仍然是合作方的当前总余额，不会被时段截断。

        历史字段名：响应中的 `balance` 在 2026-05-21 之前叫 `outstanding_amount`（paid_amount
        废弃过渡期的兼容名）；顶层聚合从 `total_outstanding` 改为 `total_balance`。
        ordering 同时接受 `balance/-balance`（推荐）与 `outstanding/-outstanding`（向后兼容别名）。
        """
        finance_type = request.query_params.get('type', 'receivable')
        try:
            order_model, partner_types = self._get_context(finance_type)
        except ValueError:
            return Response({'detail': 'Invalid finance type'}, status=400)

        orders = order_model.objects.filter(partner__partner_type__in=partner_types)
        search = request.query_params.get('search')
        if search:
            orders = orders.filter(partner__name__icontains=search)

        created_from = self._parse_date_param(request.query_params.get('created_from'))
        created_to = self._parse_date_param(request.query_params.get('created_to'))
        if created_from:
            orders = orders.filter(created_at__date__gte=created_from)
        if created_to:
            orders = orders.filter(created_at__date__lte=created_to)

        # 按合作方聚合订单数与最近下单时间；outstanding 通过 Subquery 从
        # PartnerLedgerEntry 求和（Partner.balance 已改为只读 property，
        # 不再是列，详见 docs/PRD.md §3.2 与 §9.4 changelog 2026-05-11）。
        balance_subquery = (
            PartnerLedgerEntry.objects
            .filter(partner_id=OuterRef('partner_id'))
            .values('partner_id')
            .annotate(total=Sum('amount'))
            .values('total')
        )
        summary_qs = (
            orders.values(
                'partner_id',
                'partner__name',
                'partner__partner_type',
            )
            .annotate(
                total_orders=Count('id'),
                last_order_at=Max('created_at'),
                balance=Coalesce(
                    Subquery(balance_subquery, output_field=DecimalField(max_digits=15, decimal_places=2)),
                    Decimal('0'),
                    output_field=DecimalField(max_digits=15, decimal_places=2),
                ),
            )
        )

        ordering_param = request.query_params.get('ordering', '-balance')
        ordering_map = {
            'name': 'partner__name',
            '-name': '-partner__name',
            'partner__name': 'partner__name',
            '-partner__name': '-partner__name',
            'balance': 'balance',
            '-balance': '-balance',
            # 向后兼容别名：2026-05-21 前用过 outstanding/-outstanding。
            'outstanding': 'balance',
            '-outstanding': '-balance',
            'last_order_at': 'last_order_at',
            '-last_order_at': '-last_order_at',
        }
        summary_qs = summary_qs.order_by(ordering_map.get(ordering_param, '-balance'))

        summary_data = [
            {
                'partner_id': row['partner_id'],
                'partner_name': row['partner__name'],
                'partner_type': row['partner__partner_type'],
                'balance': row['balance'] or Decimal('0'),
                'total_orders': row['total_orders'],
                'last_order_at': row['last_order_at'],
            }
            for row in summary_qs
        ]

        # total_balance = 列表中所有合作方余额之和。这里在 Python 层做累加，
        # 避免在 SQL 里再写一遍 GROUP BY 子查询；列表本身规模有限。
        total_balance = sum(
            (Decimal(row['balance']) for row in summary_data),
            Decimal('0'),
        )

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(summary_data, request, view=self)
        serializer = FinancePartnerSummarySerializer(page, many=True)
        payload = {
            'type': finance_type,
            'total_balance': total_balance,
            'partners': serializer.data,
        }
        return paginator.get_paginated_response(payload)

    def _get_context(self, finance_type):
        if finance_type == 'receivable':
            return SalesOrder, ['CUSTOMER', 'BOTH']
        if finance_type == 'payable':
            return PurchaseOrder, ['SUPPLIER', 'BOTH']
        raise ValueError('Invalid finance type')

    @staticmethod
    def _parse_date_param(value):
        if not value:
            return None
        return parse_date(value)


def _format_ledger_source(entry):
    if entry.sales_order_id:
        return f'销售单 {entry.sales_order.order_no}'
    if entry.purchase_order_id:
        return f'采购单 {entry.purchase_order.order_no}'
    if entry.transaction_id:
        return f'财务流水 #{entry.transaction_id}'
    return '-'


def _format_order_items(order):
    """**已弃用**——保留以兼容旧调用点。新代码请用 _iter_order_items。

    2026-06-19 改造（详见 docs/PRD.md §9.4 changelog）：原实现把订单所有
    明细用 "; " 拼成一格，N 条明细时单元格可达数千字符，在 Excel 里像一面
    黑墙。改造后导出每条 item 各占一行（详见 FinancePartnerLedgerExportView.get）。

    本函数仅供 summary 模式或者外部偶尔需要"一句话概括订单内容"时使用——
    那时已经牺牲了完整性、可读性优先。
    """
    if not order:
        return ''
    items_iter = list(_iter_order_items(order))
    if not items_iter:
        return ''
    # 摘要展示：最多 2 条明细 + 省略号
    summary = '; '.join(
        f"{it['name']} x{_fmt_qty(it['quantity'])}"
        for it in items_iter[:2]
    )
    if len(items_iter) > 2:
        summary += f' ... 共 {len(items_iter)} 条'
    return summary


def _iter_order_items(order):
    """惰性 yield 订单的 (name, quantity, price, subtotal, description) 字典。

    2026-06-19 新增——给"每条明细一行"的台账导出用。复用 _format_order_items
    原本的取字段逻辑。
    """
    if not order:
        return
    items = getattr(order, 'items', None)
    if items is None:
        return
    iterable = items.all() if hasattr(items, 'all') else items
    for item in iterable:
        name = getattr(item, 'custom_product_name', None)
        if not name:
            product = getattr(item, 'product', None)
            if product:
                name = getattr(product, 'model_name', None) or getattr(product, 'name', None)
        if not name:
            name = '未命名'
        quantity = getattr(item, 'quantity', 0) or 0
        price = getattr(item, 'price', Decimal('0')) or Decimal('0')
        subtotal = (Decimal(str(quantity)) * Decimal(str(price))) if price else Decimal('0')
        description = getattr(item, 'detail_description', '') or ''
        yield {
            'name': name,
            'quantity': quantity,
            'price': price,
            'subtotal': subtotal,
            'description': description.strip(),
        }


def _fmt_qty(value):
    """整数显示整数，避免 "10.00"。"""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return str(value)
    if v == int(v):
        return str(int(v))
    return f'{v:g}'


# 2026-06-19：曾短暂存在 _format_items_multiline 用于"单元格内 \n 多行"
# 的方案 C，已切换到方案 A（行展开），不再需要。函数已删除。


def _compose_entry_note(entry):
    """台账行 note 列。
    2026-06-19 改造：不再嵌入完整 items 串。来源列已经有订单号，需要看明细
    时去看导出末尾的"订单明细"段（每条 item 一行）。
    """
    return entry.note or ''


def _ledger_group_key(entry):
    if entry.sales_order_id:
        return ('SALES', entry.sales_order_id)
    if entry.purchase_order_id:
        return ('PURCHASE', entry.purchase_order_id)
    if entry.transaction_id:
        return ('FINANCE', entry.transaction_id)
    return ('ENTRY', entry.id)



class FinancePartnerLedgerExportView(APIView):
    permission_classes = [IsAuthenticated, IsManager]
    renderer_classes = [renderers.JSONRenderer, renderers.BrowsableAPIRenderer, CSVRenderer]

    def get(self, request, partner_id):
        finance_type = request.query_params.get('type', 'receivable')
        try:
            order_model, _, partner_types = FinancePartnerDetailView._get_detail_context(finance_type)
        except ValueError:
            return Response({'detail': 'Invalid finance type'}, status=400)
        partner = get_object_or_404(Partner, pk=partner_id, partner_type__in=partner_types)

        ledger_from = FinancePartnerDetailView._parse_date_param(request.query_params.get('ledger_from'))
        ledger_to = FinancePartnerDetailView._parse_date_param(request.query_params.get('ledger_to'))
        export_year = self._parse_year(request.query_params.get('year'))
        summary_mode = request.query_params.get('summary') in {'1', 'true', 'True'}

        if summary_mode:
            entries = _build_summary_rows(partner, order_model, finance_type, ledger_from, ledger_to, export_year)
        else:
            ledger_qs = PartnerLedgerEntry.objects.filter(partner=partner).select_related(
                'sales_order', 'purchase_order', 'transaction'
            ).prefetch_related(
                'sales_order__items__product',
                'purchase_order__items__product',
            ).order_by('-created_at')

            if ledger_from:
                ledger_qs = ledger_qs.filter(created_at__date__gte=ledger_from)
            if ledger_to:
                ledger_qs = ledger_qs.filter(created_at__date__lte=ledger_to)

            ledger_page_param = request.query_params.get('ledger_page')
            if ledger_page_param:
                ledger_page = parse_positive_int(ledger_page_param, 1)
                ledger_page_size = parse_positive_int(request.query_params.get('ledger_page_size'), 30, max_value=200)
                paginator = Paginator(ledger_qs, ledger_page_size)
                entries = paginator.get_page(ledger_page).object_list
            else:
                entries = ledger_qs

        response = HttpResponse(content_type='text/csv; charset=utf-8-sig')
        # 2026-06-19\uff1a\u6587\u4ef6\u540d\u5e26\u65e5\u671f\u533a\u95f4\u2014\u2014\u652f\u6301\u6708\u4efd/\u5e74/\u4efb\u610f\u533a\u95f4\u7edf\u4e00\u683c\u5f0f
        if ledger_from and ledger_to:
            range_str = f'{ledger_from.strftime("%Y%m%d")}_{ledger_to.strftime("%Y%m%d")}'
        elif export_year:
            range_str = f'{export_year}'
        else:
            range_str = 'all'
        # ASCII \u5b89\u5168\u6587\u4ef6\u540d\uff08partner.id + \u533a\u95f4\uff09+ UTF-8 \u4e2d\u6587\u7248\u7528 RFC 5987 \u7f16\u7801
        filename_ascii = f'partner_{partner.id}_ledger_{range_str}.csv'
        partner_name_safe = ''.join(
            ch for ch in (partner.name or '') if ch not in '/\\:*?"<>|'
        ).strip() or f'\u5408\u4f5c\u65b9{partner.id}'
        filename_utf8 = f'{partner_name_safe}_{range_str}_\u53f0\u8d26.csv'
        from urllib.parse import quote
        response['Content-Disposition'] = (
            f'attachment; filename="{filename_ascii}"; '
            f"filename*=UTF-8''{quote(filename_utf8)}"
        )
        response.write('\ufeff')
        writer = csv.writer(response)

        writer.writerow([partner.name])
        # 2026-06-19 改造（选项 A，详见 docs/PRD.md §9.4）：
        # 一个订单展开成 N 行——首行 = 台账数据 + 第一条 item；后续行只填
        # item 列，左边台账列留空。视觉上同一订单的 items 紧跟在一起，
        # 又不会把所有明细挤到一格里。非订单类条目（收款/付款）只 1 行。
        # 来源列删掉——和备注列内容几乎完全一样（都含订单号）。
        writer.writerow(['日期', '类型', '借方', '贷方', '净额', '备注', '产品名', '数量', '单价', '小计'])

        for entry in entries:
            if summary_mode:
                entry_type_label = entry['entry_type_label']
                created_at = entry['created_at'].strftime('%Y-%m-%d')
                note = entry.get('raw_note', entry.get('note', ''))
                debit = entry['debit_amount']
                credit = entry['credit_amount']
                amount = entry['amount']
                order_for_items = None  # summary 模式不展开明细
            else:
                entry_type_label = LEDGER_ENTRY_TYPE_LABELS.get(entry.entry_type, entry.entry_type)
                created_at = entry.created_at.strftime('%Y-%m-%d')
                note = _compose_entry_note(entry)
                debit = entry.debit_amount
                credit = entry.credit_amount
                amount = entry.amount
                order_for_items = entry.sales_order or entry.purchase_order

            items_list = list(_iter_order_items(order_for_items)) if order_for_items else []

            if not items_list:
                # 非订单类（收款/付款）或没明细的订单——1 行搞定，item 列全空
                writer.writerow([
                    created_at,
                    entry_type_label,
                    f"{debit:.2f}",
                    f"{credit:.2f}",
                    f"{amount:.2f}",
                    note,
                    '', '', '', '',
                ])
                continue

            # 第一行：台账数据 + 第一条 item
            first = items_list[0]
            writer.writerow([
                created_at,
                entry_type_label,
                f"{debit:.2f}",
                f"{credit:.2f}",
                f"{amount:.2f}",
                note,
                first['name'],
                _fmt_qty(first['quantity']),
                f"{first['price']:.2f}",
                f"{first['subtotal']:.2f}",
            ])
            # 后续行：台账列留空，只填 item
            for it in items_list[1:]:
                writer.writerow([
                    '', '', '', '', '', '',
                    it['name'],
                    _fmt_qty(it['quantity']),
                    f"{it['price']:.2f}",
                    f"{it['subtotal']:.2f}",
                ])

        return response

    @staticmethod
    def _parse_year(value):
        if not value:
            return None
        try:
            year = int(value)
        except (TypeError, ValueError):
            return None
        if year < 1900 or year > 9999:
            return None
        return year


class FinancePartnerDetailView(APIView):
    permission_classes = [IsAuthenticated, IsManager]

    def get(self, request, partner_id):
        finance_type = request.query_params.get('type', 'receivable')
        try:
            order_model, serializer_class, partner_types = self._get_detail_context(finance_type)
        except ValueError:
            return Response({'detail': 'Invalid finance type'}, status=400)
        partner = get_object_or_404(Partner, pk=partner_id, partner_type__in=partner_types)

        orders = order_model.objects.filter(partner=partner).prefetch_related('items__product')
        order_status = request.query_params.get('order_status')
        if order_status:
            orders = orders.filter(status=order_status)
        order_from = self._parse_date_param(request.query_params.get('order_from'))
        order_to = self._parse_date_param(request.query_params.get('order_to'))
        if order_from:
            orders = orders.filter(created_at__date__gte=order_from)
        if order_to:
            orders = orders.filter(created_at__date__lte=order_to)

        order_ordering = request.query_params.get('order_ordering', '-created_at')
        if order_ordering not in ORDER_ORDERING_FIELDS:
            order_ordering = '-created_at'
        orders = orders.order_by(order_ordering)
        orders_serialized = serializer_class(orders, many=True, context={'request': request}).data

        transactions = FinancialTransaction.objects.filter(partner=partner)
        txn_from = self._parse_date_param(request.query_params.get('transaction_from'))
        txn_to = self._parse_date_param(request.query_params.get('transaction_to'))
        if txn_from:
            transactions = transactions.filter(created_at__date__gte=txn_from)
        if txn_to:
            transactions = transactions.filter(created_at__date__lte=txn_to)
        txn_ordering = request.query_params.get('transaction_ordering', '-created_at')
        if txn_ordering not in TRANSACTION_ORDERING_FIELDS:
            txn_ordering = '-created_at'
        transactions = transactions.order_by(txn_ordering)
        transactions_serialized = FinanceTransactionSerializer(transactions, many=True).data
        total_transactions = transactions.aggregate(total=Sum('amount'))['total'] or Decimal('0')

        ledger_qs = PartnerLedgerEntry.objects.filter(partner=partner).select_related('sales_order', 'purchase_order', 'transaction').prefetch_related('sales_order__items__product', 'purchase_order__items__product').order_by('-created_at')
        ledger_from = self._parse_date_param(request.query_params.get('ledger_from'))
        ledger_to = self._parse_date_param(request.query_params.get('ledger_to'))
        if ledger_from:
            ledger_qs = ledger_qs.filter(created_at__date__gte=ledger_from)
        if ledger_to:
            ledger_qs = ledger_qs.filter(created_at__date__lte=ledger_to)
        ledger_page = parse_positive_int(request.query_params.get('ledger_page'), 1)
        ledger_page_size = parse_positive_int(request.query_params.get('ledger_page_size'), 30, max_value=200)
        paginator = Paginator(ledger_qs, ledger_page_size)
        ledger_page_obj = paginator.get_page(ledger_page)
        ledger_entries = []
        for entry in ledger_page_obj.object_list:
            entry_data = {
                'id': entry.id,
                'entry_type': entry.entry_type,
                'amount': entry.amount,
                'debit_amount': entry.debit_amount,
                'credit_amount': entry.credit_amount,
                'note': entry.note,
                'created_at': entry.created_at,
            }
            if entry.sales_order_id:
                entry_data['sales_order_id'] = entry.sales_order_id
                entry_data['sales_order_no'] = entry.sales_order.order_no
            if entry.purchase_order_id:
                entry_data['purchase_order_id'] = entry.purchase_order_id
                entry_data['purchase_order_no'] = entry.purchase_order.order_no
            if entry.transaction_id:
                entry_data['transaction_id'] = entry.transaction_id
            ledger_entries.append(entry_data)

        ledger_pagination = {
            'page': ledger_page_obj.number,
            'page_size': ledger_page_size,
            'total_pages': paginator.num_pages,
            'total_items': paginator.count,
        }

        ledger_balance = partner.ledger_entries.aggregate(total=Sum('amount'))['total'] or Decimal('0')

        # paid_amount 废弃后，"未结金额"和"台账余额"是同一个数。2026-05-21 起
        # 前端已切换到 balance，移除历史兼容字段 outstanding_amount；详见
        # docs/PRD.md §9.4 changelog。
        detail_data = {
            'partner_id': partner.id,
            'partner_name': partner.name,
            'partner_type': partner.partner_type,
            'balance': ledger_balance,
            'orders': orders_serialized,
            'transactions': transactions_serialized,
            'total_transactions': total_transactions,
            'ledger_entries': ledger_entries,
            'ledger_pagination': ledger_pagination,
        }
        serializer = FinancePartnerDetailSerializer(detail_data)
        return Response(serializer.data)

    @staticmethod
    def _get_detail_context(finance_type):
        if finance_type == 'receivable':
            return SalesOrder, FinanceOrderSerializer, ['CUSTOMER', 'BOTH']
        if finance_type == 'payable':
            return PurchaseOrder, FinancePurchaseOrderSerializer, ['SUPPLIER', 'BOTH']
        raise ValueError('Invalid finance type')

    @staticmethod
    def _parse_date_param(value):
        if not value:
            return None
        return parse_date(value)
def _split_amount(value):
    debit = value if value > 0 else Decimal('0')
    credit = -value if value < 0 else Decimal('0')
    return debit, credit


def _build_summary_rows(partner, order_model, finance_type, ledger_from, ledger_to, export_year):
    rows = []
    orders = order_model.objects.filter(partner=partner).prefetch_related('items__product')
    if ledger_from:
        orders = orders.filter(created_at__date__gte=ledger_from)
    if ledger_to:
        orders = orders.filter(created_at__date__lte=ledger_to)
    if export_year:
        orders = orders.filter(created_at__year=export_year)
    order_type_label = '销售订单' if finance_type == 'receivable' else '采购订单'
    order_source_label = '销售单' if finance_type == 'receivable' else '采购单'
    for order in orders.order_by('-created_at'):
        amount = Decimal(order.total_amount or 0)
        if finance_type == 'payable':
            amount = -amount
        debit, credit = _split_amount(amount)
        rows.append({
            'created_at': order.created_at,
            'entry_type_label': order_type_label,
            'debit_amount': debit,
            'credit_amount': credit,
            'amount': amount,
            'note': _format_order_items(order),
            'source': f"{order_source_label} {order.order_no}",
        })

    transactions = FinancialTransaction.objects.filter(partner=partner)
    if ledger_from:
        transactions = transactions.filter(created_at__date__gte=ledger_from)
    if ledger_to:
        transactions = transactions.filter(created_at__date__lte=ledger_to)
    if export_year:
        transactions = transactions.filter(created_at__year=export_year)
    for txn in transactions.order_by('-created_at'):
        amount = Decimal(txn.amount or 0)
        debit, credit = _split_amount(amount)
        rows.append({
            'created_at': txn.created_at,
            'entry_type_label': '财务流水',
            'debit_amount': debit,
            'credit_amount': credit,
            'amount': amount,
            'note': txn.note or '',
            'source': f"财务流水 #{txn.id}",
        })

    rows.sort(key=lambda item: item['created_at'], reverse=True)
    return rows
