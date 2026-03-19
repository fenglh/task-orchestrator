# Dynamic Node Completion Contract v1

## 背景

`task-orchestrator` 的节点是动态生成的，节点内容、交付形态与执行方式都不可预先枚举。因此，节点验收机制不能依赖“为每个节点手工预定义固定验收规则”，而应采用：

- **固定协议（protocol）**
- **动态契约（dynamic contract）**
- **通用校验原语（generic checks）**
- **结构化完成证据（structured evidence）**

核心思想：

> 任务结果不可预知，不代表证据机制不可定义。应定义“动态声明验收条件的协议”，而不是预先写死每个任务的验收标准。

---

## 目标

本设计希望把节点状态从“模型宣称完成”升级为“系统基于节点自声明契约与执行证据验证完成”。

目标分三层：

1. **证明做过**：节点确实执行过，并留下可观察产物或过程痕迹。
2. **证明交付形式基本达标**：产物存在、结构完整、关键字段/章节具备。
3. **明确自动验收边界**：对无法自动判定质量的节点，系统至少要结构化记录证据并进入 review 模式。

---

## 非目标

本设计 **不** 试图解决以下问题：

- 自动判断所有开放式任务“质量是否优秀”
- 让系统对所有业务结论做真值判断
- 在 v1 中引入复杂语义评分或多模型互评

v1 重点是：**可验证交付 + 结构化证据 + 可追踪失败原因**。

---

## 核心定义

### 1. Completion Contract

每个动态节点在执行前，必须尽量声明自己的“完成契约（completion contract）”。

契约回答的问题是：

1. 这一步要交付什么？
2. 这些交付物应该出现在哪里？
3. 系统怎样检查这些交付物？
4. 哪些检查是自动化的？
5. 哪些部分需要人工 review？

### 2. Completion Evidence

每个节点执行后，系统记录“完成证据（completion evidence）”。

证据回答的问题是：

1. 实际产出了什么？
2. 跑了哪些检查？
3. 哪些检查通过/失败？
4. 当前更适合判定为 completed / partial / blocked / needs_review 中的哪种状态？
5. 为什么？

---

## 协议总览

### 动态节点生成结果

动态生成节点时，除了任务本身，还应携带一个可选的 `completionContract`：

```json
{
  "title": "分析京东婴儿洗护品牌结构",
  "goal": "整理品牌结构并输出一页中文简报",
  "successCriteria": "产出可复核的初版结论",
  "completionContract": {
    "objective": "输出一份可复核的 markdown 简报",
    "outcomeType": "analysis_summary",
    "expectedArtifacts": [
      {
        "type": "file",
        "path": "progress/jd-baby-washcare-analysis.md",
        "required": true
      }
    ],
    "acceptanceChecks": [
      {
        "kind": "file_exists",
        "path": "progress/jd-baby-washcare-analysis.md"
      },
      {
        "kind": "file_nonempty",
        "path": "progress/jd-baby-washcare-analysis.md"
      },
      {
        "kind": "markdown_sections_present",
        "path": "progress/jd-baby-washcare-analysis.md",
        "sections": ["品牌结构", "价格带", "风险", "建议"]
      }
    ],
    "reviewMode": "needs_review"
  }
}
```

---

## 结果类型（Outcome Type）

系统不需要预知具体业务任务，但可以预知常见的交付类型。

建议 v1 支持：

- `file_write`：写入新文件
- `file_edit`：修改已有文件
- `structured_response`：返回结构化 JSON 结果
- `analysis_summary`：输出分析型总结
- `state_update`：更新线程/状态/配置
- `external_action`：触发某个外部动作
- `research_note`：形成研究记录/备忘
- `unknown`：无法明确归类时兜底

这个字段用于：

- 给 verifier 提供默认策略
- 给 UI / 日志提供更清晰的解释
- 给后续统计和失败分类做基础

---

## 期望产物（Expected Artifacts）

节点应动态声明期望产物。产物描述的是“应该能看到什么”。

v1 建议支持：

### 文件类

```json
{
  "type": "file",
  "path": "progress/report.md",
  "required": true
}
```

### 结构化响应字段类

```json
{
  "type": "response_field",
  "field": "summary",
  "required": true
}
```

### 状态类

```json
{
  "type": "state_change",
  "target": "task_thread",
  "expectation": "child_nodes_created",
  "required": true
}
```

### 命令/动作类

```json
{
  "type": "command_result",
  "commandLabel": "openclaw gateway restart",
  "required": true
}
```

---

## 通用验收原语（Acceptance Checks）

平台层提供一组固定的检查原语。动态节点只负责选择和填参数。

### v1 推荐支持的 check kinds

#### 文件存在
- `file_exists`

#### 文件非空
- `file_nonempty`

#### JSON 可解析
- `json_parseable`

#### JSON 必含字段
- `json_has_keys`

#### markdown 章节存在
- `markdown_sections_present`

#### 文本长度阈值
- `text_min_length`

#### 工具调用被观察到（后续 phase）
- `tool_call_observed`

#### 产物被修改（后续 phase）
- `artifact_modified`

#### 命令退出成功（后续 phase）
- `command_exit_success`

---

## Review Mode

不是所有节点都适合自动验收，因此需要显式声明 review 策略。

### 建议枚举

- `auto`：满足 checks 即可自动判定完成
- `auto_with_warning`：自动验收为主，但允许带弱告警通过
- `needs_review`：系统只收集证据，最终完成性需人工确认

### 适用场景

#### `auto`
适合：
- 文件生成
- 配置修改
- 结构化输出
- 命令执行结果明确的节点

#### `auto_with_warning`
适合：
- 已有产物，但完整性略弱
- 可接受继续推进，但需要留痕提醒

#### `needs_review`
适合：
- 商业判断
- 创意任务
- 战略建议
- 质量无法机械验真的研究节点

---

## Completion Evidence 结构

节点执行完成后，系统应生成结构化 evidence。建议最少包含：

```json
{
  "status": "passed",
  "outputs": [
    {
      "type": "file",
      "path": "progress/report.md",
      "summary": "已生成报告"
    }
  ],
  "checkResults": [
    {
      "checkId": "file_exists:progress/report.md",
      "status": "passed",
      "detail": "文件存在"
    },
    {
      "checkId": "markdown_sections_present:progress/report.md",
      "status": "passed",
      "detail": "包含结论、风险、建议章节"
    }
  ],
  "verifierSummary": "节点满足基本交付要求",
  "reviewMode": "needs_review",
  "generatedAt": "2026-03-19T14:27:00Z"
}
```

---

## 状态映射建议

现有 `task-orchestrator` 的节点状态较粗。引入 completion evidence 后，建议在“验收结论”和“节点生命周期状态”之间做一层映射。

### Evidence Status

建议 evidence 层支持：

- `passed`
- `failed`
- `partial`
- `blocked`
- `needs_review`
- `not_evaluated`

### 与节点状态的关系

- `passed` → `done`
- `failed` → `failed`
- `blocked` → `blocked`
- `partial` → v1 可先映射到 `done` + warning，或后续扩充节点状态
- `needs_review` → v1 可先映射到 `done` + review flag，或后续扩充节点状态

换句话说，**v1 不要求立即重构所有节点状态枚举**，可以先在 evidence 层表达 richer semantics。

---

## 验收流程建议

建议将节点执行链路从：

1. 生成节点
2. 执行节点
3. 更新状态

升级为：

1. 生成节点
2. 生成/补齐 `completionContract`
3. 校验 contract 是否可执行
4. 执行节点
5. 收集产物与过程证据
6. 跑 verifier
7. 生成 `completionEvidence`
8. 再更新节点状态

关键原则：

> **没有完成契约的节点，不应该无条件执行到底。**

对于无法生成清晰 contract 的节点，系统应该：

- 要么要求 refinement
- 要么降级为 `needs_review`
- 要么标记为 `blocked`

---

## 为什么这是动态节点可行的方案

因为这里预定义的不是“任务内容”，而是“任务自我声明验收方式的协议”。

动态任务不可预知，但下面这些东西是可统一的：

- 节点要声明哪些字段
- 节点允许使用哪些 check 原语
- 系统如何记录 evidence
- 系统如何根据 evidence 决定状态或告警

所以，**不可预知的是业务内容，不可不是协议结构**。

---

## v1 MVP 范围

建议先做最小版本，不要一次做重。

### 数据结构
- `TaskDraft` 可选带 `completionContract`
- `DoneResult` 可选带 `completionEvidence`
- `TaskNode` 可选持有 `completionContract` 与 `completionEvidence`

### checks
先只做：
- `file_exists`
- `file_nonempty`
- `json_has_keys`
- `markdown_sections_present`
- `text_min_length`

### UI / 状态
先不大改节点状态机，只做：
- detail view 展示 contract / evidence
- 对 partial / needs_review 给出 warning 文案

---

## 后续 Phase 建议

### Phase 2
加入 runtime-level 过程证据：
- `tool_call_observed`
- `artifact_modified`
- `command_exit_success`

### Phase 3
加入更明确的 review / approval 流：
- `needs_review`
- `reviewed_accepted`
- `reviewed_rejected`

### Phase 4
再考虑语义 verifier：
- 轻量规则化总结校验
- 模型辅助 verifier，但不作为唯一判定依据

---

## 最终定义（一句话）

> 动态节点完成机制 = 节点在生成时动态声明完成契约（completion contract），系统在执行后基于通用检查原语与实际执行痕迹生成完成证据（completion evidence），再据此判定节点是否可被视为完成、部分完成、阻塞或需人工复核。
