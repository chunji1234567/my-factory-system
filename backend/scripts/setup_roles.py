"""Create default manager/warehouse/shipper groups and demo users."""
from django.contrib.auth.models import Group, Permission, User
from django.contrib.contenttypes.models import ContentType
from business.models import PurchaseOrder, SalesOrder, StockAdjustment

ROLE_CONFIG = {
    'manager': {
        'permissions': 'all',
        'users': [('manager_demo', 'manager123', '业务经理')],
    },
    'warehouse': {
        'permissions': [
            ('view', PurchaseOrder),
            ('view', StockAdjustment),
            ('add', StockAdjustment),
        ],
        'users': [('warehouse_demo', 'warehouse123', '仓库管理员')],
    },
    'shipper': {
        'permissions': [
            ('view', SalesOrder),
        ],
        'users': [('shipper_demo', 'shipper123', '发货员')],
    },
}


def ensure_permission(codename_prefix, model_cls):
    ct = ContentType.objects.get_for_model(model_cls)
    codename = f"{codename_prefix}_{model_cls._meta.model_name}"
    return Permission.objects.get(content_type=ct, codename=codename)


def assign_group_permissions(group, config):
    if config['permissions'] == 'all':
        perms = Permission.objects.filter(content_type__app_label__in=['core', 'business'])
        group.permissions.set(perms)
    else:
        group.permissions.set(
            [ensure_permission(prefix, model) for prefix, model in config['permissions']]
        )


def ensure_user(username, password, group, full_name):
    user, created = User.objects.get_or_create(username=username)
    if created:
        user.set_password(password)
        user.first_name = full_name
        user.save()
    user.groups.add(group)
    return user


def main():
    for role, config in ROLE_CONFIG.items():
        group, _ = Group.objects.get_or_create(name=role)
        assign_group_permissions(group, config)
        for username, password, full_name in config.get('users', []):
            ensure_user(username, password, group, full_name)
    print("Role groups and demo users ready.")


if __name__ == '__main__':
    main()
