"""Bootstrap default role groups (manager/warehouse/shipper) with permissions."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Sequence

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType

from core.models import Category, Partner, Product
from business.models import (
    PurchaseOrder,
    PurchaseOrderItem,
    ReceivingLog,
    StockAdjustment,
    SalesOrder,
    SalesOrderItem,
    ShippingLog,
    OrderEvent,
)

User = get_user_model()


@dataclass(frozen=True)
class PermissionSpec:
    model: type
    actions: Sequence[str] = ('view',)


@dataclass(frozen=True)
class DemoUser:
    username: str
    password: str
    full_name: str


@dataclass(frozen=True)
class RoleDefinition:
    name: str
    description: str
    permissions: str | Sequence[PermissionSpec]
    demo_users: Sequence[DemoUser] = field(default_factory=tuple)


WAREHOUSE_PERMISSIONS: Sequence[PermissionSpec] = (
    PermissionSpec(Category, ('view', 'add', 'change')),
    PermissionSpec(Product, ('view', 'add', 'change')),
    PermissionSpec(PurchaseOrder, ('view', 'change')),
    PermissionSpec(PurchaseOrderItem, ('view',)),
    PermissionSpec(ReceivingLog, ('view', 'add')),
    PermissionSpec(StockAdjustment, ('view', 'add')),
    PermissionSpec(Partner, ('view',)),
)

SHIPPER_PERMISSIONS: Sequence[PermissionSpec] = (
    PermissionSpec(SalesOrder, ('view', 'change')),
    PermissionSpec(SalesOrderItem, ('view',)),
    PermissionSpec(ShippingLog, ('view', 'add')),
    PermissionSpec(OrderEvent, ('view',)),
    PermissionSpec(Partner, ('view',)),
)

ROLE_DEFINITIONS: Sequence[RoleDefinition] = (
    RoleDefinition(
        name='manager',
        description='全局权限：可创建/审批所有采购、销售、财务与库存操作。',
        permissions='all',
        demo_users=(DemoUser('manager_demo', 'manager123', '业务经理'),),
    ),
    RoleDefinition(
        name='warehouse',
        description='仓库与物料管理员：维护分类/产品，更新采购单状态，录入收货&库存调整。',
        permissions=WAREHOUSE_PERMISSIONS,
        demo_users=(DemoUser('warehouse_demo', 'warehouse123', '仓库管理员'),),
    ),
    RoleDefinition(
        name='shipper',
        description='发货人员：查看/更新销售单状态并记录发货日志。',
        permissions=SHIPPER_PERMISSIONS,
        demo_users=(DemoUser('shipper_demo', 'shipper123', '发货员'),),
    ),
)


def _permission_for(action: str, model: type) -> Permission:
    ct = ContentType.objects.get_for_model(model)
    codename = f"{action}_{model._meta.model_name}"
    return Permission.objects.get(content_type=ct, codename=codename)


def _resolve_permissions(specs: Sequence[PermissionSpec]) -> list[Permission]:
    resolved: list[Permission] = []
    for spec in specs:
        for action in spec.actions:
            perm = _permission_for(action, spec.model)
            resolved.append(perm)
    return resolved


def _assign_permissions(group: Group, definition: RoleDefinition) -> list[Permission]:
    if definition.permissions == 'all':
        perms = list(
            Permission.objects.filter(content_type__app_label__in=['core', 'business'])
        )
    else:
        perms = _resolve_permissions(definition.permissions)
    group.permissions.set(perms)
    return perms


def _ensure_demo_users(group: Group, demo_users: Sequence[DemoUser]) -> None:
    for demo in demo_users:
        user, created = User.objects.get_or_create(
            username=demo.username,
            defaults={'first_name': demo.full_name},
        )
        if created:
            user.set_password(demo.password)
        user.is_active = True
        user.save()
        user.groups.add(group)


def _format_permissions(perms: Iterable[Permission]) -> str:
    sorted_codes = sorted(perm.codename for perm in perms)
    if not sorted_codes:
        return '  (no explicit permissions)'
    lines = [f"  - {code}" for code in sorted_codes]
    return '\n'.join(lines)


def main() -> None:
    print('Configuring default role groups...')
    for definition in ROLE_DEFINITIONS:
        group, _ = Group.objects.get_or_create(name=definition.name)
        perms = _assign_permissions(group, definition)
        _ensure_demo_users(group, definition.demo_users)
        print(f"[{definition.name}] {definition.description}")
        if definition.permissions == 'all':
            print('  - granted ALL permissions in core/business apps')
        else:
            print(_format_permissions(perms))
    print('Role groups ready.')


if __name__ == '__main__':
    main()
