from django_filters.rest_framework import DjangoFilterBackend
from decimal import Decimal

from django.db.models import Sum, Count, Max, F, ExpressionWrapper, DecimalField
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date
from rest_framework import viewsets, mixins, filters
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
)
from .finance_serializers import (
    FinancePartnerSummarySerializer,
    FinanceOrderSerializer,
    FinancePurchaseOrderSerializer,
    FinanceTransactionSerializer,
    FinancePartnerDetailSerializer,
)


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
        return PurchaseOrder.objects.all().prefetch_related('items__product', 'items__receipts').select_related('partner')

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
    ordering_fields = ['created_at', 'total_amount', 'paid_amount']

    def get_queryset(self):
        return SalesOrder.objects.all().prefetch_related('items__product', 'items__shippings').select_related('partner')

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

        order.status = target_status
        order.save(update_fields=['status'])
        return Response({'id': order.id, 'status': order.status})


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
        return ShippingLog.objects.select_related('sales_item__order', 'sales_item__product')


class StockAdjustmentViewSet(mixins.ListModelMixin,
                             mixins.CreateModelMixin,
                             viewsets.GenericViewSet):
    serializer_class = StockAdjustmentSerializer
    permission_classes = [IsAuthenticated, IsManagerOrWarehouse]
    ordering = ['-created_at']
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = StockAdjustmentFilter
    ordering_fields = ['created_at', 'quantity']

    def get_queryset(self):
        return StockAdjustment.objects.select_related('product')


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

        outstanding_expr = ExpressionWrapper(
            F('total_amount') - F('paid_amount'),
            output_field=DecimalField(max_digits=15, decimal_places=2)
        )
        total_outstanding = orders.aggregate(total=Sum(outstanding_expr))['total'] or Decimal('0')

        summary_qs = orders.values('partner_id', 'partner__name', 'partner__partner_type').annotate(
            outstanding=Sum(outstanding_expr),
            total_orders=Count('id'),
            last_order_at=Max('created_at')
        )

        ordering_param = request.query_params.get('ordering', '-outstanding')
        ordering_map = {
            'name': 'partner__name',
            '-name': '-partner__name',
            'partner__name': 'partner__name',
            '-partner__name': '-partner__name',
            'outstanding': 'outstanding',
            '-outstanding': '-outstanding',
            'last_order_at': 'last_order_at',
            '-last_order_at': '-last_order_at',
        }
        summary_qs = summary_qs.order_by(ordering_map.get(ordering_param, '-outstanding'))

        summary_data = [
            {
                'partner_id': row['partner_id'],
                'partner_name': row['partner__name'],
                'partner_type': row['partner__partner_type'],
                'outstanding_amount': row['outstanding'] or Decimal('0'),
                'total_orders': row['total_orders'],
                'last_order_at': row['last_order_at'],
            }
            for row in summary_qs
        ]

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(summary_data, request, view=self)
        serializer = FinancePartnerSummarySerializer(page, many=True)
        payload = {
            'type': finance_type,
            'total_outstanding': total_outstanding,
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


class FinancePartnerDetailView(APIView):
    permission_classes = [IsAuthenticated, IsManager]

    def get(self, request, partner_id):
        finance_type = request.query_params.get('type', 'receivable')
        try:
            order_model, serializer_class, partner_types = self._get_detail_context(finance_type)
        except ValueError:
            return Response({'detail': 'Invalid finance type'}, status=400)
        partner = get_object_or_404(Partner, pk=partner_id, partner_type__in=partner_types)

        orders = order_model.objects.filter(partner=partner)
        order_status = request.query_params.get('order_status')
        if order_status:
            orders = orders.filter(status=order_status)
        order_from = self._parse_date_param(request.query_params.get('order_from'))
        order_to = self._parse_date_param(request.query_params.get('order_to'))
        if order_from:
            orders = orders.filter(created_at__date__gte=order_from)
        if order_to:
            orders = orders.filter(created_at__date__lte=order_to)

        order_outstanding_expr = ExpressionWrapper(
            F('total_amount') - F('paid_amount'),
            output_field=DecimalField(max_digits=15, decimal_places=2)
        )
        outstanding_amount = orders.aggregate(total=Sum(order_outstanding_expr))['total'] or Decimal('0')
        allowed_order_fields = {'created_at', '-created_at', 'total_amount', '-total_amount', 'paid_amount', '-paid_amount', 'order_no', '-order_no', 'status', '-status'}
        order_ordering = request.query_params.get('order_ordering', '-created_at')
        if order_ordering not in allowed_order_fields:
            order_ordering = '-created_at'
        orders = orders.order_by(order_ordering)
        orders_serialized = serializer_class(orders, many=True).data

        transactions = FinancialTransaction.objects.filter(partner=partner)
        txn_from = self._parse_date_param(request.query_params.get('transaction_from'))
        txn_to = self._parse_date_param(request.query_params.get('transaction_to'))
        if txn_from:
            transactions = transactions.filter(created_at__date__gte=txn_from)
        if txn_to:
            transactions = transactions.filter(created_at__date__lte=txn_to)
        allowed_txn_ordering = {'created_at', '-created_at', 'amount', '-amount'}
        txn_ordering = request.query_params.get('transaction_ordering', '-created_at')
        if txn_ordering not in allowed_txn_ordering:
            txn_ordering = '-created_at'
        transactions = transactions.order_by(txn_ordering)
        transactions_serialized = FinanceTransactionSerializer(transactions, many=True).data
        total_transactions = transactions.aggregate(total=Sum('amount'))['total'] or Decimal('0')

        ledger_balance = partner.ledger_entries.aggregate(total=Sum('amount'))['total'] or Decimal('0')

        detail_data = {
            'partner_id': partner.id,
            'partner_name': partner.name,
            'partner_type': partner.partner_type,
            'balance': ledger_balance,
            'outstanding_amount': outstanding_amount,
            'orders': orders_serialized,
            'transactions': transactions_serialized,
            'total_transactions': total_transactions,
        }
        serializer = FinancePartnerDetailSerializer(detail_data)
        return Response(serializer.data)

    def _get_detail_context(self, finance_type):
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
