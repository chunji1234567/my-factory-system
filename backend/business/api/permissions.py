from rest_framework.permissions import BasePermission, SAFE_METHODS

from .utils import is_manager, is_warehouse, is_shipper


class IsManager(BasePermission):
    def has_permission(self, request, view):
        return is_manager(request.user)


class IsManagerOrWarehouse(BasePermission):
    def has_permission(self, request, view):
        return is_manager(request.user) or is_warehouse(request.user)


class IsManagerOrShipper(BasePermission):
    def has_permission(self, request, view):
        return is_manager(request.user) or is_shipper(request.user)


class ManagerOrWarehouseReadOnly(BasePermission):
    """Managers full access; warehouse read-only."""

    def has_permission(self, request, view):
        if is_manager(request.user):
            return True
        if request.method in SAFE_METHODS and is_warehouse(request.user):
            return True
        return False


class ManagerOrShipperReadOnly(BasePermission):
    """Managers full access; shipper read-only."""

    def has_permission(self, request, view):
        if is_manager(request.user):
            return True
        if request.method in SAFE_METHODS and is_shipper(request.user):
            return True
        return False


class ManagerOrFulfillmentReadOnly(BasePermission):
    """Managers 全权；warehouse + shipper（生产/物流环节）只读。

    适用场景：销售订单（SalesOrderViewSet）等"既是销售数据又是生产/物流上游
    凭证"的资源——manager 维护订单本身，但仓库需要按销售明细排产（详见
    docs/PRD.md §4.5 排产流程），物流需要按订单找待发货明细。
    """

    def has_permission(self, request, view):
        if is_manager(request.user):
            return True
        if request.method in SAFE_METHODS and (
            is_warehouse(request.user) or is_shipper(request.user)
        ):
            return True
        return False
