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
    ProductionRecord,
)
from .utils import is_manager


def _resolve_operator(validated_data, request):
    if validated_data.get('operator'):
        return
    if request and request.user and request.user.is_authenticated:
        validated_data['operator'] = request.user.get_full_name() or request.user.get_username()


def _generate_sequential_order_no(model_cls, prefix, width=3):
    """根据前缀生成下一条订单号，格式 ``<prefix>-<NNN>``，NNN 默认 3 位。

    2026-06-18 起新格式：``SO-yyyymmdd-NNN`` / ``PO-yyyymmdd-NNN``——
    prefix 包含日期（"SO-20260618"），序号按日重置。详见
    docs/PRD.md 关于订单号约定的讨论。

    必须在 ``transaction.atomic()`` 中调用——内部用 ``select_for_update()``
    锁定当前最大尾号那一行，等本事务提交后其他事务才能读到新最大值，
    从而避免并发碰撞 ``order_no`` 唯一约束。

    回退策略：如果尾号无法解析（例如历史脏数据），从 1 重新开始。
    历史数据（旧格式 ``SO2026-0001``）不受影响——新 prefix 带 "SO-" 横线，
    与旧 prefix "SO2026" 不前缀相交，select_for_update 不会冲突。
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
    return f'{prefix}-{counter:0{width}d}'


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
            'created_at', 'operator', 'items', 'items_payload', 'received_quantity', 'events',
            # 2026-06-18：供应商承诺到货日期。可空，用于收货中心紧迫度提示。
            'expected_arrival_date',
        ]
        # total_amount 是 signal 维护的派生字段——绝对不接受客户端覆盖
        # （详见 docs/PRD.md §4.4 与 signals.sync_purchase_order_ledger 注释）。
        # 客户端如果发了 total_amount，DRF 会静默丢弃。
        read_only_fields = ['total_amount']
        extra_kwargs = {
            'order_no': {'required': False, 'allow_blank': True},
            'operator': {'required': False, 'allow_blank': True},
            'expected_arrival_date': {'required': False, 'allow_null': True},
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
        # 记录原 partner——见 SalesOrderSerializer.update 同款注释。
        old_partner_id = instance.partner_id
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
            # 守卫：partner 变了但本次没动 items 时，手动触发 ledger 同步。
            if items_data is None and old_partner_id != instance.partner_id:
                first_item = instance.items.first()
                if first_item is not None:
                    first_item.save()
        return instance

    def _generate_order_no(self):
        # 新格式 `PO-yyyymmdd-NNN`，序号按日重置 3 位（详见 docs/PRD.md 订单号约定）。
        # 用 localdate() 取本地日期——工厂在中国时区，UTC 会跨日漂移。
        from django.utils import timezone
        prefix = f'PO-{timezone.localdate().strftime("%Y%m%d")}'
        return _generate_sequential_order_no(PurchaseOrder, prefix)


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

    BOM-2.1（2026-05-27）新增 3 个派生量：
      - ``produced_quantity``：本明细已生产总量（所有 ProductionRecord 之和）
      - ``available_to_ship_quantity``：当前可发数量 =
        min(quantity, produced) - shipped
      - 前端用这两个数字在销售/排产/发货面板里展示真实进度。
    """
    product_detail = ProductSerializer(source='product', read_only=True)
    pcb_plan_detail = PcbPlanSerializer(source='pcb_plan', read_only=True)
    cable_detail = ProductSerializer(source='cable', read_only=True)
    shipped_quantity = serializers.SerializerMethodField()
    produced_quantity = serializers.SerializerMethodField()
    available_to_ship_quantity = serializers.SerializerMethodField()
    monetary_fields = ['price']

    class Meta:
        model = SalesOrderItem
        fields = [
            'id',
            'product', 'product_detail',
            'pcb_plan', 'pcb_plan_detail',
            'cable', 'cable_detail',
            'custom_product_name', 'detail_description',
            'price', 'quantity',
            'shipped_quantity', 'produced_quantity', 'available_to_ship_quantity',
        ]

    def get_shipped_quantity(self, obj):
        return obj.shipped_quantity

    def get_produced_quantity(self, obj):
        return obj.produced_quantity

    def get_available_to_ship_quantity(self, obj):
        return obj.available_to_ship_quantity


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
            'created_at', 'operator', 'items', 'events', 'items_payload',
            # 2026-06-18：答应客户的交付日期。可空，用于排产/发货卡片紧迫度提示。
            'expected_delivery_date',
        ]
        # total_amount 是 signal 维护的派生字段——绝对不接受客户端覆盖
        # （详见 docs/PRD.md §4.4 与 signals.sync_sales_order_ledger 注释）。
        # 客户端如果发了 total_amount，DRF 会静默丢弃。
        read_only_fields = ['total_amount']
        extra_kwargs = {
            'order_no': {'required': False, 'allow_blank': True},
            'operator': {'required': False, 'allow_blank': True},
            'expected_delivery_date': {'required': False, 'allow_null': True},
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
        # 记录原 partner——后面要检测是否换了，决定是否手动触发 ledger 同步。
        # signal 只监听 SalesOrderItem 的 save/delete；如果客户端只 PATCH partner
        # 不带 items_payload，item 不动 → signal 不触发 → ledger entry 仍挂在
        # 旧 partner 下，造成双方余额都错。
        old_partner_id = instance.partner_id
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
                        # 减单边界：不能减到 < 已发货（强）；可以减到 < 已生产
                        # （多余成品成为"幽灵库存"，业务侧自管，详见 PRD §9.3）。
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
            # 守卫：若 partner 变了但本次没动 items（items_data is None），
            # 手动触发一次 ledger 同步——保存任意一条 item 即可让 signal 接管。
            # 没有 item 的"裸订单"不会出现在 ledger 里，所以不需要补操作。
            if items_data is None and old_partner_id != instance.partner_id:
                first_item = instance.items.first()
                if first_item is not None:
                    first_item.save()
        return instance

    def _generate_order_no(self):
        # 新格式 `SO-yyyymmdd-NNN`，序号按日重置 3 位（详见 docs/PRD.md 订单号约定）。
        # 用 localdate() 取本地日期——工厂在中国时区，UTC 会跨日漂移。
        from django.utils import timezone
        prefix = f'SO-{timezone.localdate().strftime("%Y%m%d")}'
        return _generate_sequential_order_no(SalesOrder, prefix)


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
        """BOM-2.1 起：可发数量 = min(quantity, produced) - shipped。

        - 受订单数量 ``sales_item.quantity`` 截断（不能发超过订单数）
        - 受已生产 ``produced_quantity`` 截断（不能发未生产的货）
        - 减去已发部分

        详见 docs/PRD.md §4.2 §6 不变量 §9.4 changelog 2026-05-27。
        """
        sales_item = attrs.get('sales_item') or getattr(self.instance, 'sales_item', None)
        quantity = attrs.get('quantity_shipped') or getattr(self.instance, 'quantity_shipped', None)
        if sales_item and quantity is not None:
            shipped = sales_item.shippings.aggregate(total=Sum('quantity_shipped'))['total'] or Decimal('0')
            if self.instance:
                shipped -= self.instance.quantity_shipped
            produced = sales_item.produced_quantity
            cap = min(sales_item.quantity, produced)
            available = max(Decimal('0'), cap - shipped)
            if quantity > available:
                if produced < sales_item.quantity:
                    msg = f'超过可发数量，本明细已生产 {produced} 套、已发 {shipped} 套，剩余可发 {available} 套（尚有 {sales_item.quantity - produced} 套待排产）'
                else:
                    msg = f'超过待发数量，已发 {shipped} 套，剩余可发 {available} 套'
                raise serializers.ValidationError({'quantity_shipped': msg})
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


# ---------- 排产记录（BOM-2.1：append-only 事件，挂在销售明细下） ----------


class ProductionRecordSerializer(serializers.ModelSerializer):
    """ProductionRecord 序列化器（读 + 写共用）。

    BOM-2.1（2026-05-27）重设计——append-only 事件：仅 List + Create + Retrieve，
    没有 update / destroy。详见 docs/PRD.md §3.2 / §4.5。

    业务校验：
      1. ``quantity`` > 0
      2. **过排产禁止**：``sales_item.produced_quantity + quantity
         <= sales_item.quantity``（已生产 + 本次 ≤ 订单数量）
      3. ``sales_item`` 必填（model 层 required，serializer 仅暴露）
      4. ``skip_consumption`` 仅 admin 后台使用——API 写入路径强制 False
         （防止业务侧误用导致库存错乱）。详见 PRD §9.3。

    展示用嵌套：
      - ``sales_order_no``：所属销售单号
      - ``sales_order_id``：所属销售单 ID
      - ``custom_product_name``：销售明细的客户产品名
      - ``partner_name``：客户名
    """

    sales_order_no = serializers.CharField(source='sales_item.order.order_no', read_only=True)
    sales_order_id = serializers.IntegerField(source='sales_item.order_id', read_only=True)
    custom_product_name = serializers.CharField(source='sales_item.custom_product_name', read_only=True)
    partner_name = serializers.CharField(source='sales_item.order.partner.name', read_only=True)

    class Meta:
        model = ProductionRecord
        fields = [
            'id', 'sales_item', 'sales_order_id', 'sales_order_no',
            'custom_product_name', 'partner_name',
            'quantity', 'operator', 'note', 'executed_at',
            # skip_consumption 默认值 False；API 写入路径忽略调用方传值（见 create()）
        ]
        read_only_fields = ['executed_at', 'operator', 'sales_order_no', 'sales_order_id', 'custom_product_name', 'partner_name']
        extra_kwargs = {
            'note': {'required': False, 'allow_blank': True},
        }

    def validate_quantity(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError('本次产量必须大于 0')
        return value

    def validate(self, attrs):
        sales_item = attrs.get('sales_item')
        quantity = attrs.get('quantity')
        if sales_item and quantity is not None:
            # 校验三件齐备（销售明细本身没有三件 = 设计期就缺数据）
            missing = [
                slot for slot in ('product', 'pcb_plan', 'cable')
                if getattr(sales_item, slot, None) is None
            ]
            if missing:
                raise serializers.ValidationError({
                    'sales_item': f'销售明细缺少: {", ".join(missing)}，无法排产',
                })
            # 过排产校验：已生产 + 本次 ≤ 订单数量
            already_produced = sales_item.produced_quantity
            if already_produced + quantity > sales_item.quantity:
                remaining = sales_item.quantity - already_produced
                raise serializers.ValidationError({
                    'quantity': (
                        f'超过订单待排产数量：订单总量 {sales_item.quantity}、'
                        f'已生产 {already_produced}、本次最多可排 {max(0, remaining)} 套'
                    ),
                })
        return attrs

    def create(self, validated_data):
        """API 写入路径：强制 skip_consumption=False（仅 admin 可绕过）。

        操作员默认从 request.user 注入，调用方不应传 operator 字段。
        """
        request = self.context.get('request')
        _resolve_operator(validated_data, request)
        # 安全闸：API 调用不允许直接 skip 扣料；如需要走 admin 后台。
        validated_data['skip_consumption'] = False
        return super().create(validated_data)
