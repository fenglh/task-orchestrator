# OpenClaw + LangGraph 任务编排器设计文档

## 1. 文档目标

本文档描述如何将 **LangGraph** 作为上层编排器集成到 **OpenClaw** 插件中，用于实现面向复杂任务的：

- 任务分析与初始拆解
- 多子任务自动推进
- 执行过程中动态扩展子任务树
- 中途人工确认与恢复
- 长任务的持久化、暂停、恢复与状态查询
- 在 WebChat 中直接触发复杂任务编排
- 在 WebChat 中进行暂停 / 继续 / 停止 / 状态查看
- 在 WebChat 中查看子任务、子子任务树与节点详情

核心设计原则：

> **LangGraph 管流程与状态，OpenClaw 管当前节点执行、工具调用与消息流。**

本文档不仅定义编排器内部架构，也定义其在 **OpenClaw WebChat** 中的触发、接管与交互方式。

---

## 2. 为什么需要这一层编排器

在 OpenClaw 的嵌入式 pi 架构中，一次 `session.prompt(...)` 本质上对应一次完整 agent loop。事件订阅能够让宿主层观察到：

- `message_*`：消息流
- `tool_execution_*`：工具执行过程
- `turn_*`：回合边界
- `agent_*`：整体生命周期

但**事件订阅不是任务调度器**。

因此，如果只依赖提示词要求模型“做完一个子任务后自动继续下一个”，很容易出现这种情况：

1. 模型在回复中声称“我将继续下一个子任务”
2. 当前 `turn` 实际已经结束
3. 系统没有新的调度动作，因此并未真正继续执行

这就是需要引入显式编排层的根本原因。

---

## 3. 设计总原则

### 3.1 OpenClaw 与 LangGraph 的职责边界

#### OpenClaw 负责

- 创建和管理 `AgentSession`
- 调用 `session.prompt(...)` 执行当前节点
- 管理工具调用、会话上下文、渠道输出
- 通过事件流发送中间进度和工具执行状态

#### LangGraph 负责

- 管理总任务状态（任务树）
- 决定当前执行哪个节点
- 决定执行结果如何分流：继续、展开、阻塞、失败、结束
- 管理暂停 / 恢复 / 断点续跑
- 管理 thread 级持久化

### 3.2 关键原则

1. **任务是真正的树，不是线性列表**
2. **一次 `session.prompt(...)` 只处理一个当前节点**
3. **系统只认结构化结果，不认自然语言承诺**
4. **是否继续下一步，由编排器决定，不由模型决定**
5. **任务树状态不能只存在会话文本里，必须有独立状态真相**

---

## 4. 总体架构

```text
用户/渠道
  -> OpenClaw Gateway
    -> OpenClaw 插件（Task Orchestrator）
      -> LangGraph StateGraph
        -> OpenClaw 执行桥
          -> OpenClaw AgentSession / pi runtime
```

### 4.1 推荐集成方式

推荐将 LangGraph 集成为：

> **OpenClaw 插件里的上层任务编排器**

而不是：

- 不建议让 LangGraph 替代 OpenClaw 的工具执行和渠道系统
- 不建议把 LangGraph 强行塞进 OpenClaw 的底层 agent loop
- 不建议让 OpenClaw 单独承担长流程任务树调度

### 4.2 WebChat 接入方式

仅仅“加载了插件”并不等于 WebChat 用户已经自动获得这套能力。

要让用户在 OpenClaw 的 WebChat 中直接使用编排器，必须再补一层：

> **WebChat 消息路由与任务模式接管层**

推荐采用两种运行模式：

- `chat mode`：普通聊天、问答、一次性执行
- `task mode`：复杂任务编排、自动续跑、可恢复长流程

推荐接入原则：

1. WebChat 收到消息后，先做复杂任务识别或任务控制识别
2. 若命中复杂任务，则调用 `startTask(...)`
3. 若当前会话已绑定活跃任务，则后续消息优先判断是否是：
   - `resumeTask(...)`
   - `pauseTask(...)`
   - `cancelTask(...)`
   - `getTaskStatus(...)`
4. 若未命中任务语义，则回退到普通 `chat mode`

建议第一版优先支持两类触发方式：

- 显式触发：例如 `/task start`、按钮点击、固定入口
- 自然语言触发：例如“帮我拆解并自动完成这个复杂任务”

其中，第一版建议优先保证**显式触发稳定**，自然语言识别可作为增强能力。

### 4.3 推荐语言栈

如果你是基于 OpenClaw 深度扩展，建议优先选择：

- OpenClaw 插件：TypeScript
- LangGraph：JavaScript / TypeScript 版本

这样可以避免多语言桥接、进程间通信与额外序列化复杂度。

---

## 5. 插件内部模块设计

### 5.1 模块总览

```text
Task Orchestrator Plugin
├── entry/          # 入口层：启动、恢复、状态查询、暂停、取消
├── chat-router/    # WebChat 消息判定、任务模式接管与命令路由
├── graph/          # LangGraph：state、nodes、edges、compile
├── bridge/         # OpenClaw 执行桥：当前节点 -> 一次 session.prompt
├── state/          # 任务树模型、thread/session 绑定、结果协议
├── runner/         # 自动推进、恢复、重试、终止
└── ui-status/      # 给用户的状态播报、任务卡片、blocked 提示与树形状态展示
```

### 5.2 推荐代码目录结构

如果进入实现阶段，建议尽早把模块层级落成明确文件边界，避免后续把路由、状态、编排、展示逻辑混写在一起。

推荐目录结构如下：

```text
task-orchestrator/
├── index.ts                        # 插件注册入口
├── types/
│   ├── task-thread.ts              # TaskThread 类型
│   ├── task-node.ts                # TaskNode 类型
│   ├── task-result.ts              # done/expand/blocked/failed 协议
│   ├── task-status-view.ts         # summary/tree/node 视图类型
│   └── channel-state.ts            # WebChat 渠道交互态
├── entry/
│   ├── start-task.ts               # startTask(...)
│   ├── resume-task.ts              # resumeTask(...)
│   ├── pause-task.ts               # pauseTask(...)
│   ├── get-task-status.ts          # getTaskStatus(...)
│   ├── cancel-task.ts              # cancelTask(...)
│   └── index.ts                    # 统一导出 RPC handlers
├── chat-router/
│   ├── route-message.ts            # WebChat 消息总路由
│   ├── detect-task-intent.ts       # 复杂任务 / 控制意图识别
│   ├── command-parser.ts           # /task status 等显式命令解析
│   ├── resolve-active-thread.ts    # “这个任务”映射到 activeThreadId
│   ├── task-mode-guard.ts          # chat mode / task mode 切换
│   └── route-result.ts             # 路由结果标准化
├── graph/
│   ├── state.ts                    # LangGraph state 定义
│   ├── compile.ts                  # graph compile
│   ├── selectors.ts                # currentNode / nextNode 等选择器
│   ├── transitions.ts              # resolve_result 后的状态迁移
│   └── nodes/
│       ├── plan-root.ts
│       ├── execute-current.ts
│       ├── resolve-result.ts
│       ├── wait-human.ts
│       └── finalize.ts
├── bridge/
│   ├── run-current-node.ts         # 当前节点 -> 一次 session.prompt(...)
│   ├── build-node-prompt.ts        # 当前节点 prompt 构造
│   ├── extract-structured-result.ts# 从当前轮输出中提取结构化结果
│   ├── subscribe-session-events.ts # 订阅 OpenClaw 事件
│   └── collect-evidence.ts         # tool/message 证据沉淀
├── state/
│   ├── task-tree.ts                # 任务树读写与遍历
│   ├── task-thread-repo.ts         # thread 持久化接口
│   ├── channel-state-repo.ts       # 渠道交互态持久化接口
│   ├── status-projection.ts        # TaskThread -> summary/tree/node 视图
│   └── guards.ts                   # 深度、节点数、预算等治理校验
├── runner/
│   ├── run-loop.ts                 # 自动推进主循环
│   ├── auto-advance.ts             # 自动续跑判定
│   ├── pause-cancel.ts             # pause_requested / cancel_requested 处理
│   ├── resume-from-checkpoint.ts   # checkpoint 恢复
│   └── retry-policy.ts             # 重试与降级策略
├── ui-status/
│   ├── render-task-card.ts         # 任务卡片渲染
│   ├── render-task-summary.ts      # summary 视图渲染
│   ├── render-task-tree.ts         # tree 视图渲染
│   ├── render-node-detail.ts       # node 视图渲染
│   ├── render-blocked-message.ts   # blocked 提示渲染
│   └── emit-task-event.ts          # task_started/task_progress 等推送
└── utils/
    ├── ids.ts                      # threadId / nodeId 生成
    ├── time.ts                     # 时间工具
    └── invariant.ts                # 断言与错误工具
```

### 5.3 目录拆分原则

建议遵守以下边界：

- `entry/` 只承接外部调用，不写任务树调度细节
- `chat-router/` 只负责消息识别、模式切换、任务绑定，不直接操纵 graph 内部状态
- `graph/` 只负责 LangGraph state、节点和状态迁移
- `bridge/` 只负责“一次当前节点执行”
- `state/` 负责持久化模型、任务树操作和状态投影
- `runner/` 负责自动推进、恢复、暂停和取消的运行策略
- `ui-status/` 负责把内部状态转成 WebChat 可展示内容

### 5.4 第一版最小文件集

如果只做 MVP，不必一次建全所有文件。建议第一版最少包含：

```text
task-orchestrator/
├── index.ts
├── entry/
│   ├── start-task.ts
│   ├── get-task-status.ts
│   └── index.ts
├── chat-router/
│   ├── route-message.ts
│   └── command-parser.ts
├── graph/
│   ├── state.ts
│   ├── compile.ts
│   └── nodes/
│       ├── plan-root.ts
│       ├── execute-current.ts
│       └── finalize.ts
├── bridge/
│   ├── run-current-node.ts
│   └── build-node-prompt.ts
├── state/
│   ├── task-tree.ts
│   ├── task-thread-repo.ts
│   └── status-projection.ts
├── runner/
│   └── run-loop.ts
└── ui-status/
    ├── render-task-card.ts
    └── render-task-summary.ts
```

这样可以先打通：

- WebChat 显式触发任务
- 单任务自动执行
- 基础状态查看
- 基础任务卡片展示

---

## 6. 各模块职责说明

## 6.1 入口层（entry）

建议优先实现为 OpenClaw 插件 RPC 方法，并由 WebChat 路由层调用；可选再补工具入口。

### 推荐接口

- `startTask(taskInput, channelCtx)`
- `resumeTask(threadId, userInput)`
- `pauseTask(threadId)`
- `getTaskStatus(threadId, view?, nodeId?)`
- `cancelTask(threadId)`

可选补充：

- `listTasks(channelCtx)`
- `setActiveTask(channelCtx, threadId)`

### 入口层职责

- 参数归一化
- 创建 / 查找 LangGraph `threadId`
- 创建 / 查找 OpenClaw `sessionId`
- 维护 WebChat 会话与 `activeThreadId` 的绑定
- 承接 `chat-router` 转换后的插件 RPC 调用
- 调用 graph 入口
- 返回任务状态

### 不应由入口层做的事

- 不应直接实现业务编排逻辑
- 不应直接执行业务工具调用
- 不应承担节点结果判定

### WebChat 接入建议

当插件用于 WebChat 时，建议把入口层暴露为一组稳定控制动作，而不是让前端直接拼装 graph 输入：

- 新复杂任务：调用 `startTask(...)`
- 补充 blocked 输入或继续执行：调用 `resumeTask(...)`
- 暂停当前任务：调用 `pauseTask(...)`
- 查看总任务 / 树 / 节点详情：调用 `getTaskStatus(...)`
- 停止任务：调用 `cancelTask(...)`

关键点不在于“插件已经加载”，而在于 **WebChat 入口是否已经接到这些动作上**。

---

## 6.2 Graph 层（LangGraph）

这一层是整个系统的核心调度器。

### Graph 的职责

- 保存系统真实状态
- 调用节点
- 根据结果走条件边
- 借助 checkpointer 实现 checkpoint
- 在 blocked 场景下 interrupt
- 在 resume 场景下恢复 thread

### 第一版建议的核心节点

- `plan_root`
- `execute_current`
- `resolve_result`
- `wait_human`
- `finalize`

### 节点说明

#### `plan_root`
只做一件事：让 OpenClaw 对 root task 进行一级任务拆解。

#### `execute_current`
只执行当前任务节点。

#### `resolve_result`
消费当前节点的结构化结果，并更新任务树。

#### `wait_human`
进入人工等待态，直到 `resumeTask`。

#### `finalize`
当树上所有必要节点完成时，生成最终总结。

---

## 6.3 执行桥层（bridge）

执行桥层负责将 LangGraph 的“当前节点”转换为一次 OpenClaw 执行。

### 执行桥的职责

1. 根据 `threadId` 找到绑定的 `sessionId`
2. 从 graph state 里读取 `currentNode`
3. 构造“只针对当前节点”的 prompt
4. 订阅 OpenClaw session 事件
5. 调用 `session.prompt(...)`
6. 在本轮结束后提取结构化结果
7. 将结果返回给 graph

### 最重要的约束

> **一次 `session.prompt(...)` 只处理一个当前节点。**

不要让一次 prompt 同时承担：

- 全局规划
- 当前节点执行
- 自动继续下一节点
- 总结整棵树

否则系统会重新回到“模型口头承诺继续，但运行时已结束”的问题。

---

## 6.4 状态层（state）

必须区分三个“状态面”。

### A. LangGraph State：任务真相

保存：

- 根任务
- 任务树
- 当前活跃节点
- 节点状态
- 父子关系
- 自动推进计数
- blocked 信息
- 绑定的 session 信息

### B. OpenClaw Session：执行现场

保存：

- 当前节点上下文
- 当前轮工具轨迹
- 当前轮流式输出
- 当前轮渠道消息

### C. Channel Interaction State：渠道交互态

保存：

- `channelConversationId`
- 当前活跃任务 `activeThreadId`
- 当前会话处于 `chat mode` 还是 `task mode`
- 最近一次展示给用户的任务卡片 / 任务树摘要
- 是否正在等待用户对某个 blocked 节点补充输入
- WebChat 命令上下文，例如“这个任务”实际指向哪个 `threadId`

### 关键原则

> **任务树状态不能只存在 OpenClaw session 内；LangGraph state 才是调度真相。**

同时：

> **WebChat 当前绑定了哪个任务，也不能只靠前端临时记忆，必须有服务端可恢复的交互态。**

---

## 6.5 推进与恢复层（runner）

建议实现为插件中的后台服务或长期运行模块。

### 职责

- 执行完一步后决定是否继续下一步
- blocked 时 interrupt
- 用户恢复输入后 resume
- 处理 `pause_requested / cancel_requested`
- 在关键节点后推送阶段性进展到 WebChat
- 进程重启后恢复 thread
- 失败时决定重试、降级、终止

### 关键原则

> **自动继续必须由编排器显式决定，而不是由模型在文本中承诺。**

补充：

> **暂停 / 取消也应由编排器在安全边界上生效，而不是依赖聊天窗口上的口头约定。**

---

## 6.6 WebChat 路由与状态展示层（chat-router / ui-status）

这一层负责把“聊天消息”变成“可执行的任务控制动作”，并把任务状态变成用户可读、可操作的界面反馈。

### `chat-router` 的职责

- 判断当前消息应进入 `chat mode` 还是 `task mode`
- 识别消息是：
  - 新复杂任务
  - 继续 / 补充 blocked 输入
  - 暂停
  - 停止
  - 状态查询
  - 节点详情查询
- 根据当前 `activeThreadId` 将消息路由到对应插件接口
- 在有歧义时触发追问，而不是擅自作用到错误任务

### `ui-status` 的职责

- 渲染任务已启动消息
- 渲染阶段性进展播报
- 渲染 `blocked` 提示与所需输入
- 渲染 `paused / resumed / cancelled / finished` 状态变化
- 渲染 `summary / tree / node` 三类任务状态视图

### 推荐的 WebChat 呈现形式

建议至少支持以下两类交互：

- 自然语言：例如“暂停这个任务”“查看任务树”
- 显式控制：例如 `/task status`、按钮、任务卡片操作项

推荐第一版优先保证显式控制稳定可用，自然语言作为增强入口。

### 关键原则

> **WebChat 不只是输入框，也必须是任务控制面板。**

---

## 7. 状态模型设计

## 7.1 TaskThread

表示一次总任务执行实例。

建议字段：

- `threadId`
- `sessionId`
- `rootTaskId`
- `status`: `running | waiting_human | paused | finished | failed | cancelled`
- `activeNodeId`
- `channelContext`
- `channelConversationId`
- `latestUserVisibleSummary`
- `pauseRequested`
- `cancelRequested`
- `createdAt`
- `updatedAt`

## 7.2 TaskNode

表示任务树中的一个节点。

建议字段：

- `id`
- `parentId`
- `title`
- `goal`
- `successCriteria`
- `status`
- `children[]`
- `report`
- `userVisibleSummary`
- `needsResume`
- `expandMode`: `replace | suspend`
- `depth`
- `evidence[]`
- `artifacts[]`
- `startedAt`
- `finishedAt`

## 7.3 节点状态建议

- `pending`
- `running`
- `waiting_children`
- `blocked`
- `done`
- `failed`
- `cancelled`

说明：

- `paused` 更适合作为 `TaskThread.status`，不建议直接复用为节点状态
- 当前节点若在 `turn_end` 后进入暂停，节点本身可保持 `pending / running / waiting_children` 之一

## 7.4 任务状态视图模型

为了支持 WebChat 中的“查看任务状态、子任务、子子任务”，`getTaskStatus(...)` 不应只返回一句自然语言摘要，建议支持三种视图：

### `summary`

返回：

- 总任务标题
- 总任务状态
- 当前节点
- 已完成数 / 总节点数
- 最近一次更新
- 若存在，则返回 `blocked` 信息

### `tree`

返回：

- 总任务信息
- 当前执行路径
- 树形任务摘要
- 每个节点的 `title / status / children`

适合 WebChat 中展示：

```text
任务：京东竞品分析
状态：running
当前节点：品牌矩阵分析 > 头部品牌价格带

- 1. 明确分析范围 [done]
- 2. 收集竞品样本 [done]
- 3. 品牌矩阵分析 [running]
  - 3.1 头部品牌识别 [done]
  - 3.2 头部品牌价格带 [running]
  - 3.3 品牌卖点归纳 [pending]
- 4. 用户评论分析 [pending]
```

### `node`

返回某个具体节点的：

- `title`
- `goal`
- `successCriteria`
- `status`
- `report`
- `evidence`
- `children` 摘要

适合 WebChat 中处理“查看子任务 3.2 的详情”。

---

## 8. 任务树与调度策略

### 8.1 为什么必须是任务树

因为执行中会动态长出子子任务：

- 大任务
  - 子任务 A
    - 子子任务 A1
    - 子子任务 A2
  - 子任务 B

如果使用线性数组和 `currentIndex++`，无法自然承载这种递归展开。

### 8.2 推荐调度策略：深度优先（DFS）

推荐默认使用 **深度优先调度**：

- 当前节点如需展开子节点
- 先执行展开出的子节点
- 子节点完成后恢复父节点
- 然后再继续兄弟节点

### 为什么推荐 DFS

- 上下文更聚焦
- 更符合 agent 的自然问题分解方式
- 更适合围绕一个问题连续使用工具

---

## 9. 节点结果协议

这是整个系统稳定性的关键。

每次当前节点执行结束后，执行桥必须向 LangGraph 返回结构化结果。

### 9.1 `done`

含义：当前节点完成。

建议字段：

- `status: done`
- `report`
- `userVisibleSummary`
- `evidence[]`
- `artifacts[]`

### 9.2 `expand`

含义：当前节点不能直接完成，必须展开为子节点。

建议字段：

- `status: expand`
- `reason`
- `mode: replace | suspend`
- `newTasks[]`

### 9.3 `blocked`

含义：当前节点需要用户确认、授权或参数输入。

建议字段：

- `status: blocked`
- `question`
- `requiredInputSchema`
- `whyBlocked`
- `suggestedActions[]`

### 9.4 `failed`

含义：当前节点无法继续。

建议字段：

- `status: failed`
- `reason`
- `retryable`
- `diagnostics`

### 核心原则

> **LangGraph 只消费结构化结果，不消费“我接下来会继续”这类自然语言承诺。**

---

## 10. 父任务恢复机制

这是设计中极其关键的一部分。

当父任务执行中产生子任务时，父任务不能直接算 `done`，也不应永远保持 `running`。

### 推荐语义

1. 父任务进入 `waiting_children`
2. 创建子节点并开始执行
3. 子节点全部完成后：
   - 若父任务只是容器节点，可直接完成
   - 若父任务需要根据子节点结果再收束一次，则恢复父任务并再执行一轮

### expand 两种语义

#### `replace`
父节点本质上被子节点完全替代，不再直接执行。

#### `suspend`
父节点只是在执行过程中临时挂起，子节点完成后还要恢复。

---

## 11. Prompt 构造策略

执行桥在调用 OpenClaw 前，应构造**收敛 prompt**。

建议每个当前节点 prompt 包含以下 4 部分：

### 11.1 当前节点信息

- 标题
- 目标
- 完成标准
- 父节点摘要

### 11.2 当前可用上下文

- 当前相关材料
- 上一节点结果
- 可用工具说明

### 11.3 结果协议

明确要求最终只能返回：

- `done`
- `expand`
- `blocked`
- `failed`

### 11.4 禁止越权调度

必须显式写明：

- 不要自行决定开始下一任务
- 不要口头承诺自动续跑
- 是否继续由系统决定

---

## 12. 事件接入设计

OpenClaw 的事件流在这里扮演的是：

> **观察总线，而不是调度器。**

### 12.1 用户可见流

例如：

- `message_start`
- `message_update`
- `message_end`
- block chunk

用途：

- 给用户展示当前节点的中间进展
- 生成进度播报

### 12.2 运行证据流

例如：

- `tool_execution_start`
- `tool_execution_end`

用途：

- 日志
- 审计
- 证据沉淀
- 调试

### 12.3 调度边界信号

关键是 `turn_end`。

只有在当前轮真正结束后，LangGraph 才应消费本轮结构化结果并决定下一条边。

### 12.4 任务状态推送事件

除了消费 OpenClaw 原生事件，插件自身还应在关键状态变更后生成用户可见的任务状态推送，例如：

- `task_started`
- `task_progress`
- `task_blocked`
- `task_paused`
- `task_resumed`
- `task_cancelled`
- `task_finished`

这些事件不用于底层调度，而用于：

- 在 WebChat 中渲染任务卡片
- 输出阶段性总结
- 刷新任务树摘要
- 明确提示当前用户下一步可以做什么

### 核心原则

- 消息块：只用于展示
- 工具事件：用于证据
- `turn_end`：用于驱动 graph 状态更新
- `task_*` 状态推送：用于更新 WebChat 任务控制视图

---

## 13. thread 与 session 的映射

建议从第一版开始就采用：

> **一个总任务 = 一个 LangGraph thread = 一个主 OpenClaw session**

### 原因

- LangGraph checkpoint 围绕 thread 组织
- OpenClaw 上下文围绕 session 组织
- 一对一绑定最不容易污染上下文

对于 WebChat 还建议额外维护：

> **一个渠道会话可以关联多个任务，但同一时刻最多只有一个 `activeThreadId`。**

这样用户说“暂停这个任务”“继续刚才那个任务”时，系统才有稳定指向。

### 不建议的做法

- 一个 session 混多个总任务
- 一个总任务在多个 session 之间来回漂移（除非你明确设计了多会话策略）

---

## 14. 运行时序设计

## 14.1 WebChat 中复杂任务触发

```text
用户在 WebChat 输入复杂任务
  -> OpenClaw Gateway / chat-router
    -> 识别为复杂任务
    -> 切换会话到 task mode
    -> 调用 Task Orchestrator Plugin.startTask
      -> 创建 threadId + sessionId
      -> 绑定 channelConversationId -> activeThreadId
      -> 向 WebChat 返回任务卡片与初始状态
```

---

## 14.2 正常自动续跑

```text
用户
  -> OpenClaw Gateway
    -> Task Orchestrator Plugin.startTask
      -> 创建 threadId + sessionId
      -> LangGraph(plan_root)
        -> OpenClaw Bridge
          -> session.prompt(一级拆解)
          -> turn_end
        -> resolve_result
        -> execute_current
          -> OpenClaw Bridge
            -> session.prompt(当前节点)
            -> turn_end
          -> resolve_result
            -> done: 下一个节点
            -> expand: 创建子节点
            -> blocked: wait_human
            -> failed: 重试/终止
      -> finalize
        -> OpenClaw 生成最终总结
```

---

## 14.3 blocked 后恢复

```text
当前节点执行
  -> OpenClaw Bridge
    -> session.prompt(...)
    -> 结构化返回 blocked
  -> LangGraph.resolve_result
    -> interrupt
    -> 保存 checkpoint
    -> 通知用户补充输入

用户补充输入
  -> OpenClaw Gateway
    -> Plugin.resumeTask(threadId, userInput)
      -> LangGraph 从 checkpoint 恢复
      -> 回到 execute_current 或后继节点
      -> 继续执行
```

---

## 14.4 用户暂停 / 继续 / 停止

```text
用户在 WebChat 输入“暂停这个任务”
  -> chat-router
    -> 解析为 pauseTask(activeThreadId)
    -> runner 标记 pause_requested
    -> 等待当前轮 turn_end
    -> TaskThread.status = paused
    -> 向用户推送 task_paused

用户在 WebChat 输入“继续”
  -> chat-router
    -> 解析为 resumeTask(activeThreadId)
    -> 从 checkpoint 恢复
    -> TaskThread.status = running
    -> 自动推进下一步

用户在 WebChat 输入“停止这个任务”
  -> chat-router
    -> 解析为 cancelTask(activeThreadId)
    -> runner 标记 cancel_requested
    -> 在安全边界终止
    -> TaskThread.status = cancelled
```

说明：

- 第一版建议优先做“安全暂停 / 安全取消”，即在 `turn_end` 边界生效
- 若未来底层 runtime 支持硬中断，再补强制停止

---

## 14.5 查看任务状态与任务树

```text
用户在 WebChat 输入“现在进展到哪了”
  -> chat-router
    -> 解析为 getTaskStatus(activeThreadId, "summary")
    -> 返回当前节点、进度、blocked 状态

用户在 WebChat 输入“查看任务树”
  -> chat-router
    -> 解析为 getTaskStatus(activeThreadId, "tree")
    -> 返回子任务 / 子子任务树

用户在 WebChat 输入“查看子任务 3.2”
  -> chat-router
    -> 解析为 getTaskStatus(activeThreadId, "node", "3.2")
    -> 返回该节点详情
```

---

## 15. 自动推进规则

建议只在以下条件满足时自动继续：

1. 当前结果为 `done`
2. 或当前 `expand` 后已选出新的 `currentNode`
3. 当前未进入 `blocked`
4. 当前未处于 `paused`
5. 当前未触发 `pause_requested / cancel_requested`
6. 未超过自动推进预算
7. 当前轮已经结束

### 建议加入的限制

- 最大自动步数
- 最大任务树深度
- 最大节点数
- 单个节点最大执行轮数

这样可以避免系统无限拆、无限跑、无限漂移。

---

## 16. 持久化与恢复建议

## 16.1 LangGraph 持久化

必须使用 checkpointer。

建议保存：

- graph state
- thread checkpoint
- 当前 node
- 上次结果
- blocked 信息
- pause / cancel 请求标记
- 最近一次用户可见状态摘要

## 16.2 OpenClaw 会话恢复

建议保持 session 稳定复用，以保证：

- 当前节点上下文连续
- 工具轨迹可追溯
- 用户看到的进度消息连贯

## 16.3 进程重启后的恢复

系统启动时可扫描所有 `running / waiting_human` 状态的 thread：

- `waiting_human`：保持挂起，等待 resume
- `running`：根据上次 checkpoint 判断是自动恢复还是标记异常恢复
- `paused`：保持暂停，等待用户继续

同时建议恢复渠道交互态：

- `channelConversationId -> activeThreadId`
- 当前会话是否仍处于 `task mode`
- 最近一次用户可见任务卡片摘要

---

## 17. MVP 落地路径

不要一口气做完整系统。建议分五步落地。

### 第一步：最小闭环

实现：

- WebChat 显式入口触发 `startTask`
- `plan_root`
- `execute_current`
- `finalize`

先打通：WebChat 显式触发 -> 总任务 -> 一级拆解 -> 单节点执行 -> 最终总结。

### 第二步：加入状态查询

支持：

- `getTaskStatus(..., "summary")`
- `getTaskStatus(..., "tree")`
- WebChat 中展示任务卡片和树形摘要

先确保用户能看到“当前做到哪了”，再继续增强自动推进。

### 第三步：加入 `resolve_result`

支持：

- `done`
- `failed`

先不做 `expand` 和 `blocked`。

### 第四步：加入 `expand`

支持任务树动态长子节点，并加入父任务 `waiting_children` 语义。

### 第五步：加入 `interrupt/resume/pause/cancel`

支持：

- `blocked` 后人工确认
- WebChat 中暂停 / 继续 / 停止
- 长流程恢复
- 自然语言任务控制路由

---

## 18. 治理规则建议

为了避免任务树失控，建议加入治理约束。

### 18.1 最大深度

例如：4 ~ 6 层。

### 18.2 最大节点数

例如：30 或 50 个节点。

### 18.3 最大自动推进步数

例如：连续 5 步后强制给用户阶段性进展。

### 18.4 expand 必须给理由

所有 `expand` 都必须返回 `reason`。

### 18.5 blocked 必须显式化

任何需要用户输入、授权、选择的情况都必须返回 `blocked`。

### 18.6 WebChat 控制语义必须可判定

对于“暂停这个任务”“继续刚才那个”这类消息：

- 若存在 `activeThreadId`，可直接作用于当前任务
- 若存在多个候选任务且有歧义，必须追问，不应擅自猜测

### 18.7 任务树展示必须可截断

当任务树很大时，WebChat 不应一次性倾倒全部节点，建议支持：

- 默认返回摘要树
- 按节点详情钻取
- 限制单次展示深度与节点数

---

## 19. 常见错误与风险点

### 错误 1：把 LangGraph 当新 agent

LangGraph 是编排器，不是替代 OpenClaw 的执行器。

### 错误 2：把任务树只存进 session

session 适合保存当前节点上下文，不适合做唯一状态真相。

### 错误 3：让消息块驱动下一步

消息块只用于展示；graph 更新应发生在当前执行真正结束之后。

### 错误 4：一个 session 混多个总任务

容易造成上下文污染和调度混乱。

### 错误 5：一次 prompt 执行太多职责

必须坚持“一次 prompt 只做一个当前节点”。

### 错误 6：不区分 `replace` 与 `suspend`

会导致父任务恢复语义混乱。

### 错误 7：以为“插件已加载”就等于“WebChat 已可直接使用”

如果没有把 WebChat 路由接到 `startTask / resumeTask / pauseTask / getTaskStatus / cancelTask`，用户仍然只是在用普通聊天。

### 错误 8：只支持自然语言控制，不提供稳定任务绑定

如果没有 `activeThreadId`、命令路由或按钮辅助，“暂停这个任务”很容易产生歧义。

### 错误 9：状态查询只返回一句话摘要

如果不能返回任务树、当前路径和节点详情，用户无法真正管理长任务。

---

## 20. 推荐的实施结论

如果你要基于 OpenClaw 做任务分析、拆解和执行系统，那么最稳、最自然的方案是：

> **把 LangGraph 做成 OpenClaw 插件中的任务编排器。**

### 最终分工

#### LangGraph

- 总任务 thread
- 任务树 state
- 节点路由
- durable execution
- interrupt/resume
- human-in-the-loop

#### OpenClaw

- 当前节点执行
- 工具调用
- 事件流
- 消息播报
- 会话上下文

### 最终收益

这样一来，系统的“继续做什么”不再依赖模型的自然语言承诺，而是依赖一个真正可持久化、可恢复、可调度的状态化编排层。

同时，WebChat 不再只是任务输入框，而成为这套编排器的实际控制面板。

---

## 21. 下一步建议

如果要继续深化设计，建议下一版文档补充：

1. 模块输入 / 输出契约
2. 节点状态转换表
3. `done / expand / blocked / failed` JSON schema
4. `startTask / resumeTask / pauseTask / getTaskStatus / cancelTask` 接口契约
5. 自动推进与失败恢复伪代码
6. WebChat 消息路由与任务控制协议
7. 任务状态视图 schema：`summary / tree / node`
8. 插件目录结构建议
9. 监控与可观测性设计

---

## 22. 一页版总结

### 核心目标

为 OpenClaw 增加一层稳定的任务树编排能力。

### 核心手段

将 LangGraph 集成为 OpenClaw 插件里的上层 orchestrator。

### 核心规则

- 任务是真正的树
- 一次 prompt 只执行一个当前节点
- 只认结构化结果
- 调度权在编排器，不在模型
- WebChat 必须显式接入编排器入口
- WebChat 必须支持任务控制与树形状态查看

### 核心收益

- 自动续跑更稳定
- 子任务递归展开可控
- blocked 场景可恢复
- 长流程可持久化
- 任务状态不再依赖会话文本记忆
- 用户可在 WebChat 中直接查看、暂停、继续、停止任务
