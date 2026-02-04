---
trigger: always_on
---

R1: 架构感知先行 (Architecture-First)
在执行任何代码修改指令前，必须检索 PROJECT_MAP.md 和核心架构文档。

严禁在不了解模块依赖关系的情况下进行跨模块重构。

R2: 文档同步协议 (Sync-Documentation)
修改前： 若涉及功能变更或接口改动，必须先更新对应的 design/ 文档或模块注释。

修改后： 必须更新 PROJECT_MAP.md 中的“当前状态”和“变更日志”。

Token 优化： 保持文档高度精炼，优先使用表格、Mermaid 图表和 Markdown 列表。

R3: BUG 闭环原则 (Bug-Closure)
修复任何 BUG 后，必须在 tests/ 目录下提供一个 Python 测试脚本，能够复现该 BUG 并验证修复结果。

如果没有通过测试用例验证，该任务视为“未完成”。

R4: 嵌入式开发习惯 (Embedded Best Practices)
Windows 优先： 避免使用 Shell 命令，优先使用 Python 脚本或 Windows 原生命令处理文件。


资源敏感： 修改核心算法（如日志索引）时，必须在文档中注明对内存和 CPU 的潜在影响。