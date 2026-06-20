from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Product, Category, Partner, PcbPlan, PcbPlanMaterial

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


class PcbPlanMaterialSerializer(serializers.ModelSerializer):
    """PCB 方案明细——展示用 + 写入用同一个 serializer。

    校验：``material`` 必须是 ``RAW_MATERIAL`` 类型；``quantity_per_unit`` > 0。
    （unique_together 由 model 保证）。
    """

    material_detail = ProductSerializer(source='material', read_only=True)

    class Meta:
        model = PcbPlanMaterial
        fields = ['id', 'material', 'material_detail', 'quantity_per_unit', 'note']

    def validate_quantity_per_unit(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError('单板用量必须 > 0')
        return value

    def validate_material(self, value: Product):
        if value.category.category_type != 'RAW_MATERIAL':
            raise serializers.ValidationError(
                f'材料必须是 RAW_MATERIAL 类型，当前选中: {value.category.get_category_type_display()}'
            )
        return value


class PcbPlanLightSerializer(serializers.ModelSerializer):
    """PCB 方案的"轻量"序列化器——**不展开 materials**。

    2026-06-19 性能加固：销售订单 list 接口每条 item 都嵌套 pcb_plan_detail
    时，每个 PcbPlanSerializer 又展开 24-37 条 materials + 每条 material 又
    嵌套 material_detail（Product 全字段）+ category_detail。200 张订单 ×
    3 items × 30 materials ≈ 18000 个嵌套对象，序列化 + JSON 编码就是
    10+ 秒（详见 docs/PRD.md §9.4 changelog）。

    grep 确认 ``pcb_plan.materials`` 数组**只在 PcbPlanPanel 单独使用**——
    销售/采购/排产/发货面板都不读它。所以这些 list 接口换用 LightSerializer
    就够；想看 materials 的场景（PcbPlanPanel）走 ``/api/core/pcb-plans/``
    自己 endpoint，仍用完整版。

    与 ``PcbPlanSerializer`` 的字段差：
      - 无 ``materials``（也就 ~5KB / 条的节省）
      - 其他字段全保留——前端展示方案名/编号/是否启用都还要用
    """

    class Meta:
        model = PcbPlan
        fields = [
            'id', 'name', 'code', 'description', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class PcbPlanSerializer(serializers.ModelSerializer):
    """PCB 方案——支持 nested materials 写入。

    创建 / 更新时，``materials`` 字段传一组 `{material, quantity_per_unit, note}` 即可。
    更新策略：**全量替换**——传入的列表会替换原有 materials（删旧建新）。这是
    config 类对象的常见做法，避免前端需要管理 material 子项的 id。
    """

    materials = PcbPlanMaterialSerializer(many=True, required=False)

    class Meta:
        model = PcbPlan
        fields = [
            'id', 'name', 'code', 'description', 'is_active',
            'created_at', 'updated_at', 'materials',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def create(self, validated_data):
        materials_data = validated_data.pop('materials', [])
        plan = PcbPlan.objects.create(**validated_data)
        for mat_data in materials_data:
            PcbPlanMaterial.objects.create(plan=plan, **mat_data)
        return plan

    def update(self, instance, validated_data):
        materials_data = validated_data.pop('materials', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        # 全量替换 materials（如果调用方显式传了 materials 列表）
        if materials_data is not None:
            instance.materials.all().delete()
            for mat_data in materials_data:
                PcbPlanMaterial.objects.create(plan=instance, **mat_data)
        return instance


class PartnerSerializer(serializers.ModelSerializer):
    # Partner.balance 是 property（详见 core/models.py），需要显式声明
    # 才能让 ModelSerializer 序列化。注解 read_only 因为余额由信号链派生，
    # 不允许通过 API 直接写入。
    balance = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)

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
