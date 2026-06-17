# Engineering Principles（项目化的 SOLID / DRY / KISS / 可读性）

本文给"通用工程原则"在本项目的可执行解读。任何 PR 评审都可以引用这里的某一条作为接受/拒绝理由。

## 0. 适用范围

- 所有 Python（Django/DRF）、TypeScript（React/Vite）、shell/部署脚本
- 编写代码或修改基础设施前必须看一遍本文
- 当某条原则与具体纪律文件（backend / frontend / deployment）冲突时，听更具体的纪律文件

## 1. SOLID

### 1.1 单一职责（SRP）
- 一个 model / serializer / view / hook / 组件要能用一句话讲清楚做什么
- 反例：在 `models.save()` 里同时改库存、写流水、推状态——这是事实存在的（`ReceivingLog.save`），但被严格控制在"事务+三件事+不再做别的"的边界，新增副作用必须独立函数
- 反例：在 viewset 上塞业务规则。规则应放进 model `save` / signal / serializer 的 `validate` / 单独 service 函数

### 1.2 开闭（OCP）
- 引入新的"角色变体"或"阶段"时，优先**新增**而不是改老路径
  - 例：要加 `auditor` 角色 → 在 `permissions.py` 新建 `IsAuditor` + 在每个需要的 ViewSet 注册，不要把 `IsManagerOrShipper` 改成"有时也接受 auditor"
- 信号链不要塞 if-else：每个新业务事件用独立的 receiver

### 1.3 里氏替换（LSP）
- 包装 `api/client` 的 hook 必须保持 `{loading, error, data, reload}` 这一组返回形状
- 序列化器子类不要悄悄改 read 字段集合或类型——会让前端解析炸

### 1.4 接口隔离（ISP）
- hook 返回的对象只暴露调用者需要的方法
- DRF 的 `fields=` 必须显式列出，不允许 `__all__`，避免敏感字段（如 `Partner.balance` 被仓管看到）泄露
- ViewSet 用 `mixins` 拼接，不要继承 `ModelViewSet` 然后再去 disable 某些动作——直接用最小集合

### 1.5 依赖倒置（DIP）
- View 调用 service / serializer / model 方法，不直接写 ORM 多表 join 业务逻辑
- 任何"运行环境"配置（DB、密钥、CORS 列表）通过 `os.environ` 读，不写死

## 2. DRY

- 重复出现两次的逻辑就抽到工具函数 / mixin / hook
- 已经存在的：
  - `MonetaryMaskMixin`（金额脱敏）
  - `_resolve_operator`（从 request 推导 operator）
  - `business/api/utils.py` 的 `is_manager` / `is_warehouse` / `is_shipper`
  - `_record_partner_ledger`（写台账 + 自动拆分借贷）
- 新加副作用前先在这些工具里看一眼有没有现成的

## 3. KISS

- 优先用 Django/DRF 自带能力（`generics.ListCreateAPIView`、`mixins`、`django-filter`、`PageNumberPagination`），自己造轮子要在 PR 描述里解释为什么
- 信号能解决的事不要在 viewset 里手写编排
- 单个文件超过 ~250 行就要考虑拆分；当前 `business/api/views.py`（700+ 行）已经超标，不要继续往里堆，新功能优先放新模块（如 `business/api/finance_views.py`）

## 4. 可读性

- Python 遵守 PEP 8；TypeScript 遵守项目 Prettier 配置
- 命名用项目术语：`partner` 不叫 `customer`，`order_no` 不叫 `code`
- 注释只解释 *为什么*，不重复 *是什么*；状态机、信号链这种"读代码看不出来"的地方必须有 docstring
- 复杂的金额/库存逻辑必须配测试用例，测试名 = 业务断言（参考 `test_complete_purchase_and_sales_flow`）

## 5. 测试与文档

- 改 model 字段或信号 → 必须改/加测试 + 更新 `docs/PRD.md` 的第 3、4、6 节
- 改 API 入参/响应 → 必须更新 `docs/PRD.md` 第 5 节 + `backend/docs/api.md`
- 改前端面板 → 等下一轮 frontend 规则细化后补，本轮先在 PR 中列变更点
- 测试运行命令：`python manage.py test`（含 `core` 与 `business` 两个 app）

## 6. 偏离条款

如果某条原则在某个具体场景下不适用，必须在 PR 描述中：
1. 引用具体规则编号（如"engineering-principles §1.1"）
2. 说明偏离的最小必要范围
3. 提出补救/回收的时间点

无声偏离视为违规。
