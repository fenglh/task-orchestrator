# 真实运行时一致性检查笔记（2026-03-19）

## 目的

在 FakeAdapter smoke tests 已经覆盖主要动态编排主链后，下一步需要关注：真实 OpenClaw / EmbeddedPi adapter 路径是否与这些预期保持一致。

## 本轮先发现并收口的两个明显缺口

### 1. execute-node 的动态 expand schema 原本没有携带 `completionContract`

现象：
- `planRoot` / `refineNode` 的 prompt 已经引导生成 `completionContract`
- 但 `executeNode` 在返回 `expand` 时，原 schema 只要求：
  - `title`
  - `goal`
  - `successCriteria`
- 这会导致真实运行时里，动态追加出来的子任务比 plan/refine 路径少一层 contract 信息。

影响：
- 动态追加子任务的 contract/evidence 覆盖会弱于 plan/refine 路径
- 真实复杂任务里，最重要的“执行时临时拆出来的子任务”反而最缺契约信息

处理：
- 已补到 `build-execute-node-prompt.ts`
- 现在 `expand.newTasks[]` 也会尽量生成 `completionContract`

### 2. `OpenClawTaskExecutionAdapter` 原本没有接入 `workspaceDir`

现象：
- EmbeddedPi adapter 有 `workspaceDir`
- 但 `OpenClawTaskExecutionAdapter` 之前没有把 `workspaceDir` 暴露给 orchestrator 层

影响：
- 在真实 OpenClaw runtime 路径下，文件类 checks（如 `file_exists` / `file_nonempty` / `markdown_sections_present`）无法稳定读取 workspace 内文件
- 导致 verifier 在 OpenClaw runtime 路径和 EmbeddedPi 路径行为不一致

处理：
- 已在 `OpenClawTaskExecutionAdapterOptions` 中加入 `workspaceDir?`
- 已在 constructor 中写入 `this.workspaceDir = options.workspaceDir`

## 仍需继续观察的真实运行时差异点

### A. 事件 payload 形状是否稳定
当前 runtime evidence 汇总逻辑依赖事件 payload 中的字段：
- `tool` / `toolName`
- `path` / `file_path`
- `command`

风险：
- 不同 OpenClaw 版本 / runtime 实现里，事件 payload 形状可能并不完全一致
- 这会影响 `tool_call_observed` / `artifact_modified` / `command_exit_success` 的可靠性

建议：
- 后续在真实运行时抓一段事件样本，做一次 payload inventory

### B. 真实模型输出是否总能稳定满足 JSON 解析
当前 adapter 依赖：
- `extractJsonPayload()`
- fenced json / first balanced object 提取

风险：
- 真正运行时里，模型可能会混入额外解释文本
- balanced object 提取策略虽然兜底，但并不等于完全稳健

建议：
- 后续补一条“真实运行时 JSON 稳定性”观测清单

### C. 动态 expand 的 child contract 质量仍主要依赖模型
即使 schema 已补上，真实值仍取决于模型是否真的生成：
- 清晰 objective
- 可执行 acceptanceChecks
- 合适 reviewMode

建议：
- 后续在真实任务里抽样看 expand child tasks 的 contract 质量

## 当前结论

FakeAdapter 主链 smoke tests 已经基本说明：
- 动态拆解 / expand / blocked / retry / skip / replace / suspend 的编排骨架可行

而本轮收口后，真实 adapter 路径至少补齐了两项明显不一致：
- execute expand 也可生成 child completionContract
- OpenClaw runtime adapter 也可携带 workspaceDir，减少与 EmbeddedPi 路径差异

下一步如果继续，应优先做：
1. 抓真实运行时 event payload 样本
2. 抽样检查真实 expand child contracts
3. 观察真实模型 JSON 输出稳定性
