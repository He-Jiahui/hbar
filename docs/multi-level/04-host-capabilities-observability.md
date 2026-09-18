# P4：Host 业务命令化与监控数据能力

状态：实施中；预算命令与 Run 持久受理/查询/取消/watch 已交付，其余业务迁移和监控数据仍待实施。上级：[总计划](command-first-architecture-plan.md)。依赖 P1 调用契约、P2 消费端口与 P3 设置应用服务。本计划交付 CLI 可验证的数据/业务闭环；图表在 P5 接入。

## 1. Host 模块保持 MVC 与领域边界

`apps/host` 负责 Bun 生命周期、认证、Controller 和装配。Controller 验证网络请求、注入身份、路由到命令/查询 dispatcher，不在 RPC switch 中实现 Session 或表单业务。

`packages/kernel` 或领域插件提供用例和 handler；`packages/storage` 在 Worker 内实现数据库与事务。commands 包提供注册/执行机制及端口。命令重构复用现有运行、审批、意图日志、结算、增量事件和权限入口，不能另造平行的执行链。

新增具名网络方法以 `command.catalog`、`command.execute`、`query.execute`、`operation.get/watch/cancel` 等为目标设计，纳入现有 JSON-RPC/WS 协议与 Zod 校验。协议版本、producer、client、兼容 adapter 一起更新；通用入口仍按规范 ID 校验输入/输出，不能接受随意 payload。

旧 RPC 在迁移期可成为同一 dispatcher 的 adapter。没有新命令的一项功能不能先删掉旧能力。完成一个领域后移除该领域的重复业务分支；最终 UI 不公开原始写 RPC。

## 2. 全功能命令迁移清单

| 领域             | 代表命令/查询                                                              | 实现归属与验收闭环                                     |
| ---------------- | -------------------------------------------------------------------------- | ------------------------------------------------------ |
| 工作区/会话      | workspace.create/open/list；session.create/list/rename/archive/fork/export | kernel 会话用例；目标权限、分页、历史/分支保真         |
| 运行/交互        | run.submit/cancel/retry；approval.resolve；questionnaire.answer            | 运行与审批服务；受理、队列、流、取消、结算、重连       |
| 模型/预算        | session.setModel/setThinkingLevel/setBudget/getBudget                      | 模型配置用例及 budget 插件；有效值、版本、限制一致     |
| 目标/计划        | goal.create/update/clear；plan.update/clear/query                          | goal/plan 插件；保留已有运行钩子与约束                 |
| 子 Agent         | agent.create/list/cancel、父子关系查询                                     | 领域插件；独立子 Session、取消传播、预算归属           |
| 文件/附件        | file.list/read/write；attachment.upload/remove/query                       | 文件/附件服务；路径限制、分页、artifact 鉴权、写入审批 |
| browser/computer | 已交付的会话启动、状态、动作、释放命令                                     | 原能力插件；输入/截图等走受管端口与权限                |
| 供应商/设置      | provider/model 查询与配置；settings.get/set/unset/apply/content            | 设置用例/能力服务；三层覆盖、凭据端口、动态校验        |
| 系统/扩展        | connection、pairing、device、plugin、paths、diagnose                       | Host/客户端各自所有者；依赖验证、撤销、卸载释放        |
| 状态查询         | metrics.query/watch；usage.query/export；git.status/log/stats              | 监控服务/领域插件；真实数据、过滤、容量与口径          |

这些为目标语义，具体旧 ID 映射由 P6 逐项记录。某个子 Agent/统计能力如果仅在旧文档中列为后续扩展，登记为“本次新建能力”，不能标为已经迁移。既有且不在主界面示意图上的配对、设备、路径、插件、浏览器等功能仍必须可访问。

## 3. 预算切片保持现有业务语义

依据核对的 `plugins/budget/src/index.ts`：`session.setBudget <tokens>` 表示当前预算账本的总上限，不是追加 token，也不清零已用量。现有规则限制降低上限，并拒绝修改 completed/stopped 账本；重构先保留规则，领域错误明确返回。

返回 limit、used、remaining、phase、revision 和 accountingVersion。当前用量结算为 `max(input - cacheRead, 0) + output`；重构核对供应商归一的缓存包含关系并版本化口径，不能把预算数字当作普通设置值。

预算耗尽限制发生在已有执行检查点，在途供应商消耗可能超出剩余额度；记录与说明实际检查时机，不因名称叫上限便保证绝不超额。降低上限、重置账本、改变消耗口径另立明确命令和迁移，不混在本次 adapter 中改变。

## 4. 可观测数据模块

| 模块                      | 数据源                           | 交付数据                                                                       |
| ------------------------- | -------------------------------- | ------------------------------------------------------------------------------ |
| Host performance service  | 受管 OS adapter、Host 自身计数器 | CPU、内存、进程树、线程数/可观测线程 CPU、磁盘读写、网络收发、事件循环、队列   |
| Execution metrics service | Run/Step/Attempt/ToolCall 事实   | 工具调用次数/耗时、活动/排队/并发、成功失败、总计耗时                          |
| Usage service             | 归一 usage 账本、Attempt 时间    | 输入/输出/cache read/write、消耗速率、模型用量、估算金额、TTFT、请求总响应耗时 |
| Git statistics provider   | Git diff/log、自动提交来源记录   | 自动提交时间柱状图、提交文件数、增删行数时间序列、repo 状态                    |

归一/聚合属于 Host 业务模块；OS 采集/价格表/Git 实现由公开 provider 端口注入。现有领域模块能承载时先就近分模块，不无理由新造 telemetry/analytics 大框架包。

所有查询支持 scope、时间窗、桶宽、过滤、单位和有界分页/最大点数。返回 `value | null`、availability/reason、source、estimated、sample count、gap、observedAt 与口径版本；缺失、无权限、平台不支持不能填 0。

## 5. 指标口径固定项

- CPU/进程/磁盘/网络区分整机、Host 和受管子进程。差分计数采用单调时钟，处理启动、重启、回绕；不能把整机 CPU 按 token 比例分摊给 Session。
- 线程信息按平台能力报告，区分线程数量与线程 CPU 时间；不承诺浏览器环境能采集完整 OS 线程/磁盘数据。远程连接默认显示远程 Host 的数据。
- 工具与请求并发分别计数。排队、模型请求、工具执行、审批等待与总 Run 时间分开，不将重叠区间简单相加。
- 用量按 usage/Attempt ID 去重，保留供应商、模型、Session 和父子 Agent 维度。单体与包含后代的查询分开，聚合避免重复计费。
- 结算 token 与流式估算分开；只有最终 usage 时不伪造逐秒真实 token。速率带窗口和来源，总消耗速率、输入速率、输出速率分别定义。
- 输入速率默认是时间窗接纳的 input tokens；没有供应商 prefill 数据时不称为模型预填充吞吐。输出速率按可靠 token 数与对应生成时段计算，估算明确标记。
- TTFT 记录 Attempt 发起、首供应商事件、首思考、首可见正文、结束；首字指标采用首可见正文定义，同时保留其他时间。超时/取消分组，支持 p50/p95；历史缺时间不得补造。
- 缓存命中率由兼容口径的总 cacheRead 除以 cacheEligibleInput；零分母无样本，不平均每请求百分比。未报告缓存资格输入时返回不可计算或有版本的明确估算。
- 估算金额基于带来源、币种、模型映射、版本和生效时间的价格表，区分输入、输出与缓存价格。未知价格为 null；不冒充供应商账单。
- Git 提交来源记录 `auto | manual | external` 与 session/run/operation 关联，不猜提交 message。按 repoId/commitId 去重，定义 author/committer 时间、时区与桶宽。
- merge 首版按第一 parent 统计并返回该口径；rename 独立识别，binary 不估增删行。rebase 后可达性变化需增量重索引，保留来源审计。统计自动提交不代表自动启用定时提交。

## 6. 容量、生命周期与可靠性

OS collector 由 Bun Host 管理，多个订阅共享采集任务；原生辅助进程只承担采集，不运行会话业务。采样频率、并发、进程数、队列、最大帧/批次和保留时间配置化，确定默认前用固定负载基准验证。

原始遥测使用有界缓存和保留窗口，长期趋势持久化分级聚合；使用量账本与提交来源事实按持久数据策略保存，不随遥测 TTL 删除。高频数据丢样显式 gap；持久业务事件按 P2 恢复。

历史查询分页/降采样，导出用受鉴权引用或流式结果。重型 Git 扫描/聚合不阻塞 Host 事件循环，通过 Worker/受管任务执行，支持取消与进度；增量缓存按 repo/revision 失效。

预算、用量、监控共享归一事实但各有计算责任；AIUsage 和图表不由组件自行累加。一个 Session panel 的订阅不触发全站广播所有历史。

## 7. 独立交付与验收

| 切片 | 交付与验证                                                       |
| ---- | ---------------------------------------------------------------- |
| P4.1 | 预算/会话最小命令贯通，保留领域语义，CLI/API 同结果              |
| P4.2 | 按运行审批、目标计划、文件附件、系统扩展逐域迁移；每域独立提交   |
| P4.3 | 子 Agent 完整父子关系/取消/预算闭环；区分已有迁移与新增能力      |
| P4.4 | Usage/Attempt 时序与查询；去重、缓存口径、价格版本、历史缺值     |
| P4.5 | OS collector 与 CLI 查询；平台差异、计数回绕、慢消费者、有界保留 |
| P4.6 | Git 来源与统计；merge/rename/binary/rebase、时间桶、取消扫描     |

使用临时数据库/仓库、本地 fixture provider 和确定时间源测试，不请求商业模型。至少一组真实 Host 采集 smoke 和 git fixture 集成验证数据来源。新能力只有数据服务与 CLI 可独立验收后才交给 P5 画图。
