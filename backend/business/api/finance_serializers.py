from decimal import Decimal

from rest_framework import serializers

from business.models import SalesOrder, PurchaseOrder, FinancialTransaction
from .serializers import SalesOrderItemSerializer, PurchaseOrderItemSerializer


class FinancePartnerSummarySerializer(serializers.Serializer):
    partner_id = serializers.IntegerField()
    partner_name = serializers.CharField()
    partner_type = serializers.CharField()
    # balance 直接来源于 Partner.balance（property = Sum(PartnerLedgerEntry.amount)）。
    # 历史上叫 outstanding_amount（paid_amount 废弃过渡期的兼容名），2026-05-21
    # 前端切换完毕后统一改名为 balance；详见 docs/PRD.md §9.4 changelog。
    balance = serializers.DecimalField(max_digits=15, decimal_places=2)
    total_orders = serializers.IntegerField()
    last_order_at = serializers.DateTimeField(allow_null=True)


class FinanceOrderSerializer(serializers.ModelSerializer):
    """财务视角下的销售订单。
    paid_amount / outstanding_amount 已不再存在——单据级别的"已结清"概念
    在台账模型下没有意义，请改用 partner.balance 或 PartnerLedgerEntry。
    """

    items = SalesOrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = SalesOrder
        fields = [
            'id', 'order_no', 'status', 'total_amount', 'created_at', 'items'
        ]


class FinancePurchaseOrderSerializer(serializers.ModelSerializer):
    """同 FinanceOrderSerializer，针对采购订单。"""

    items = PurchaseOrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'order_no', 'status', 'total_amount', 'created_at', 'items'
        ]


class FinanceTransactionSerializer(serializers.ModelSerializer):
    partner_name = serializers.CharField(source='partner.name', read_only=True)

    class Meta:
        model = FinancialTransaction
        fields = ['id', 'partner', 'partner_name', 'amount', 'transaction_type', 'note', 'operator', 'created_at']
        read_only_fields = ['operator', 'created_at', 'partner_name']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = getattr(self, 'instance', None)
        amount_provided = 'amount' in attrs
        type_provided = 'transaction_type' in attrs
        if amount_provided or type_provided:
            txn_type = attrs.get('transaction_type') or (
                instance.transaction_type if instance else FinancialTransaction.TransactionType.RECEIPT
            )
            raw_amount = attrs.get('amount')
            if raw_amount is None:
                raw_amount = instance.amount if instance else Decimal('0')
            attrs['amount'] = self._normalize_amount(Decimal(raw_amount), txn_type)
        return attrs

    @staticmethod
    def _normalize_amount(amount: Decimal, txn_type: str) -> Decimal:
        if txn_type == FinancialTransaction.TransactionType.RECEIPT:
            return -abs(amount)
        if txn_type == FinancialTransaction.TransactionType.PAYMENT:
            return -abs(amount)
        return amount


class FinancePartnerDetailSerializer(serializers.Serializer):
    partner_id = serializers.IntegerField()
    partner_name = serializers.CharField()
    partner_type = serializers.CharField()
    # balance = Sum(partner.ledger_entries.amount)，唯一可信余额来源。
    # 旧字段 outstanding_amount 是 paid_amount 废弃过渡期的兼容值，2026-05-21
    # 前端切换完毕后已从响应中移除；详见 docs/PRD.md §9.4 changelog。
    balance = serializers.DecimalField(max_digits=15, decimal_places=2)
    orders = serializers.ListField(child=serializers.DictField())
    transactions = serializers.ListField(child=serializers.DictField())
    total_transactions = serializers.DecimalField(max_digits=15, decimal_places=2)
    ledger_entries = serializers.ListField(child=serializers.DictField())
    ledger_pagination = serializers.DictField()
