from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Product, Category, Partner

User = get_user_model()

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'category_type']

class ProductSerializer(serializers.ModelSerializer):
    # 将分类的详细信息也包含进来
    category_detail = CategorySerializer(source='category', read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'category', 'internal_code', 'model_name', 'image',
            'unit', 'stock_quantity', 'min_stock', 'category_detail'
        ]


class PartnerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Partner
        fields = ['id', 'name', 'partner_type', 'balance']


class CurrentUserSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'full_name', 'roles']

    def get_roles(self, obj):
        return list(obj.groups.values_list('name', flat=True))

    def get_full_name(self, obj):
        return obj.get_full_name() or ''
