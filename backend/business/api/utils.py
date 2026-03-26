from django.contrib.auth.models import Group

MANAGER_GROUP = 'manager'
WAREHOUSE_GROUP = 'warehouse'
SHIPPER_GROUP = 'shipper'


def _is_in_group(user, group_name):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return user.groups.filter(name=group_name).exists()


def is_manager(user):
    return _is_in_group(user, MANAGER_GROUP)


def is_warehouse(user):
    return _is_in_group(user, WAREHOUSE_GROUP)


def is_shipper(user):
    return _is_in_group(user, SHIPPER_GROUP)


def user_has_any_role(user, groups):
    return any(_is_in_group(user, name) for name in groups)
