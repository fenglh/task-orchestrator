# control-ui / `/task` 真实交互优化说明（2026-03-19）

## 背景

这轮优化的核心出发点不是再堆新的 task 命令，而是让用户在 control-ui / `/task` 的真实交互里更容易回答下面几个问题：

1. 系统现在做到哪了？
2. 为什么停了？
3. 我下一步应该做什么？
4. 如果任务已经结束，我应该先看哪里？

这份说明总结 2026-03-19 已完成的交互层改动、解决的问题，以及仍待继续优化的点。

---

## 本轮优化目标

### 目标一：状态卡更像产品，而不是内部状态打印

过去的 summary 更偏工程输出，例如：
- `Status: failed`
- `Blocked: ...`
- `Latest update: ...`

现在的目标是让 summary 能同时给出：
- 状态解释
- 当前节点
- review / outcome 提示
- 推荐查看节点
- 下一步建议
- 推荐命令

### 目标二：异常状态不只是报错，而是可执行提示

重点覆盖：
- `blocked`
- `failed`
- `needs_review`
- `partial`

### 目标三：让 summary → tree → node detail 三层串起来

用户不应该在三个视图之间自己“猜关系”。
系统应该明确告诉用户：
- 现在推荐看哪个节点
- tree 里哪个节点是当前主线
- tree 里哪个节点是推荐查看点
- 打开 node detail 后下一步怎么处理

---

## 已完成的交互优化

## 1. Summary：状态卡更完整

### 已完成项

#### 1.1 状态解释
`render-task-summary.ts` 现在会把内部状态翻译成更自然的说明：
- `running` → 运行中
- `waiting_human` → 等待你的输入
- `failed` → 某个节点失败，等待你决定如何继续
- `finished` → 已完成
- `awaiting_plan_confirmation` → 计划已生成，等待你确认开始

#### 1.2 当前主线焦点
summary 现在会显示：
- `Current node: <displayPath> <title>`
- `Current path focus: 当前主线正在推进节点 <displayPath>`

这让用户更容易知道系统当前卡在树的哪一层。

#### 1.3 review 提示
summary 现在不只显示 review 计数，还会补一句人类可读说明：
- `needs_review`：不是失败，而是自动证据检查完成后建议人工复核
- `partial`：说明自动检查只部分通过，建议优先查看 check 明细
- `failed_checks`：说明自动检查层本身失败

#### 1.4 结束摘要
当任务 `finished` 时，summary 现在会显示：
- 完成多少节点
- 跳过多少节点
- 仍失败多少节点
- 当前阻塞多少节点

这让 finished 状态更像“任务收尾卡”，而不是单独一个 finished 标志。

#### 1.5 推荐查看节点
summary 现在会给出：
- `Suggested node: <displayPath> <title>`
- `Suggested action reason: ...`

当前推荐规则：
1. 优先 blocked 节点
2. 否则优先 failed 节点
3. 否则优先 `needs_review` 节点

#### 1.6 推荐命令
summary 现在还会显示：
- `Recommended commands:`
  - `/task node <displayPath>`

这样 summary 不只是告诉用户该看谁，还告诉用户怎么去看。

---

## 2. Blocked：从“状态说明”变成“可执行提示”

`render-blocked-message.ts` 现在会明确区分：
- 当前为什么卡住
- 缺什么输入
- 你可以怎么继续
- 你也可以用哪些命令处理

### 当前输出结构
- 当前任务已卡住，正在等待你的输入
- 问题
- 原因
- 建议你现在这样做
- `Recommended commands:`
  - `/task tree`
  - `/task pause`
  - `/task cancel`

这比单纯显示 `Blocked: ...` 更接近真实交互需要。

---

## 3. Failed：从“失败节点说明”变成“恢复建议”

`render-failed-help.ts` 现在会输出：
- 失败节点
- 失败原因
- 当前最常用的继续方式
- `Recommended commands:`
  - `/task retry`
  - `/task retry <nodeRef> <instruction>`
  - `/task skip`
  - `/task tree`

同时保留一条更像产品建议的话：
- 如果是偶发失败，优先 retry
- 如果是低价值节点或外部条件不满足，再考虑 skip

---

## 4. needs_review / partial：从“技术状态”变成“行动建议”

### 在 summary 中
- 会明确说明 `needs_review` 不是失败
- 会建议优先查看节点详情

### 在 node detail 中
- `needs_review` 会显示解释：
  - 这不是失败，而是建议你快速复核该节点；系统只完成了自动证据检查
- `partial` 会显示解释：
  - 节点已有结果，但自动检查只部分通过，建议优先查看失败项

并且 node detail 里也会补：
- `Suggested actions:`
- `Recommended commands:`

例如：
- `/task node 2`
- `/task tree`

这让 `needs_review` 不再像“悬空状态”，而更像一个明确的后续动作点。

---

## 5. Tree：加强“当前主线感”与“推荐查看点”

`render-task-tree.ts` 这轮补了两类标记：

### 5.1 当前主线标记
- `👉` 当前节点
- `↳` 当前路径

### 5.2 推荐查看节点标记
- `⭐` 推荐查看节点

同时 tree 顶部会显示：
- `Current node: ...`
- `Current path: ...`
- `Suggested node: ...`
- Legend 说明各类标记含义

这使得 tree 不再只是静态结构，而是更像“现在在哪、推荐看哪”的导航视图。

---

## 6. Node detail：从“证据页”走向“操作页”

`render-node-detail.ts` 现在已经具备：
- completion contract
- completion evidence
- runtime evidence
- check 明细
- Suggested actions
- Recommended commands

### 当前推荐动作规则

#### blocked 节点
- 建议直接回复缺失输入
- 推荐命令：
  - `/task node <ref>`
  - `/task pause`

#### failed 节点
- 建议优先 retry
- 推荐命令：
  - `/task retry <ref>`
  - `/task skip <ref>`

#### needs_review 节点
- 建议先看 completion evidence 和 check 明细
- 推荐命令：
  - `/task node <ref>`

#### partial 节点
- 建议先看失败项明细
- 推荐命令：
  - `/task node <ref>`

#### done 节点
- 建议快速浏览证据后回到树总览
- 推荐命令：
  - `/task tree`

---

## 当前交互闭环

到这一步，已经形成了一个比较完整的三层交互闭环：

### Summary
- 任务整体状态
- 当前主线焦点
- review / outcome 汇总
- 推荐查看节点
- 推荐命令

### Tree
- 当前节点
- 当前路径
- 推荐查看节点
- evidence 状态

### Node detail
- 证据细节
- 解释
- 建议动作
- 推荐命令

换句话说，系统不再只是“告诉你发生了什么”，而是开始“告诉你接下来最合理做什么”。

---

## 本轮已经解决的真实问题

### 1. 用户不知道现在做到哪
通过：
- `Current node`
- `Current path focus`
- tree 中的 `👉` / `↳`

### 2. 用户不知道为什么停了
通过：
- blocked / failed 的解释文案
- node detail 的 interpretation

### 3. 用户不知道下一步点哪里/输什么
通过：
- `Suggested node`
- `Suggested actions`
- `Recommended commands`

### 4. 任务结束后用户不知道先看哪里
通过：
- finished summary 的结束摘要
- `needs_review` 节点的推荐查看逻辑
- tree 中的 `⭐ suggested node`

---

## 仍待继续优化的点

### 1. 统一语言风格
当前仍然存在中英混合，例如：
- `Task:`
- `Status:`
- `Suggested actions:`
- `Recommended commands:`

如果后续更偏 control-ui 用户界面，可以考虑进一步统一成中文。

### 2. 推荐动作仍是“文本提示”，不是可点击操作
目前还是：
- 显示 `/task node 2`
- 显示 `/task retry 1`

后续更理想的是：
- 在 control-ui 里把它做成可点击快捷动作

### 3. 推荐节点规则还比较简单
当前规则：
- blocked > failed > needs_review

后续可以更细：
- 优先最近失败节点
- 优先当前主线上的 review 节点
- 避免推荐已低价值分支

### 4. tree 仍是全量展开
现在已经能看懂“主线在哪”，但对很深的任务树来说：
- 默认只展开当前路径
- 其他分支折叠
可能会更好。

---

## 建议的下一步方向

如果继续沿 control-ui / `/task` 真实交互优化推进，建议优先顺序如下：

1. **统一语言风格**
   - 决定最终偏中文还是中英混合
2. **把 Recommended commands 做成 UI 快捷动作**
   - summary / node detail / blocked / failed 里都可直接点
3. **优化 tree 的折叠策略**
   - 更突出当前路径
4. **细化推荐节点策略**
   - 让推荐更像真实助手判断，而不是静态优先级

---

## 一句话总结

这轮优化的本质，不是增加更多命令，而是让 control-ui / `/task` 从：

- 会显示任务状态

逐步变成：

- 会解释当前状态
- 会指出重点节点
- 会给出下一步建议
- 会把建议收成可执行命令

这才更接近“真实可用的复杂任务交互界面”。
