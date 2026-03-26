# core/views.py
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Product, Category, Partner
from .serializers import (
    ProductSerializer,
    CategorySerializer,
    PartnerSerializer,
    CurrentUserSerializer,
)
from business.api.permissions import IsManager, IsManagerOrWarehouse

class ProductListView(generics.ListCreateAPIView):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsManagerOrWarehouse()]
        return super().get_permissions()


class CategoryListView(generics.ListCreateAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsManagerOrWarehouse()]
        return super().get_permissions()


class PartnerListCreateView(generics.ListCreateAPIView):
    queryset = Partner.objects.all()
    serializer_class = PartnerSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsManager()]
        return super().get_permissions()


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = CurrentUserSerializer(request.user)
        return Response(serializer.data)
