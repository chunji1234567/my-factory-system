from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Partner

@receiver(post_save, sender=Partner)
def initialize_partner_logic(sender, instance, created, **kwargs):
    """如果以后有针对新合作伙伴的自动初始化逻辑（如发送欢迎邮件或分配默认分组），放在这里"""
    if created:
        # 暂时留空，预留给未来的企业微信通知逻辑
        pass