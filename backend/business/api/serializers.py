from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from rest_framework import serializers

from core.models import PcbPlan
from core.serializers import ProductSerializer, PcbPlanSerializer
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
    ProductionOrder,
    ProductionOrderLine,
)
from .utils import is_manager


def _resolve_operator(validated_data, request):
    if validated_data.get('operator'):
        return
    if request and request.user and request.user.is_authenticated:
        validated_data['operator'] = request.user.get_full_name() or request.user.get_username()


def _generate_sequential_order_no(model_cls, prefix):
    """根据前缀生成下一条订单号，格式 ``<prefix>-NNNN``。

    必须在 ``transaction.atomic()`` 中调用——内部用 ``select_for_update()``
    锁定当前最大尾号那一行，等本事务提交后其他事务才能读到新最大值，
    从而避免并发碰撞 ``order_no`` 唯一约束。

    回退策略：如果尾号无法解析（例如历史脏数据），从 1 重新开始。
    """
    latest = (
        model_cls.objects.select_for_update()
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
        return _generate_sequential_order_no(PurchaseOrder, f'PO{timezone.now().year}')


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
    """销售明细写入序列化器。

    BOM-2.0 改造后（详见 docs/PRD.md §3.2 与 §4.5）：每条明细必须挂三件：
    ``product``（外壳半成品）+ ``pcb_plan``（PCB 方案）+ ``cable``（线材半成品）。
    本 serializer 在创建场景下要求三个都填；编辑场景仅校验"已填字段是否合法"。

    额外校验：``pcb_plan`` 必须 ``is_active=True``（model 已设 limit_choices_to，
    但仅作用于 admin/forms，API 必须显式校验）。
    """
    id = serializers.IntegerField(required=False)

    class Meta:
        model = SalesOrderItem
        fields = [
            'id',
            'product', 'pcb_plan', 'cable',  # 三件：外壳 + 方案 + 线材
            'custom_product_name', 'detail_description', 'price', 'quantity',
        ]
        extra_kwargs = {
            'detail_description': {'required': False, 'allow_blank': True},
        }

    def validate_pcb_plan(self, value):
        if value and not value.is_active:
            raise serializers.ValidationError(f'PCB 方案 "{value.name}" 已下架，不可被新订单选中')
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        # 创建场景（无 instance）：强制三件齐备
        if self.instance is None:
            missing = [
                name for name in ('product', 'pcb_plan', 'cable')
                if not attrs.get(name)
            ]
            if missing:
                raise serializers.ValidationError({
                    'items_payload': (
                        '一条销售明细必须同时挂三件（外壳 / PCB 方案 / 线材）；'
                        f'缺少: {", ".join(missing)}'
                    ),
                })
        return attrs


class SalesOrderItemSerializer(MonetaryMaskMixin, serializers.ModelSerializer):
    """销售明细读取序列化器。

    返回外壳 + PCB 方案 + 线材的嵌套 detail。``product_detail``
    沿用历史字段名（语义上是"外壳 detail"）；``pcb_plan_detail`` 提供完整方案
    （含 materials 列表，前端可显示展开预览）；``cable_detail`` 是线材产品详情。
    """
    product_detail = ProductSerializer(source='product', read_only=True)
    pcb_plan_detail = PcbPlanSerializer(source='pcb_plan', read_only=True)
    cable_detail = ProductSerializer(source='cable', read_only=True)
    shipped_quantity = serializers.SerializerMethodField()
    monetary_fields = ['price']

    class Meta:
        model = SalesOrderItem
        fields = [
            'id',
            'product', 'product_detail',
            'pcb_plan', 'pcb_plan_detail',
            'cable', 'cable_detail',
            'custom_product_name', 'detail_description',
            'price', 'quantity', 'shipped_quantity',
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
    monetary_fields = ['total_amount']

    class Meta:
        model = SalesOrder
        fields = [
            'id', 'order_no', 'partner', 'partner_name', 'status', 'total_amount',
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
        with transaction.atomic():
            # 必须在事务内生成订单号，让 _generate_sequential_order_no 的
            # select_for_update 真正生效（与采购单 create 保持一致）。
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
        return _generate_sequential_order_no(SalesOrder, f'SO{timezone.now().year}')


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


# ---------- 排产（BOM 自动扣料） ----------


class ProductionOrderLineWriteSerializer(serializers.ModelSerializer):
    """排产明细的写入接口（BOM-2.0）。

    两种来源：
    - 关联销售明细：传 ``sales_item``，shell/pcb_plan/cable 会按 sales_item 上
      的同名字段自动填充（销售明细的 ``product`` → ``shell``，``pcb_plan`` 与
      ``cable`` 同名直接拷）。调用方也可显式传以覆盖。
    - 备货性生产：``sales_item`` 留空，shell/pcb_plan/cable 必须显式传。
    """
    id = serializers.IntegerField(required=False)
    sales_item = serializers.PrimaryKeyRelatedField(
        queryset=SalesOrderItem.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = ProductionOrderLine
        fields = [
            'id', 'sales_item', 'shell', 'pcb_plan', 'cable', 'quantity', 'note',
        ]
        extra_kwargs = {
            'note': {'required': False, 'allow_blank': True},
        }

    def validate_pcb_plan(self, value):
        if value and not value.is_active:
            raise serializers.ValidationError(f'PCB 方案 "{value.name}" 已下架，不可用于新排产')
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        sales_item = attrs.get('sales_item') or getattr(self.instance, 'sales_item', None)
        # 从 sales_item 自动回填 shell/pcb_plan/cable（如调用方没传）
        # 注意：sales_item.product → line.shell（命名不一致，sales 侧沿用 product 字段名）
        if sales_item is not None:
            mapping = (
                ('shell', 'product'),
                ('pcb_plan', 'pcb_plan'),
                ('cable', 'cable'),
            )
            for line_field, item_field in mapping:
                if line_field not in attrs or attrs[line_field] is None:
                    inherited = getattr(sales_item, item_field, None)
                    if inherited is not None:
                        attrs[line_field] = inherited

        # 校验三件齐备
        missing = [
            name for name in ('shell', 'pcb_plan', 'cable')
            if not attrs.get(name)
            and (self.instance is None or getattr(self.instance, name, None) is None)
        ]
        if missing and self.instance is None:
            raise serializers.ValidationError({
                'lines_payload': (
                    '一条排产明细必须挂三件（外壳 / PCB 方案 / 线材）；'
                    f'缺少: {", ".join(missing)}。'
                    '若来自销售明细，请确认该销售明细已挂齐三件。'
                ),
            })

        quantity = attrs.get('quantity') or getattr(self.instance, 'quantity', None)
        if quantity is not None and quantity <= 0:
            raise serializers.ValidationError({'quantity': '数量必须大于 0'})

        return attrs


class ProductionOrderLineSerializer(serializers.ModelSerializer):
    shell_detail = ProductSerializer(source='shell', read_only=True)
    pcb_plan_detail = PcbPlanSerializer(source='pcb_plan', read_only=True)
    cable_detail = ProductSerializer(source='cable', read_only=True)
    sales_order_no = serializers.CharField(source='sales_item.order.order_no', read_only=True, default=None)

    class Meta:
        model = ProductionOrderLine
        fields = [
            'id',
            'sales_item', 'sales_order_no',
            'shell', 'shell_detail',
            'pcb_plan', 'pcb_plan_detail',
            'cable', 'cable_detail',
            'quantity', 'note',
        ]


class ProductionOrderSerializer(serializers.ModelSerializer):
    lines = ProductionOrderLineSerializer(many=True, read_only=True)
    lines_payload = ProductionOrderLineWriteSerializer(many=True, write_only=True, required=False)

    class Meta:
        model = ProductionOrder
        fields = [
            'id', 'order_no', 'plan_date', 'status', 'note', 'operator',
            'created_at', 'executed_at',
            'lines', 'lines_payload',
        ]
        read_only_fields = ['status', 'executed_at', 'created_at']
        extra_kwargs = {
            'order_no': {'required': False, 'allow_blank': True},
            'operator': {'required': False, 'allow_blank': True},
            'note': {'required': False, 'allow_blank': True},
        }

    def create(self, validated_data):
        request = self.context.get('request')
        lines_data = validated_data.pop('lines_payload', [])
        _resolve_operator(validated_data, request)
        if not validated_data.get('order_no'):
            from django.utils import timezone
            validated_data['order_no'] = _generate_sequential_order_no(
                ProductionOrder, f'PRD{timezone.now().year}',
            )
        with transaction.atomic():
            order = ProductionOrder.objects.create(**validated_data)
            for line in lines_data:
                ProductionOrderLine.objects.create(production_order=order, **line)
        return order

    def update(self, instance, validated_data):
        # 只允许在 PLANNED 状态下编辑（且不允许改 status——status 走 execute action）
        if instance.status != 'PLANNED':
            raise serializers.ValidationError({
                'detail': f'排产单已 {instance.get_status_display()}，不允许编辑',
            })
        lines_data = validated_data.pop('lines_payload', None)
        request = self.context.get('request')
        _resolve_operator(validated_data, request)
        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()
            if lines_data is not None:
                existing = {line.id: line for line in instance.lines.select_for_update()}
                retained = set()
                for line_data in lines_data:
                    payload = dict(line_data)
                    line_id = payload.pop('id', None)
                    if line_id is not None:
                        existing_line = existing.get(line_id)
                        if not existing_line:
                            raise serializers.ValidationError({
                                'lines_payload': f'未知的排产明细 ID: {line_id}',
                            })
                        for k, v in payload.items():
                            setattr(existing_line, k, v)
                        existing_line.save()
                        retained.add(line_id)
                    else:
                        ProductionOrderLine.objects.create(production_order=instance, **payload)
                to_delete = set(existing.keys()) - retained
                if to_delete:
                    instance.lines.filter(id__in=to_delete).delete()
        return instance
