# AI Tools Rules

本文是任何 AI 编码助手（Claude Code / Cursor / Copilot / ChatGPT 等）在本项目工作时必须遵守的纪律。

## 1. 上手前必读

按这个顺序，少读一份就视为违规：

1. `docs/PRD.md`（特别是第 2 章权限矩阵、第 3 章数据模型、第 4 章流程、第 6 章不变量、第 9 章风险）
2. `rules/engineering-principles.md`
3. 涉及 backend → `rules/backend-rules.md`；涉及 frontend → `rules/frontend-rules.md`；涉及环境/部署 → `rules/deployment-rules.md`

写代码前必须**显式声明**："已读 PRD 与 X / Y / Z 规则文件"，不能默认对方知道。

## 2. 可执行的纪律

### 2.1 写代码前
- 不要立刻动手。先做这三件事：
  1. 把要改的范围（哪些文件 / 哪些 API / 哪些表）列出来
  2. 引用本目录里至少一条相关规则作为执行依据
  3. 简述实现思路和潜在风险（信号联动、事务边界、权限、金额脱敏）
- 大于"改一行配置"的变更必须先得到用户确认再写代码

### 2.2 写代码中
- 优先复用现有工具：`MonetaryMaskMixin`、`_resolve_operator`、`is_manager` 系列、`_record_partner_ledger`
- 涉及 model / serializer / signal / permission 中**任意一处**的改动，要在脑里过一遍是否影响其他三处
- 写完后必须能用 `python manage.py test` 跑通；新增功能必须新增测试

### 2.3 写代码后
- 总结清单包含：
  - 改了哪些文件 + 一句话说明
  - 自检过的规则（编号或文件名）
  - 跑过哪些测试 / 命令（贴输出片段）
  - 已知 TODO 与未覆盖的边界
- 任何"无法验证"的改动（例如缺少现成数据）必须在总结中明确标注

## 3. 安全与机密

- 永远不输出真实 secret / token / 密码；`backend/.env` 只能读，不能 echo 到对话或 PR
- 不在 PR 描述、commit message、注释里暴露用户数据（partner 名、订单号可以举例时使用脱敏占位 `PARTNER_X` / `SO-2026-0001`）
- 部署相关命令（`migrate`、`collectstatic`）建议给用户执行而不是自己跑，除非已明确得到许可

## 4. 与人类协作

- 尊重已有人工编辑：发现冲突先和用户对话，不要直接覆盖
- 当用户说"按你的判断"时仍然要列出关键决策点，避免单方面替用户决策业务规则
- 当用户的要求与规则文件冲突时，提示冲突并请求确认；不要默默放弃规则

## 5. 边界情形

- **找不到代码现成模式时**：先看 `business/api/views.py` 与 `business/signals.py`，那是项目最复杂的两块，多数模式藏在里面
- **看到注释里有 TODO / FIXME**：列入总结但不要顺手改——除非用户已授权
- **写脚本（scripts/）时**：必须有 `if __name__ == '__main__':` 入口、可重复运行、写日志说明做了什么

## 6. 输出风格

- 中文优先，与项目代码注释一致
- 不要堆叠无关的"建议改进"——专注当前任务
- 列表用得克制，散文式描述更易被代码评审者读懂
- 自检条目用 `- [ ]`/`- [x]` 表示，便于人类复核

## 7. 检测违规

下列行为视为违规，需要在下次互动时纠正：

- 没有在动手前声明已读规则
- 直接改 `models.py` / `serializers.py` / `permissions.py` 但 PR 中只字未提相关规则
- 引入新金额字段但忘记加进 `monetary_fields`
- 新增写入路径但未包 `transaction.atomic`
- 修改信号但未跑测试或未补测试
- 把 `DEBUG=True` / `CORS_ALLOW_ALL=true` 留在某条配置默认值上
- 在生产模板里写真实密钥
