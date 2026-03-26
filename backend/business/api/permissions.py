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
