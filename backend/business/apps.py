from django.apps import AppConfig

class BusinessConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'business'

    def ready(self):
        import business.signals  # 关键：导入信号逻辑