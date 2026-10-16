# 输入缓存指标与验收

输入缓存命中率是 provider 返回的 `cacheRead / input`。`input` 包含缓存读取和写入；不能再把 `cacheRead` 加到分母。窗口内使用词元加权的 `ΣcacheRead / Σinput`，包含冷启动、低命中和失败请求中已记账的用量，不使用单次百分比的算术平均值。

`usage.query` 的 `cacheHitRate` 提供该比例。旧实现依赖没有记录的 `cacheEligibleInput`，导致指标不可用；可复用输入的利用效率是另一种指标，不能替代实际输入命中率。会话、对话与上下文窗口统计采用同一口径。

缓存验收要求总体 **>90%**，最近连续 **10 次**每一次均 **≥95%**。Host 返回 `cacheQuality`，包含近期加权比例、最低比例和未达标次数。样本不足、计数不一致或查询有数据缺口时不能判定达标。冷启动仅在实时验收报告中单独列出，仍然保留在总体分母。

前端入口为设置中的词元用量、会话统计及单次请求明细。趋势图按真实时间绘制，显示 90% 与 95% 参考线；最多聚合成 120 点，先累加 token 再计算比例。空桶保留缺口，键盘焦点可以读取桶的时间、缓存 token、总输入和实际比例。

界面结构沿用 [ReactBits AI Usage](https://pro.reactbits.dev/docs/app-ui/ai-usage) 的指标层级，交互采用 [Analytics](https://pro.reactbits.dev/docs/app-ui/analytics) 的时间范围、趋势和样本详情关系，通过现有 Lumen tokens 与 typed message scopes 落地。

## 自动回归

普通测试使用临时数据库与本机 provider fixture，不依赖真实模型：

```powershell
bun test ./tests/model-tool-advertisement.test.ts ./tests/workflow-sequence.test.ts ./tests/input-cache-quality.test.ts ./tests/input-cache-visuals.test.tsx ./tests/session-observability-usage.test.ts
bunx playwright test e2e/input-cache.spec.ts e2e/settings-usage.spec.ts
```

工具 manifest 在同一个 Run 内保持名称、schema、说明及排序稳定；焦点和 scope 的变化进入 Host 上下文，实际调用仍通过权限、scope 与工作流检查。

## 真实服务验收

这是显式启用的独立验收，会产生模型请求费用。通过当前 shell 的环境提供 `HBAR_CACHE_VERIFY_BASE_URL`、`HBAR_CACHE_VERIFY_MODEL` 和 `HBAR_CACHE_VERIFY_API_KEY`，凭据不要写入仓库或命令行参数。然后运行：

```powershell
bun run verify:input-cache --live
```

使用 `--concurrency=3` 可并行验收三个隔离会话，总计最多 36 次请求；每个会话分别通过相同门禁，不能用跨会话平均值掩盖失败。

脚本通过真实 Kernel 和 PiDriver 发出最多 12 次 Responses 请求，使用 XHigh、11 次有界连续工具调用和每轮更新的 Host 状态。上下文来自各读取一次的仓库代码，不填充重复内容；每次工具返回测试源码中下一个 2,400 字符片段，以覆盖历史增长的场景。工作区、会话与数据库完全隔离；凭据只存在内存中。单次输出最多 2,048 token，整轮截止时间 180 秒；请求数、步骤数、实际 thinking、真实用量与退出状态全部参与验收。

报告写入忽略目录 `artifacts/input-cache-verification/live-*/result.json`。报告保留冷启动和全部样本，不保存凭据或完整 prompt；任一请求未达目标、样本缺失或运行失败时返回非零退出码。前端的自然请求指标仍是运行中的最终依据；受控验收不能保证新会话、压缩、模型切换或第三方路由变化后始终达到同一比例。

验收使用仅绑定回环地址的透明代理，检查 PiDriver 最终发送的载荷。代理原样转发请求正文与流式响应，只记录输入及配置的 SHA-256、上一轮输入是否为精确前缀、会话亲和字段是否正确、HTTP 状态和上游 request ID。配置包括工具、模型、reasoning 与缓存参数。前缀、配置或亲和字段不一致也会使验收失败；报告不会把客户端前缀稳定误写成服务端必然命中。

Responses 服务返回 `x-codex-turn-state` 时，PiDriver 在同一 Run 内回带首次收到的有效状态，后续响应不会覆盖它。provider、模型、端点、凭据、会话或协议改变后状态退役，新 Run 也不继承；状态只存在内存中。验收代理记录请求和响应是否携带状态，以及是否与首次收到的状态一致，不保留原值。错误回带同样导致验收失败。该字段遵循 [Codex 客户端的每轮路由状态语义](https://github.com/openai/codex/blob/main/codex-rs/core/src/client.rs)，不能保证网关实际保持相同上游账号或缓存实例。

报告还分别记录请求的 `x-client-request-id` 和响应的 `x-request-id`。当前牛马用量接口的 `request_id` 使用 `client:<x-client-request-id>`，与响应 ID 不同；排查后台日志时须区分这两种关联值。用户用量接口中的账号值和会话字段不能作为实际选路记录使用。

2026-10-16 实测的通过与失败结果见[验收记录](input-cache-verification.md)。目前串行测试达到目标，三会话并发仍有上游返回零缓存的请求，整体目标尚未完成。

当前牛马 `gpt-6.1-sol` 实测拒绝 `prompt_cache_breakpoint`。因此修复不向该网关发送显式断点或把一次兼容性失败自动转为第二次付费重试。后续能力接入必须通过 provider 契约及真实兼容性验证。

Host 状态快照以带版本和会话 ID 的元数据附着在对应 assistant 消息上。重建请求时在原位置恢复快照，最新快照表达当前事实；跨会话 seed 不恢复父快照。快照参与容量与压缩边界估算，压缩对应历史后自动退役；摘要请求不恢复历史指令。普通显示消息内容和用户历史保持原样。
