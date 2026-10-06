# Storage Worker 生命周期与残留进程排查

## 本次现场与证据

2026-10-05 桌面构建覆盖 `hbar_workspace_query.node` 时得到 `EBUSY`。Windows 进程与模块清单确认占用者是 2026-10-04 启动的 `bun test ./tests/sandbox-host.test.ts`（PID 22768），不是 hbar Desktop 或独立 Host。该进程加载着仓库的原生查询模块；启动 shell 为 PID 2276，shell 的上级 PID 15020 已不存在。Windows 不会仅因父启动器退出而自动终止这条测试链。

用户要求查明并修复后，清理前再次核对了两个 PID 的名称、创建时间、父链及完整命令行，仅结束了这条已确认的测试链。原生模块可重新以读写方式打开，文件锁释放；没有结束其他应用的 WebView2，也没有删除真实配置或会话数据。当前版本 sandbox 测试重新运行 7/7 通过，未重现旧进程的长期挂起。

没有保留下来的调用栈，不能确定旧 PID 当时具体停在哪个 Promise。相关历史 `d5da6ed9` 记录过 Bun 测试断言等待 Storage Worker 回复的停滞；这是历史线索，不是旧 PID 的唯一根因证明。

## 可复现的生命周期缺口与修复

故障注入 Worker 在收到请求后直接退出。修复前，`Storage.call('ready')` 在 Worker 已退出后仍不 resolve/reject；500ms 回归探针失败。原实现仅在 Worker `error` 事件拒绝请求，`exit` 事件只完成关闭等待；普通请求与关闭握手也没有回复期限。

修复后的 Storage 适配层：

- Worker 意外退出或报错时，拒绝所有在途请求并清理定时器。
- 普通 RPC 默认等待最多 30 秒；关闭握手默认等待最多 5 秒。可通过类型化 `StorageLifecycleOptions` 为调用方或故障夹具设置有效期限。
- 超时后拒绝在途请求、停止接受新工作并终止这个 Storage 自己创建的 Worker；不自动重启或重放写操作。
- 超时错误明确说明结果可能未知，不能当作“确定没有写入”使用。
- 关闭中的新请求被拒绝；并发 `close()` 共用同一关闭结果。关闭握手失败仍在 `finally` 中释放 Worker。
- 正常回复与同步 `postMessage` 失败均移除该请求定时器，避免迟到超时或资源残留。

该修复针对 Storage Worker 的生命周期缺口，不声称修复所有第三方原生代码死锁、外部启动器异常或任意不响应取消的插件。关闭桌面窗口与停止独立 Host 的既有产品语义没有改变。

## 验证

`tests/storage-lifecycle.test.ts` 用独立 Worker 覆盖意外退出、不回复、崩溃、关闭握手不回复、并发关闭、关闭后新请求与无效超时。没有调用商业模型或使用真实数据库。

修复后，Storage 生命周期、真实 Storage、sandbox 与 reasoning effort 定向测试共 30 pass / 0 fail；Goal/Budget 合并、双预算、恢复记账与 Host bundle 定向测试另 22 pass / 0 fail。修改源码与测试的类型感知 ESLint、Prettier、Git diff 检查通过。

全仓 typecheck 仍存在旧 CLI 插件类型、已删除旧 UI 模块引用、Storage worker overload 和无关测试契约诊断；本次 Storage 生命周期修改文件没有诊断。另独立修正了 `04beca5d` 时间视图测试只提供单个标签而不满足完整 Host 文案契约的问题，不冒称全仓检查已通过。
