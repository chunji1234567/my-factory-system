# Deployment Rules

本文是部署、环境变量、迁移、静态/媒体的纪律。所有项均对应 `backend/config/settings.py` 与 `backend/.env.example`。

## 1. 环境变量

### 1.1 必填（缺失 = 拒绝启动）

| 变量 | 含义 | 备注 |
|---|---|---|
| `DJANGO_SECRET_KEY` | Django 签名密钥 | 缺失会在 settings 加载时抛 `RuntimeError`，必须从机密管理读 |
| `DJANGO_DEBUG` | `true` / `false` | 生产必须 `false` |
| `DJANGO_ALLOWED_HOSTS` | 逗号分隔域名 | `DEBUG=False` 下若为空会拒绝所有请求 |
| `DATABASE_URL` | dj-database-url 格式 | 缺失会回落到 SQLite `db.sqlite3`，仅本地可用 |

### 1.2 选填（有默认）

| 变量 | 默认 | 备注 |
|---|---|---|
| `DJANGO_DEV_HOST` | `localhost` | DEBUG 下加入 ALLOWED_HOSTS，便于局域网调试 |
| `DB_CONN_MAX_AGE` | `0` | 生产建议 `60` |
| `DB_SSL_REQUIRE` | `false` | 用托管 PG 时打开 |
| `DJANGO_STATIC_URL` | `static/` | 与反代规则一致即可 |
| `DJANGO_STATIC_ROOT` | `BASE_DIR/staticfiles` | 生产应改到 nginx 可读位置 |
| `DJANGO_MEDIA_URL` | `/media/` | 同上 |
| `DJANGO_MEDIA_ROOT` | `BASE_DIR/media` | 生产改到持久卷 |
| `DJANGO_CORS_ALLOW_ALL` | 与 DEBUG 同 | 生产**不允许** `true` |
| `DJANGO_CORS_ALLOWED_ORIGINS` | 空 | 生产用逗号列表显式枚举前端域名 |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | 空 | 与 CORS 列表保持一致 |

### 1.3 严禁
- 把任何真实 secret 写进 `.env.example` / commit / PR 评论
- 在多份 `.env` 里写不同的 `DATABASE_URL` 而不在文档登记
- 用 `DJANGO_CORS_ALLOW_ALL=true` 跑生产

## 2. 角色与首次部署

1. 跑迁移：`python manage.py migrate`
2. 引导角色组：进入 shell 跑 `from scripts import setup_roles; setup_roles.main()`
   - 创建 `manager` / `warehouse` / `shipper` 三个 `auth.Group`
   - 创建 demo 用户（`manager_demo` / `warehouse_demo` / `shipper_demo`），密码默认 `manager123` / `warehouse123` / `shipper123`
   - **生产部署后必须**：删除 demo 用户，或至少修改密码并禁用
3. 真正生产管理员：`python manage.py createsuperuser`，但要意识到 `superuser` 在权限体系下默认等价于 manager（见 `business/api/utils._is_in_group`）

## 3. 数据迁移

1. 任何模型变更都必须配套 migration 文件，PR 中列出新增的迁移序号
2. 生产部署顺序：
   1. 备份数据库（PG dump 或 sqlite 复制）
   2. 拉取新代码
   3. `python manage.py migrate --plan` 先检查
   4. `python manage.py migrate`
   5. 跑健康检查（见 §6）
3. 涉及"重算 Partner.balance / 订单 total_amount"的迁移必须配 RunPython 脚本，并在 PR 描述写明回滚方案

## 4. 静态与媒体

1. 部署前：`python manage.py collectstatic --no-input`
2. 静态资源由 nginx 直接发；不要让 Django 在生产负责静态
3. 媒体（用户上传图片）必须落到独立持久卷或 OSS：
   - `Product.image` upload_to=`products/%Y/%m/`
   - `OrderEvent.image` upload_to=`events/%Y/%m/`
   - `PurchaseOrderEvent.image` upload_to=`purchase-events/%Y/%m/`
4. `settings.DEBUG=True` 才会让 Django 提供 media；生产环境一律由反代处理

## 5. CORS 与 CSRF

1. 生产：
   - `DJANGO_CORS_ALLOW_ALL=false`
   - `DJANGO_CORS_ALLOWED_ORIGINS=https://前端域名,https://www.前端域名`
   - `DJANGO_CSRF_TRUSTED_ORIGINS` 至少包含上述两个 + 任何同源的子域
2. 前端走 JWT，CORS 凭据需要时再单独开启；目前默认不带 cookie

## 6. 健康检查与监控

### 6.1 `/health/` 端点（2026-05-21 起）

- 路径：`GET /health/`（**不**带 `/api/` 前缀，反代统一探活）
- 权限：`AllowAny` + `authentication_classes = []`——**必须无需鉴权**
- 返回：`{"status": "ok"}` 200
- **故意不做 DB 探活**：避免 health 端点把 DB 故障映射成 5xx 后被反代误判服务挂掉、然后大量重启实例触发 thundering herd。DB 探活走应用外部任务（见 §6.2）。

### 6.2 DB / 业务层探活

- DB 是否可用：定期跑 `python manage.py check --database default`
- 关键指标必须有外部监控覆盖：
  - 5xx 比例（不含 `/health/`）
  - JWT 401 突然抬升（可能配置错误）
  - 数据库连接池耗尽
  - 排产单从 PLANNED 到 EXECUTED 的延迟（异常长说明 warehouse 漏点扣料）

## 7. 日志

1. 业务关键事件（库存调整、财务流水、订单状态切换）应在 signal 内 `logging.getLogger(__name__).info(...)` 输出 —— 现有代码缺位，列为 §1 风险
2. 生产日志走 stdout，由编排层（systemd / docker）收集；不要用文件 handler
3. 不要在日志里 dump 完整 `request.user` 或 token

## 8. 部署变更流程

1. PR 涉及 settings、URL、依赖、迁移、env 变量任意一项，必须在 PR 描述里勾选影响项
2. 上线前的"部署 checklist"：
   - [ ] 备份 DB
   - [ ] `migrate --plan` 复查
   - [ ] 已更新所有相关 `.env`
   - [ ] `collectstatic` 已跑（如改了 admin 静态）
   - [ ] 上线后跑一次冒烟（登录三角色 + 一个查询 + 一个写）
3. 上线 24h 内监控错误率与告警；异常超阈值立即回滚到上一个 release 的代码 + DB 备份
