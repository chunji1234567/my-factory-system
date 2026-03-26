# Generated manually for stock adjustment feature

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_alter_category_options_alter_partner_options_and_more'),
        ('business', '0004_alter_purchaseorder_options_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='StockAdjustment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('adjustment_type', models.CharField(choices=[('MANUAL_IN', '手动入库/盘盈'), ('MANUAL_OUT', '手动出库/盘亏'), ('PRODUCE_IN', '生产入库')], max_length=20, verbose_name='调整类型')),
                ('quantity', models.DecimalField(decimal_places=2, max_digits=12, verbose_name='调整数量')),
                ('note', models.CharField(blank=True, max_length=200, verbose_name='备注')),
                ('operator', models.CharField(max_length=50, verbose_name='操作员')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='core.product', verbose_name='调整物料')),
            ],
            options={
                'verbose_name': '库存调整',
                'verbose_name_plural': '库存调整',
            },
        ),
    ]
