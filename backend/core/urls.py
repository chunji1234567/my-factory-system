# core/urls.py
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ProductListView,
    CategoryListView,
    PartnerListCreateView,
    PcbPlanViewSet,
    CurrentUserView,
)

# PCB 方案是个完整的 CRUD ViewSet，用 router 注册。
router = DefaultRouter()
router.register(r'pcb-plans', PcbPlanViewSet, basename='pcb-plan')

urlpatterns = [
    path('products/', ProductListView.as_view(), name='product-list'),
    path('categories/', CategoryListView.as_view(), name='category-list'),
    path('partners/', PartnerListCreateView.as_view(), name='partner-list-create'),
    path('me/', CurrentUserView.as_view(), name='current-user'),
    # ViewSet：/api/core/pcb-plans/ 与 /api/core/pcb-plans/{id}/
    path('', include(router.urls)),
]
