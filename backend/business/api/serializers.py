from decimal import Decimal

from django.db.models import Sum
from rest_framework import serializers

from core.serializers import ProductSerializer
from business.models import (
    PurchaseOrder,
    PurchaseOrderItem,
    ReceivingLog,
    SalesOrder,
    SalesOrderItem,
    ShippingLog,
    StockAdjustment,
    CustomerPreferredProduct,
    OrderEvent,
    PurchaseOrderEvent,
)
from .utils import is_manager


def _resolve_operator(validated_data, request):
    if validated_data.get('operator'):
        return
    if request and request.user and request.user.is_authenticated:
        validated_data['operator'] = request.user.get_full_name() or request.user.get_username()


class MonetaryMaskMixin:
    monetary_fields = []

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        if request and not is_manager(request.user):
            for field in self.monetary_fields:
                if field in data:
                    data[field] = None
        return data


class PurchaseOrderItemWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseOrderItem
        fields = ['product', 'price', 'quantity']


class PurchaseOrderItemSerializer(MonetaryMaskMixin, serializers.ModelSerializer):
    product_detail = ProductSerializer(source='product', read_only=True)
    received_quantity = serializers.SerializerMethodField()
    monetary_fields = ['price']

    class Meta:
        model = PurchaseOrderItem
        fields = ['id', 'product', 'product_detail', 'price', 'quantity', 'received_quantity']

    def get_received_quantity(self, obj):
        return obj.receipts.aggregate(total=Sum('quantity_received'))['total'] or Decimal('0')


class PurchaseOrderSerializer(MonetaryMaskMixin, serializers.ModelSerializer):
    partners = None
    items = PurchaseOrderItemSerializer(many=True, read_only=True)
    items_payload = PurchaseOrderItemWriteSerializer(many=True, write_only=True, required=False)
    partner_name = serializers.CharField(source='partner.name', read_only=True)
    received_quantity = serializers.SerializerMethodField()
    monetary_fields = ['total_amount']

    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'order_no', 'partner', 'partner_name', 'status', 'total_amount',
            'created_at', 'operator', 'items', 'items_payload', 'received_quantity'
        ]
        extra_kwargs = {
            'order_no': {'required': False, 'allow_blank': True},
            'operator': {'required': False, 'allow_blank': True},
        }

    def get_received_quantity(self, obj):
        return obj.items.aggregate(total=Sum('receipts__quantity_received'))['total'] or Decimal('0')

    def create(self, validated_data):
        request = self.context.get('request')
        items_data = validated_data.pop('items_payload', [])
        if not validated_data.get('operator') and request and request.user.is_authenticated:
            validated_data['operator'] = request.user.get_full_name() or request.user.get_username()
        if not validated_data.get('order_no'):
            validated_data['order_no'] = self._generate_order_no()
        order = PurchaseOrder.objects.create(**validated_data)
        for item in items_data:
            PurchaseOrderItem.objects.create(order=order, **item)
        return order

    def update(self, instance, validated_data):
        request = self.context.get('request')
        items_data = validated_data.pop('items_payload', None)
        if not validated_data.get('operator') and request and request.user.is_authenticated:
            validated_data['operator'] = request.user.get_full_name() or request.user.get_username()
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if items_data is not None:
            instance.items.all().delete()
            for item in items_data:
                PurchaseOrderItem.objects.create(order=instance, **item)
        return instance

    def _generate_order_no(self):
        from django.utils import timezone
        year = timezone.now().year
        prefix = f'PO{year}'
        count = PurchaseOrder.objects.filter(order_no__startswith=prefix).count() + 1
        return f'{prefix}-{count:04d}'


class ReceivingLogSerializer(serializers.ModelSerializer):
    purchase_item_detail = PurchaseOrderItemSerializer(source='purchase_item', read_only=True)

    class Meta:
        model = ReceivingLog
        fields = ['id', 'purchase_item', 'purchase_item_detail', 'quantity_received', 'remark', 'operator', 'received_at']
        read_only_fields = ['received_at']
        extra_kwargs = {'operator': {'required': False}}

    def validate_quantity_received(self, value):
        if value <= 0:
            raise serializers.ValidationError('数量必须大于0')
        return value

    def create(self, validated_data):
        _resolve_operator(validated_data, self.context.get('request'))
        return super().create(validated_data)


class SalesOrderItemWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalesOrderItem
        fields = ['product', 'custom_product_name', 'detail_description', 'price', 'quantity']
        extra_kwargs = {
            'detail_description': {'required': False, 'allow_blank': True},
        }


class SalesOrderItemSerializer(MonetaryMaskMixin, serializers.ModelSerializer):
    product_detail = ProductSerializer(source='product', read_only=True)
    shipped_quantity = serializers.SerializerMethodField()
    monetary_fields = ['price']

    class Meta:
        model = SalesOrderItem
        fields = [
            'id', 'product', 'product_detail', 'custom_product_name', 'detail_description', 'price', 'quantity', 'shipped_quantity'
        ]

    def get_shipped_quantity(self, obj):
        return obj.shipped_quantity


class OrderEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderEvent
        fields = ['id', 'event_type', 'content', 'operator', 'created_at']
        read_only_fields = ['operator', 'created_at']

    def create(self, validated_data):
        _resolve_operator(validated_data, self.context.get('request'))
        order = self.context['order']
        return order.events.create(**validated_data)


class SalesOrderSerializer(MonetaryMaskMixin, serializers.ModelSerializer):
    items = SalesOrderItemSerializer(many=True, read_only=True)
    events = OrderEventSerializer(many=True, read_only=True)
    items_payload = SalesOrderItemWriteSerializer(many=True, write_only=True, required=False)
    partner_name = serializers.CharField(source='partner.name', read_only=True)
    monetary_fields = ['total_amount', 'paid_amount']

    class Meta:
        model = SalesOrder
        fields = [
            'id', 'order_no', 'partner', 'partner_name', 'status', 'total_amount', 'paid_amount',
            'created_at', 'operator', 'items', 'events', 'items_payload'
        ]
        extra_kwargs = {
            'order_no': {'required': False, 'allow_blank': True},
            'operator': {'required': False, 'allow_blank': True},
        }

    def create(self, validated_data):
        items_data = validated_data.pop('items_payload', [])
        request = self.context.get('request')
        _resolve_operator(validated_data, request)
        if not validated_data.get('order_no'):
            validated_data['order_no'] = self._generate_order_no()
        order = SalesOrder.objects.create(**validated_data)
        for item in items_data:
            SalesOrderItem.objects.create(order=order, **item)
        return order

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items_payload', None)
        request = self.context.get('request')
        _resolve_operator(validated_data, request)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if items_data is not None:
            instance.items.all().delete()
            for item in items_data:
                SalesOrderItem.objects.create(order=instance, **item)
        return instance

    def _generate_order_no(self):
        from django.utils import timezone
        year = timezone.now().year
        prefix = f'SO{year}'
        count = SalesOrder.objects.filter(order_no__startswith=prefix).count() + 1
        return f'{prefix}-{count:04d}'


class CustomerPreferredProductSerializer(serializers.ModelSerializer):
    partner_name = serializers.CharField(source='partner.name', read_only=True)

    class Meta:
        model = CustomerPreferredProduct
        fields = ['id', 'partner', 'partner_name', 'name', 'created_at']


class PurchaseOrderEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseOrderEvent
        fields = ['id', 'event_type', 'content', 'operator', 'created_at']
        read_only_fields = ['operator', 'created_at']

    def create(self, validated_data):
        _resolve_operator(validated_data, self.context.get('request'))
        order = self.context['order']
        return order.events.create(**validated_data)


class ShippingLogSerializer(serializers.ModelSerializer):
    sales_item_detail = SalesOrderItemSerializer(source='sales_item', read_only=True)
    partner_name = serializers.CharField(source='sales_item.order.partner.name', read_only=True)
    partner_id = serializers.IntegerField(source='sales_item.order.partner_id', read_only=True)
    order_no = serializers.CharField(source='sales_item.order.order_no', read_only=True)

    class Meta:
        model = ShippingLog
        fields = [
            'id', 'sales_item', 'sales_item_detail', 'quantity_shipped', 'tracking_no',
            'operator', 'shipped_at', 'partner_name', 'partner_id', 'order_no'
        ]
        read_only_fields = ['shipped_at']
        extra_kwargs = {'operator': {'required': False}}

    def validate_quantity_shipped(self, value):
        if value <= 0:
            raise serializers.ValidationError('发货数量必须大于0')
        return value

    def create(self, validated_data):
        _resolve_operator(validated_data, self.context.get('request'))
        return super().create(validated_data)


class StockAdjustmentSerializer(serializers.ModelSerializer):
    product_detail = ProductSerializer(source='product', read_only=True)

    class Meta:
        model = StockAdjustment
        fields = ['id', 'product', 'product_detail', 'adjustment_type', 'quantity', 'note', 'operator', 'created_at']
        read_only_fields = ['created_at']
        extra_kwargs = {'operator': {'required': False}}

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError('调整数量必须大于0')
        return value

    def create(self, validated_data):
        _resolve_operator(validated_data, self.context.get('request'))
        return super().create(validated_data)
