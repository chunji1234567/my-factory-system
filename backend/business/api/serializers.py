from decimal import Decimal

from django.db import transaction
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
    id = serializers.IntegerField(required=False)

    class Meta:
        model = PurchaseOrderItem
        fields = ['id', 'product', 'price', 'quantity']


class PurchaseOrderItemSerializer(MonetaryMaskMixin, serializers.ModelSerializer):
    product_detail = ProductSerializer(source='product', read_only=True)
    received_quantity = serializers.SerializerMethodField()
    monetary_fields = ['price']

    class Meta:
        model = PurchaseOrderItem
        fields = ['id', 'product', 'product_detail', 'price', 'quantity', 'received_quantity']

    def get_received_quantity(self, obj):
        return obj.receipts.aggregate(total=Sum('quantity_received'))['total'] or Decimal('0')


class PurchaseOrderEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseOrderEvent
        fields = ['id', 'event_type', 'content', 'operator', 'created_at']
        read_only_fields = ['operator', 'created_at']

    def create(self, validated_data):
        _resolve_operator(validated_data, self.context.get('request'))
        order = self.context['order']
        return order.events.create(**validated_data)


class PurchaseOrderSerializer(MonetaryMaskMixin, serializers.ModelSerializer):
    partners = None
    items = PurchaseOrderItemSerializer(many=True, read_only=True)
    items_payload = PurchaseOrderItemWriteSerializer(many=True, write_only=True, required=False)
    partner_name = serializers.CharField(source='partner.name', read_only=True)
    received_quantity = serializers.SerializerMethodField()
    events = PurchaseOrderEventSerializer(many=True, read_only=True)
    monetary_fields = ['total_amount']

    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'order_no', 'partner', 'partner_name', 'status', 'total_amount',
            'created_at', 'operator', 'items', 'items_payload', 'received_quantity', 'events'
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
        with transaction.atomic():
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
        _resolve_operator(validated_data, request)
        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()
            if items_data is not None:
                existing_items = {item.id: item for item in instance.items.select_for_update()}
                retained_ids = set()
                for item in items_data:
                    item_data = dict(item)
                    item_id = item_data.pop('id', None)
                    if item_id is not None:
                        purchase_item = existing_items.get(item_id)
                        if not purchase_item:
                            raise serializers.ValidationError({'items_payload': f'未知的采购明细 ID: {item_id}'})
                        new_quantity = item_data.get('quantity', purchase_item.quantity)
                        received_total = purchase_item.receipts.aggregate(total=Sum('quantity_received'))['total'] or Decimal('0')
                        if received_total > new_quantity:
                            raise serializers.ValidationError({
                                'items_payload': f'明细 {item_id} 的数量不能小于已入库数量 {received_total}',
                            })
                        for field, value in item_data.items():
                            setattr(purchase_item, field, value)
                        purchase_item.save()
                        retained_ids.add(item_id)
                    else:
                        PurchaseOrderItem.objects.create(order=instance, **item_data)
                existing_ids = set(existing_items.keys())
                ids_to_delete = existing_ids - retained_ids
                if ids_to_delete:
                    instance.items.filter(id__in=ids_to_delete).delete()
        return instance

    def _generate_order_no(self):
        from django.utils import timezone
        year = timezone.now().year
        prefix = f'PO{year}'
        latest = (
            PurchaseOrder.objects.select_for_update()
            .filter(order_no__startswith=prefix)
            .order_by('-order_no')
            .first()
        )
        if latest:
            try:
                counter = int(latest.order_no.split('-')[-1]) + 1
            except (ValueError, IndexError):
                counter = 1
        else:
            counter = 1
        return f'{prefix}-{counter:04d}'


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

    def validate(self, attrs):
        purchase_item = attrs.get('purchase_item') or getattr(self.instance, 'purchase_item', None)
        quantity = attrs.get('quantity_received') or getattr(self.instance, 'quantity_received', None)
        if purchase_item and quantity:
            recorded = purchase_item.receipts.aggregate(total=Sum('quantity_received'))['total'] or Decimal('0')
            if self.instance:
                recorded -= self.instance.quantity_received
            remaining = purchase_item.quantity - recorded
            if quantity > remaining:
                raise serializers.ValidationError({'quantity_received': f'超过待收数量，剩余 {remaining}'})
        return attrs

    def create(self, validated_data):
        _resolve_operator(validated_data, self.context.get('request'))
        return super().create(validated_data)


class SalesOrderItemWriteSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = SalesOrderItem
        fields = ['id', 'product', 'custom_product_name', 'detail_description', 'price', 'quantity']
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
        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()
            if items_data is not None:
                existing_items = {item.id: item for item in instance.items.select_for_update()}
                retained_ids = set()
                for item in items_data:
                    item_data = dict(item)
                    item_id = item_data.pop('id', None)
                    if item_id is not None:
                        sales_item = existing_items.get(item_id)
                        if not sales_item:
                            raise serializers.ValidationError({'items_payload': f'未知的明细 ID: {item_id}'})
                        new_quantity = item_data.get('quantity', sales_item.quantity)
                        if sales_item.shipped_quantity > new_quantity:
                            raise serializers.ValidationError({
                                'items_payload': f'明细 {item_id} 的数量不能小于已发货数量 {sales_item.shipped_quantity}',
                            })
                        for field, value in item_data.items():
                            setattr(sales_item, field, value)
                        sales_item.save()
                        retained_ids.add(item_id)
                    else:
                        SalesOrderItem.objects.create(order=instance, **item_data)
                existing_ids = set(existing_items.keys())
                ids_to_delete = existing_ids - retained_ids
                if ids_to_delete:
                    instance.items.filter(id__in=ids_to_delete).delete()
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

    def validate(self, attrs):
        sales_item = attrs.get('sales_item') or getattr(self.instance, 'sales_item', None)
        quantity = attrs.get('quantity_shipped') or getattr(self.instance, 'quantity_shipped', None)
        if sales_item and quantity is not None:
            shipped = sales_item.shippings.aggregate(total=Sum('quantity_shipped'))['total'] or Decimal('0')
            if self.instance:
                shipped -= self.instance.quantity_shipped
            remaining = sales_item.quantity - shipped
            if quantity > remaining:
                raise serializers.ValidationError({'quantity_shipped': f'超过待发数量，剩余 {remaining}'})
        return attrs

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
