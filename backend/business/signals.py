from decimal import Decimal

from django.db import transaction
from django.db.models import F, Sum
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from .models import (
    FinancialTransaction,
    PartnerLedgerEntry,
    PurchaseOrder,
    PurchaseOrderItem,
    ReceivingLog,
    SalesOrder,
    SalesOrderItem,
    ShippingLog,
)


def _split_amount(value: Decimal):
    debit = value if value > 0 else Decimal('0')
    credit = -value if value < 0 else Decimal('0')
    return debit, credit


def _record_partner_ledger(partner, amount, entry_type, **kwargs):
    delta_value = Decimal(amount or 0)
    if not delta_value:
        return None
    debit_amount, credit_amount = _split_amount(delta_value)
    return PartnerLedgerEntry.objects.create(
        partner=partner,
        amount=delta_value,
        debit_amount=debit_amount,
        credit_amount=credit_amount,
        entry_type=entry_type,
        **kwargs,
    )


# --- 1. 金额自动汇总逻辑 ---


@receiver([post_save, post_delete], sender=SalesOrderItem)
def update_sales_order_total(sender, instance, **kwargs):
    """当销售明细变动时，自动重新计算订单总额"""
    with transaction.atomic():
        order = SalesOrder.objects.select_for_update().get(pk=instance.order_id)
        prev_total = order.total_amount or Decimal('0')
        res = order.items.aggregate(total=Sum(F('price') * F('quantity')))
        new_total = res['total'] or Decimal('0')
        if prev_total == new_total:
            return
        order.total_amount = new_total
        order.save(update_fields=['total_amount'])
        _record_partner_ledger(
            order.partner,
            new_total - prev_total,
            'SALES',
            sales_order=order,
            note=f'销售订单 {order.order_no}',
        )


@receiver([post_save, post_delete], sender=PurchaseOrderItem)
def update_purchase_order_total(sender, instance, **kwargs):
    """当采购明细变动时，自动重新计算采购单总额"""
    order = instance.order
    prev_total = order.total_amount or Decimal('0')
    res = order.items.aggregate(total=Sum(F('price') * F('quantity')))
    new_total = res['total'] or Decimal('0')
    if prev_total == new_total:
        return
    order.total_amount = new_total
    order.save(update_fields=['total_amount'])
    _record_partner_ledger(
        order.partner,
        new_total - prev_total,
        'PURCHASE',
        purchase_order=order,
        note=f'采购订单 {order.order_no}',
    )


@receiver(post_delete, sender=SalesOrder)
def cleanup_sales_order(sender, instance, **kwargs):
    _record_partner_ledger(
        instance.partner,
        -instance.total_amount,
        'SALES',
        sales_order=instance,
        note=f'删除销售订单 {instance.order_no}',
    )


@receiver(post_delete, sender=PurchaseOrder)
def cleanup_purchase_order(sender, instance, **kwargs):
    _record_partner_ledger(
        instance.partner,
        -instance.total_amount,
        'PURCHASE',
        purchase_order=instance,
        note=f'删除采购订单 {instance.order_no}',
    )


# --- 2. 订单状态自动切换逻辑 ---


@receiver(post_save, sender=ShippingLog)
def auto_complete_sales_order(sender, instance, **kwargs):
    """根据发货总量自动更新销售订单状态"""
    order = instance.sales_item.order
    items = order.items.all()

    is_fully_shipped = True
    for item in items:
        if item.shipped_quantity < item.quantity:
            is_fully_shipped = False
            break

    if is_fully_shipped:
        order.status = 'COMPLETED'
    else:
        order.status = 'SHIPPED'
    order.save()


@receiver(post_save, sender=ReceivingLog)
def auto_update_purchase_status(sender, instance, **kwargs):
    """根据入库总量自动更新采购单状态"""
    order = instance.purchase_item.order
    items = order.items.all()

    total_needed = sum(item.quantity for item in items)
    total_received = 0
    for item in items:
        total_received += item.receipts.aggregate(total=Sum('quantity_received'))['total'] or 0

    if total_received >= total_needed:
        order.status = 'RECEIVED'
    elif total_received > 0:
        order.status = 'PARTIAL'
    order.save()


# --- 3. 财务与余额联动 ---


@receiver(post_save, sender=FinancialTransaction)
def ensure_transaction_ledger(sender, instance, created, **kwargs):
    note = instance.note or ''
    entry = getattr(instance, 'ledger_entry', None)

    if created or entry is None:
        _record_partner_ledger(
            instance.partner,
            instance.amount,
            'FINANCE',
            transaction=instance,
            note=note,
        )
        return

    if entry.partner_id != instance.partner_id:
        entry.delete()
        _record_partner_ledger(
            instance.partner,
            instance.amount,
            'FINANCE',
            transaction=instance,
            note=note,
        )
    else:
        entry.amount = instance.amount
        debit_amount, credit_amount = _split_amount(Decimal(instance.amount or 0))
        entry.debit_amount = debit_amount
        entry.credit_amount = credit_amount
        entry.note = note
        entry.save(update_fields=['amount', 'debit_amount', 'credit_amount', 'note'])


@receiver(pre_save, sender=PartnerLedgerEntry)
def store_previous_ledger_state(sender, instance, **kwargs):
    if not instance.pk:
        instance._previous_amount = Decimal('0')
        instance._previous_partner_id = instance.partner_id
        return

    previous = PartnerLedgerEntry.objects.get(pk=instance.pk)
    instance._previous_amount = previous.amount
    instance._previous_partner_id = previous.partner_id


@receiver(post_save, sender=PartnerLedgerEntry)
def apply_ledger_to_partner_balance(sender, instance, created, **kwargs):
    from django.db.models import F
    from core.models import Partner

    prev_amount = getattr(instance, '_previous_amount', Decimal('0'))
    prev_partner_id = getattr(instance, '_previous_partner_id', instance.partner_id)

    if instance.partner_id == prev_partner_id:
        delta = instance.amount - prev_amount
        if delta:
            Partner.objects.filter(pk=instance.partner_id).update(balance=F('balance') + delta)
    else:
        if prev_amount and prev_partner_id:
            Partner.objects.filter(pk=prev_partner_id).update(balance=F('balance') - prev_amount)
        if instance.amount:
            Partner.objects.filter(pk=instance.partner_id).update(balance=F('balance') + instance.amount)


@receiver(post_delete, sender=PartnerLedgerEntry)
def remove_ledger_from_balance(sender, instance, **kwargs):
    from django.db.models import F
    from core.models import Partner

    if instance.amount:
        Partner.objects.filter(pk=instance.partner_id).update(balance=F('balance') - instance.amount)
