# Coding Rules Overview

本目录是项目的"代码动手前的最低必读"。所有贡献者（人或 AI 编码助手）都必须先看本目录的对应规则文件，再写代码或开 PR。

## 阅读顺序

按下面顺序阅读，少读一份就上手都视为违规：

1. `docs/PRD.md` —— 业务事实（数据模型、状态机、权限矩阵）
2. `rules/engineering-principles.md` —— SOLID / DRY / KISS / 可读性的项目化解读
3. 与变更范围匹配的纪律文件（一份或多份）：
   - 改 backend：`rules/backend-rules.md`
   - 改 frontend：`rules/frontend-rules.md`
   - 涉及部署 / 环境变量 / 数据库迁移：`rules/deployment-rules.md`
4. 如果你是 AI 助手：`rules/ai-tools-rules.md`

## 文件分工

| 文件 | 范围 |
|---|---|
| `engineering-principles.md` | 跨栈通用原则 |
| `backend-rules.md` | Django + DRF（信号、事务、权限、序列化器、迁移） |
| `frontend-rules.md` | React + TS + Tailwind 的面板与 hooks 约定（待下一轮按代码深读后细化） |
| `deployment-rules.md` | `.env`、迁移、静态/媒体、CORS/CSRF、健康检查 |
| `ai-tools-rules.md` | AI 编码助手的工作流、声明、边界 |

## 与 PRD 的关系

- PRD 是**事实**：写的是项目目前真实的样子
- 本目录是**纪律**：写的是项目希望被维护的样子
- 当 PRD 与代码冲突时，要么改代码、要么改 PRD；不允许长期不一致
- 当本目录与 PRD 冲突时（比如 PRD 描述了一个 rules 禁止的写法），优先听 PRD 反映的真实代码，并把"是否要修"列到 PRD 第 9 节

## 强制要求

- 任何动到 `core/` 或 `business/` 的代码 PR，必须在 PR 描述中点名引用了本目录里哪几条规则
- AI 助手必须在动手前显式声明已读过本 README + 相关纪律文件
- 多区域改动（比如同时改了 model + 前端 hook）必须把所有适用的规则文件都列出来
