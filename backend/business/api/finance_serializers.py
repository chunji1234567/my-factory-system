from decimal import Decimal

from rest_framework import serializers

from business.models import SalesOrder, PurchaseOrder, FinancialTransaction


class FinancePartnerSummarySerializer(serializers.Serializer):
    partner_id = serializers.IntegerField()
    partner_name = serializers.CharField()
    partner_type = serializers.CharField()
    outstanding_amount = serializers.DecimalField(max_digits=15, decimal_places=2)
    total_orders = serializers.IntegerField()
    last_order_at = serializers.DateTimeField(allow_null=True)


class FinanceOrderSerializer(serializers.ModelSerializer):
    outstanding_amount = serializers.SerializerMethodField()

    class Meta:
        model = SalesOrder
        fields = ['id', 'order_no', 'status', 'total_amount', 'paid_amount', 'created_at', 'outstanding_amount']

    def get_outstanding_amount(self, obj):
        return obj.total_amount - obj.paid_amount


class FinancePurchaseOrderSerializer(serializers.ModelSerializer):
    outstanding_amount = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = ['id', 'order_no', 'status', 'total_amount', 'paid_amount', 'created_at', 'outstanding_amount']

    def get_outstanding_amount(self, obj):
        return obj.total_amount - obj.paid_amount


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
    balance = serializers.DecimalField(max_digits=15, decimal_places=2)
    outstanding_amount = serializers.DecimalField(max_digits=15, decimal_places=2)
    orders = serializers.ListField(child=serializers.DictField())
    transactions = serializers.ListField(child=serializers.DictField())
    total_transactions = serializers.DecimalField(max_digits=15, decimal_places=2)
    ledger_entries = serializers.ListField(child=serializers.DictField())
    ledger_pagination = serializers.DictField()
