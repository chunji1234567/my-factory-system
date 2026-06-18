"""业务领域的信号链。

设计要点（2026-05-11 重设计后，详见 docs/PRD.md §3.2 与 §9.4 changelog）：

1. **台账采用快照模式**：同一订单 / 同一笔流水在 ``PartnerLedgerEntry``
   中**最多只有一条**条目（OneToOne FK 强制）。订单或流水变动时
   ``update_or_create`` 覆写现有条目，没有"delta 流水"。
2. **``Partner.balance`` 不再是字段**，而是只读 ``@property`` 直接
   求和 ``ledger_entries``。无需信号维护余额缓存。
3. **删订单 = 从未发生**：``PartnerLedgerEntry`` 的三个外键都是
   ``on_delete=CASCADE``，删订单 → 删条目 → 余额自动归位（property 重新求和）。
4. **CASCADE 守卫**：item 的 ``post_delete`` 可能由父订单 CASCADE 触发，
   此时不应再做台账写入——CASCADE 会一并清掉条目，重复写入会留下悬空 FK。

整个模块共 5 个信号：
- sync_sales_order_ledger
- sync_purchase_order_ledger
- sync_transaction_ledger
- auto_complete_sales_order  （状态机，与台账无关）
- auto_update_purchase_status（同上）
"""
from decimal import Decimal

from django.db import transaction
from django.db.models import F, QuerySet, Sum
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from .models import (
    FinancialTransaction,
    PartnerLedgerEntry,
    ProductionRecord,
    PurchaseOrder,
    PurchaseOrderItem,
    ReceivingLog,
    SalesOrder,
    SalesOrderItem,
    ShippingLog,
    StockAdjustment,
)


def _split_amount(value: Decimal):
    """把带符号金额拆成借方（正数部分）与贷方（负数的绝对值）。"""
    debit = value if value > 0 else Decimal('0')
    credit = -value if value < 0 else Decimal('0')
    return debit, credit


def _is_cascade_from(origin, parent_model):
    """识别本次 post_delete 是否由父模型的 CASCADE 触发。

    Django 6 在 ``pre_delete`` / ``post_delete`` 信号中通过 ``origin`` kwarg
    传入"最初触发删除的对象"——可能是 model 实例（``parent.delete()``）
    或 queryset（``Model.objects.filter(...).delete()``）。两种形态都要识别，
    否则 queryset 删除会绕过守卫，写出悬空 FK 的孤儿条目。
    """
    if isinstance(origin, parent_model):
        return True
    if isinstance(origin, QuerySet) and origin.model is parent_model:
        return True
    return False


# --- 1. 台账快照同步（"一个事实，一条条目"） ---


@receiver([post_save, post_delete], sender=SalesOrderItem)
def sync_sales_order_ledger(sender, instance, **kwargs):
    """销售明细变动时，重算订单总额并同步唯一的 SALES 台账条目。

    行为：
    - new_total > 0：``update_or_create`` 把该订单的 SALES 条目设为 new_total。
    - new_total == 0：删除该订单的 SALES 条目（订单存在但无活跃明细，
      不计入余额）。
    - origin 是 SalesOrder 或对应 queryset：跳过，CASCADE 会清条目。
    """
    if _is_cascade_from(kwargs.get('origin'), SalesOrder):
        return
    try:
        order = SalesOrder.objects.get(pk=instance.order_id)
    except SalesOrder.DoesNotExist:
        return

    with transaction.atomic():
        # 锁定该行避免并发同步互相覆盖（与 ReceivingLog.save 内的 select_for_update 同口径）。
        order = SalesOrder.objects.select_for_update().get(pk=order.pk)
        new_total = order.items.aggregate(t=Sum(F('price') * F('quantity')))['t'] or Decimal('0')
        if order.total_amount != new_total:
            order.total_amount = new_total
            order.save(update_fields=['total_amount'])

        if new_total == 0:
            PartnerLedgerEntry.objects.filter(sales_order=order).delete()
            return

        debit, credit = _split_amount(new_total)
        PartnerLedgerEntry.objects.update_or_create(
            sales_order=order,
            defaults={
                'partner': order.partner,
                'entry_type': 'SALES',
                'amount': new_total,
                'debit_amount': debit,
                'credit_amount': credit,
                'note': f'销售订单 {order.order_no}',
            },
        )


@receiver([post_save, post_delete], sender=PurchaseOrderItem)
def sync_purchase_order_ledger(sender, instance, **kwargs):
    """采购明细变动时，重算采购单总额并同步唯一的 PURCHASE 台账条目。"""
    if _is_cascade_from(kwargs.get('origin'), PurchaseOrder):
        return
    try:
        order = PurchaseOrder.objects.get(pk=instance.order_id)
    except PurchaseOrder.DoesNotExist:
        return

    with transaction.atomic():
        order = PurchaseOrder.objects.select_for_update().get(pk=order.pk)
        new_total = order.items.aggregate(t=Sum(F('price') * F('quantity')))['t'] or Decimal('0')
        if order.total_amount != new_total:
            order.total_amount = new_total
            order.save(update_fields=['total_amount'])

        if new_total == 0:
            PartnerLedgerEntry.objects.filter(purchase_order=order).delete()
            return

        debit, credit = _split_amount(new_total)
        PartnerLedgerEntry.objects.update_or_create(
            purchase_order=order,
            defaults={
                'partner': order.partner,
                'entry_type': 'PURCHASE',
                'amount': new_total,
                'debit_amount': debit,
                'credit_amount': credit,
                'note': f'采购订单 {order.order_no}',
            },
        )


@receiver(post_save, sender=FinancialTransaction)
def sync_transaction_ledger(sender, instance, **kwargs):
    """财务流水写入或更新对应 FINANCE 台账条目。

    序列化器已经把 RECEIPT / PAYMENT 的 amount 取过负号；这里直接采纳。
    流水 amount=0 视为"无意义"，删除已存在的条目。
    流水删除走 OneToOne CASCADE，不需要单独信号。
    """
    if instance.amount == 0:
        PartnerLedgerEntry.objects.filter(transaction=instance).delete()
        return
    debit, credit = _split_amount(Decimal(instance.amount))
    PartnerLedgerEntry.objects.update_or_create(
        transaction=instance,
        defaults={
            'partner': instance.partner,
            'entry_type': 'FINANCE',
            'amount': instance.amount,
            'debit_amount': debit,
            'credit_amount': credit,
            'note': instance.note or '',
        },
    )


# --- 2. 订单状态自动切换 ---


@receiver(post_save, sender=ShippingLog)
def auto_complete_sales_order(sender, instance, **kwargs):
    """根据发货总量自动更新销售订单状态。"""
    order = instance.sales_item.order
    items = order.items.all()

    is_fully_shipped = True
    for item in items:
        if item.shipped_quantity < item.quantity:
            is_fully_shipped = False
            break

    order.status = 'COMPLETED' if is_fully_shipped else 'SHIPPED'
    order.save()


@receiver(post_save, sender=ReceivingLog)
def auto_update_purchase_status(sender, instance, **kwargs):
    """根据入库总量自动更新采购单状态。"""
    order = instance.purchase_item.order
    items = order.items.all()

    total_needed = sum(item.quantity for item in items)
    total_received = Decimal('0')
    for item in items:
        total_received += item.receipts.aggregate(total=Sum('quantity_received'))['total'] or Decimal('0')

    if total_received >= total_needed:
        order.status = 'RECEIVED'
    elif total_received > 0:
        order.status = 'PARTIAL'
    order.save()


# --- 3. 排产扣料（BOM-2.1：append-only ProductionRecord 创建即扣料） ---


@receiver(post_save, sender=ProductionRecord)
def auto_consume_on_production_record_create(sender, instance, created, **kwargs):
    """``ProductionRecord`` **创建时**扣料。BOM-2.1 重设计（2026-05-27）。

    对每条新记录写 **(2 + N) 条** ``StockAdjustment(PRODUCE_CONSUME)``：
      - 1 条扣 ``sales_item.product``（外壳半成品，instance.quantity 个）
      - 1 条扣 ``sales_item.cable``（线材半成品，instance.quantity 个）
      - N 条扣 ``sales_item.pcb_plan.materials`` 展开的原材料；每条数量 =
        ``instance.quantity * material.quantity_per_unit``

    三件物料全部从 ``sales_item`` 读，不在 ProductionRecord 上独立存储——
    单一真相来源，避免数据漂移。

    **append-only**：post_save 只在 ``created=True`` 时触发（理论上 PATCH 也
    走 post_save，但 ViewSet 已禁止 update，serializer 层也无 update 路径，
    所以这里只是双保险）。

    **skip_consumption=True**：跳过扣料——admin 内部用于"跨订单挪用已生产
    成品"等边缘场景（详见 docs/PRD.md §9.3）。

    业务语义：SMT 加工商按方案领料贴片送回 + 自家工坊装配——这三步在系统里
    合并为一个原子动作。允许库存变负（补货节奏与排产解耦）。

    详见 docs/PRD.md §3.2 / §4.5 / §9.4 changelog 2026-05-27（BOM-2.1）。
    """
    if not created:
        return
    if instance.skip_consumption:
        return

    with transaction.atomic():
        item = (
            SalesOrderItem.objects
            .select_related('product', 'cable', 'pcb_plan')
            .prefetch_related('pcb_plan__materials__material')
            .get(pk=instance.sales_item_id)
        )
        qty = instance.quantity
        note_prefix = f'排产 #{instance.id} SO-item {item.id}'

        # (1) 外壳：1 条
        if item.product is not None:
            StockAdjustment.objects.create(
                product=item.product,
                adjustment_type='PRODUCE_CONSUME',
                quantity=qty,
                note=f'{note_prefix} 消耗 外壳',
                operator=instance.operator,
            )
        # (2) 线材：1 条
        if item.cable is not None:
            StockAdjustment.objects.create(
                product=item.cable,
                adjustment_type='PRODUCE_CONSUME',
                quantity=qty,
                note=f'{note_prefix} 消耗 线材',
                operator=instance.operator,
            )
        # (3) PCB 方案展开：N 条
        if item.pcb_plan is not None:
            for plan_material in item.pcb_plan.materials.all():
                StockAdjustment.objects.create(
                    product=plan_material.material,
                    adjustment_type='PRODUCE_CONSUME',
                    quantity=qty * plan_material.quantity_per_unit,
                    note=(
                        f'{note_prefix} 消耗 [{item.pcb_plan.name}] '
                        f'{plan_material.material.model_name}'
                    ),
                    operator=instance.operator,
                )


@receiver(post_save, sender=ProductionRecord)
def auto_promote_to_producing(sender, instance, created, **kwargs):
    """首条 ProductionRecord 创建时把销售单 status 推到 PRODUCING。BOM-2.1。

    业务语义：销售单从"已下单未生产"切到"生产中"应该由实际生产事件驱动，
    而不是 manager 手动 PATCH。这条信号让状态机真正活起来——`PRODUCING`
    状态终于有了自动来源。

    仅在创建（created=True）时触发；推进规则：
      - 当前 status == ORDERED → 推到 PRODUCING
      - 当前 status 已经是 PRODUCING / SHIPPED / COMPLETED → 保持不变
        （SHIPPED 已经是 PRODUCING 的下游状态；倒退由 ShippingLog
        删除时另外处理——目前业务上不支持删 ShippingLog，先不实现）

    详见 docs/PRD.md §4.2 §9.4 changelog 2026-05-27（BOM-2.1）。
    """
    if not created:
        return
    order = instance.sales_item.order
    if order.status == 'ORDERED':
        order.status = 'PRODUCING'
        order.save(update_fields=['status'])


# 历史信号清单（已删除，请勿恢复，详见 docs/PRD.md §9.4 changelog 2026-05-11）：
# - cleanup_sales_order / cleanup_purchase_order：post_delete on SalesOrder/PurchaseOrder
#   写"反向"台账。问题：用刚被删的 instance 作为 FK → 悬空外键；
#   与 CASCADE 叠加 → 余额双重抵消。
# - store_previous_ledger_state / apply_ledger_to_partner_balance /
#   remove_ledger_from_balance：维护 Partner.balance 冗余字段。Partner.balance
#   已改为只读 property，这三个信号已无意义。
# - update_sales_order_total / update_purchase_order_total：delta 模式记账。
#   现已重写为 snapshot 模式（sync_*_order_ledger）。
