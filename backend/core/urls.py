# core/urls.py
from django.urls import path
from .views import (
    ProductListView,
    CategoryListView,
    PartnerListCreateView,
    CurrentUserView,
)

urlpatterns = [
    # 这里的路径是相对于总路由的，所以留空或写 products/
    path('products/', ProductListView.as_view(), name='product-list'),
    path('categories/', CategoryListView.as_view(), name='category-list'),
    path('partners/', PartnerListCreateView.as_view(), name='partner-list-create'),
    path('me/', CurrentUserView.as_view(), name='current-user'),
]
