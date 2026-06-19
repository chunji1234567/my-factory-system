"""DRF 自定义分页类。

历史问题（2026-06-18 修复）：
  原全局 DEFAULT_PAGINATION_CLASS = rest_framework.pagination.PageNumberPagination
  这个类**不响应** `?page_size=N` 查询参数（page_size_query_param=None），
  即使前端 useProducts({pageSize: 500}) 把参数发上来，后端也会忽略，强制
  返回 PAGE_SIZE=20 的第一页。导致 InventoryPanel / SelfMadeGalleryPanel 等
  需要全量数据的面板只能看到前 20 件。

  docs/api.md 一直写"支持 page_size 查询参数"，但其实只是夸张——直到现在
  才真正落地。

StandardPagination：
  - 默认 page_size = 20（沿用 PRD §5.4）
  - 允许客户端用 `?page_size=N` 覆盖
  - max_page_size = 2000 防止滥用（一次拉 10 万行会拖死 DB）

历史：
  - 2026-06-18 创建，max_page_size = 500
  - 2026-06-19 抬到 2000（方案 A）——库存中心 / 自产图库 / SearchableSelect
    都依赖一次拉全量做客户端搜索，500 上限在 SKU 增长到中等规模时就会
    导致 InventoryPanel 看不到 501+ 的物料。2000 给"5 年增长"留足空间，
    超过这个量级再考虑改服务端分页 + 远程搜索（方案 B）。

详见 docs/PRD.md §5.4 + §9.4 changelog。
"""
from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """全项目默认分页——允许 `?page_size=N` override，上限 2000。"""

    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 2000
    page_query_param = 'page'
