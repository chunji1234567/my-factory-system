from django.contrib import admin
from django.utils.html import format_html
from .models import Partner, Category, Product

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    # 在列表页显示的字段
    list_display = ('internal_code', 'display_image', 'model_name', 'category', 'stock_quantity')
    # 搜索框
    search_fields = ('internal_code', 'model_name')
    # 过滤器
    list_filter = ('category',)

    # 这是一个“黑科技”：在后台直接渲染图片
    def display_image(self, obj):
        if obj.image:
            return format_html('<img src="{}" style="width: 50px; height: auto;" />', obj.image.url)
        return "无图片"
    display_image.short_description = '外观图'

admin.site.register(Partner)
admin.site.register(Category)