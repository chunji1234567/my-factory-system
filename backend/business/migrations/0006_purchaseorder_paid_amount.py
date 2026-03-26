from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('business', '0005_stockadjustment'),
    ]

    operations = [
        migrations.AddField(
            model_name='purchaseorder',
            name='paid_amount',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=15, verbose_name='已付金额'),
        ),
    ]
