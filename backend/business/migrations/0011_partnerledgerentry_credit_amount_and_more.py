from decimal import Decimal
from django.db import migrations, models


def populate_ledger_debit_credit(apps, schema_editor):
    Ledger = apps.get_model('business', 'PartnerLedgerEntry')
    for entry in Ledger.objects.all():
        amount = Decimal(entry.amount or 0)
        if amount > 0:
            entry.debit_amount = amount
            entry.credit_amount = Decimal('0')
        elif amount < 0:
            entry.debit_amount = Decimal('0')
            entry.credit_amount = -amount
        else:
            entry.debit_amount = Decimal('0')
            entry.credit_amount = Decimal('0')
        entry.save(update_fields=['debit_amount', 'credit_amount'])


def reset_ledger_debit_credit(apps, schema_editor):
    Ledger = apps.get_model('business', 'PartnerLedgerEntry')
    Ledger.objects.update(debit_amount=Decimal('0'), credit_amount=Decimal('0'))


class Migration(migrations.Migration):

    dependencies = [
        ('business', '0010_financialtransaction_transaction_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='partnerledgerentry',
            name='credit_amount',
            field=models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=15),
        ),
        migrations.AddField(
            model_name='partnerledgerentry',
            name='debit_amount',
            field=models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=15),
        ),
        migrations.RunPython(populate_ledger_debit_credit, reset_ledger_debit_credit),
    ]
