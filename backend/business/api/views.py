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
    ProductionOrder,
    ProductionOrderLine,
)
from .serializers import (
    PurchaseOrderSerializer,
    SalesOrderSerializer,
    ReceivingLogSerializer,
    ShippingLogSerializer,
    StockAdjustmentSerializer,
    CustomerPreferredProductSerializer,
    OrderEventSerializer,
    PurchaseOrderEventSerializer,
    ProductionOrderSerializer,
)
from .permissions import (
    ManagerOrWarehouseReadOnly,
    ManagerOrShipperReadOnly,
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
    ProductionOrderFilter,
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
        return (
            PurchaseOrder.objects.all()
            .prefetch_related('items__product', 'items__receipts', 'events')
            .select_related('partner')
        )

    @action(detail=True, methods=['get', 'post'], permission_classes=[IsAuthenticated, IsManagerOrWarehouse], url_path='events')
    def events(self, request, pk=None):
        order = self.get_object()
        if request.method.lower() == 'get':
            serializer = PurchaseOrderEventSerializer(order.events.order_by('-created_at'), many=True)
            return Response(serializer.data)
        serializer = PurchaseOrderEventSerializer(data=request.data, context={'order': order, 'request': request})
        serializer.is_valid(raise_exception=True)
        event = serializer.save()
        return Response(PurchaseOrderEventSerializer(event).data, status=201)


class SalesOrderViewSet(mixins.ListModelMixin,
                        mixins.RetrieveModelMixin,
                        mixins.CreateModelMixin,
                        mixins.UpdateModelMixin,
                        mixins.DestroyModelMixin,
                        viewsets.GenericViewSet):
    serializer_class = SalesOrderSerializer
    permission_classes = [IsAuthenticated, ManagerOrShipperReadOnly]
    ordering = ['-created_at']
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = SalesOrderFilter
    ordering_fields = ['created_at', 'total_amount']

    def get_queryset(self):
        return (
            SalesOrder.objects
            .all()
            .prefetch_related(
                'items__product', 'items__cable', 'items__shippings',
                # BOM-2.0：pcb_plan_detail 嵌套 materials → 一次性把展开链路 prefetch
                'items__pcb_plan__materials__material__category',
            )
            .select_related('partner')
        )

    @action(detail=True, methods=['get', 'post'], permission_classes=[IsAuthenticated, IsManagerOrShipper], url_path='events')
    def events(self, request, pk=None):
        order = self.get_object()
        if request.method.lower() == 'get':
            serializer = OrderEventSerializer(order.events.order_by('-created_at'), many=True)
            return Response(serializer.data)
        serializer = OrderEventSerializer(data=request.data, context={'order': order, 'request': request})
        serializer.is_valid(raise_exception=True)
        event = serializer.save()
        return Response(OrderEventSerializer(event).data, status=201)

    @action(detail=True, methods=['patch'], permission_classes=[IsAuthenticated, IsManagerOrShipper])
    def status(self, request, pk=None):
        order = self.get_object()
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


class ProductionOrderViewSet(mixins.ListModelMixin,
                             mixins.RetrieveModelMixin,
                             mixins.CreateModelMixin,
                             mixins.UpdateModelMixin,
                             viewsets.GenericViewSet):
    """排产单 ViewSet。

    权限：所有 3 个角色（manager / warehouse / shipper）均可排产，
    与业务侧确认（2026-05-11，详见 docs/PRD.md §2.2）。

    操作：
    - GET / POST / PATCH 标准 CRUD（PATCH 仅在 PLANNED 状态下生效）
    - ``@action execute``：把状态切到 EXECUTED 触发扣料 signal（不可逆）
    - ``@action cancel``：从 PLANNED 取消到 CANCELLED
    - 故意**不挂** DELETE / Destroy mixin——排产单是 append-only 的事件型
      数据，不能删（只能 cancel 或留作历史）。

    扣料逻辑在 ``business/signals.py: execute_production_consumption``，
    一旦 EXECUTED，本 ViewSet 拒绝任何编辑。
    """
    serializer_class = ProductionOrderSerializer
    permission_classes = [IsAuthenticated]  # 三角色都可操作
    ordering = ['-plan_date', '-created_at']
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = ProductionOrderFilter
    ordering_fields = ['plan_date', 'created_at', 'status']

    def get_queryset(self):
        return (
            ProductionOrder.objects.all()
            .prefetch_related(
                'lines__shell', 'lines__cable',
                'lines__pcb_plan__materials__material',
                'lines__sales_item__order',
            )
        )

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def execute(self, request, pk=None):
        """把排产单从 PLANNED 切到 EXECUTED，触发扣料。

        - 仅 PLANNED 状态可执行；其他状态返回 400
        - 不传 body，纯动作
        - 成功后返回最新订单（带新写入的 executed_at）
        """
        order = self.get_object()
        if order.status != 'PLANNED':
            return Response(
                {'detail': f'排产单当前状态为 {order.get_status_display()}，不允许执行扣料'},
                status=400,
            )
        order.status = 'EXECUTED'
        order.save(update_fields=['status'])
        # execute_production_consumption signal 会自动写 StockAdjustment 并设 executed_at
        order.refresh_from_db()
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def cancel(self, request, pk=None):
        """取消排产单（仅 PLANNED 可取消）。"""
        order = self.get_object()
        if order.status != 'PLANNED':
            return Response(
                {'detail': f'排产单当前状态为 {order.get_status_display()}，不允许取消'},
                status=400,
            )
        order.status = 'CANCELLED'
        order.save(update_fields=['status'])
        return Response(self.get_serializer(order).data)


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
    if not order:
        return ''
    details = []
    items = getattr(order, 'items', None)
    if items is None:
        return ''
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
        details.append(f"{name}: {quantity} x ¥{price:.2f}")
    return '; '.join(details)


def _compose_entry_note(entry):
    note = entry.note or ''
    detail_str = ''
    if entry.sales_order_id:
        detail_str = _format_order_items(entry.sales_order)
    elif entry.purchase_order_id:
        detail_str = _format_order_items(entry.purchase_order)
    if detail_str:
        note = f"{note} | 明细: {detail_str}" if note else f"明细: {detail_str}"
    return note


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
        filename = f'partner_{partner.id}_ledger.csv'
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('\ufeff')
        writer = csv.writer(response)

        writer.writerow([partner.name])
        writer.writerow(['日期', '类型', '借方', '贷方', '净额', '备注', '来源'])

        for entry in entries:
            if summary_mode:
                entry_type_label = entry['entry_type_label']
                created_at = entry['created_at'].strftime('%Y-%m-%d')
                note = entry['note']
                source = entry['source']
                debit = entry['debit_amount']
                credit = entry['credit_amount']
                amount = entry['amount']
            else:
                entry_type_label = LEDGER_ENTRY_TYPE_LABELS.get(entry.entry_type, entry.entry_type)
                created_at = entry.created_at.strftime('%Y-%m-%d')
                source = _format_ledger_source(entry)
                note = _compose_entry_note(entry)
                debit = entry.debit_amount
                credit = entry.credit_amount
                amount = entry.amount

            writer.writerow([
                created_at,
                entry_type_label,
                f"{debit:.2f}",
                f"{credit:.2f}",
                f"{amount:.2f}",
                note,
                source,
            ])

        if not summary_mode:
            writer.writerow([])

            orders = order_model.objects.filter(partner=partner)
            if export_year:
                orders = orders.filter(created_at__year=export_year)
            orders = orders.prefetch_related('items__product')

            writer.writerow(['订单明细'])
            writer.writerow(['订单号', '状态', '总额', '创建时间', '产品明细'])
            for order in orders.order_by('-created_at'):
                total_amount = order.total_amount or Decimal('0')
                writer.writerow([
                    order.order_no,
                    order.status,
                    f"{total_amount:.2f}",
                    order.created_at.strftime('%Y-%m-%d'),
                    _format_order_items(order),
                ])

            writer.writerow([])

            transactions = FinancialTransaction.objects.filter(partner=partner)
            if export_year:
                transactions = transactions.filter(created_at__year=export_year)

            writer.writerow(['财务流水'])
            writer.writerow(['金额', '类型', '备注', '时间'])
            for txn in transactions.order_by('-created_at'):
                amount = txn.amount or Decimal('0')
                writer.writerow([
                    f"{amount:.2f}",
                    txn.get_transaction_type_display(),
                    txn.note or '',
                    txn.created_at.strftime('%Y-%m-%d'),
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
