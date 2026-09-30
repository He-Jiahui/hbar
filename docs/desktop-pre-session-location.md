# 首次发送的工作位置入口

参照 CC 的 `RepositoryLaunchControls` 已渲染 desktop/mobile 组件图，工作位置由输入区中的单一入口打开。首层按目录、分支、工作树模式组织；目录和分支列表在同一弹层内下钻，提供返回、搜索和关闭。桌面弹层依附入口，窄屏变为底部面板；只有覆盖层外框定位，内部全部使用正常 flex 流。图标沿用共享 sm/md 等级，文案由 Web 宿主提供中英文类型化 copy，保留 Hbar 现有主题。

选择只修改客户端草稿，不创建 Session 或运行 Git 写入。隔离模式的分支是**基准分支**：首次发送时才创建 Host 管理的派生分支与工作树。目录页每次展示 60 行并可继续展开，远端项目与分支使用显式分页；分支 VM 每页 25 行、下一页替换当前页，不无限累积。

发送后，准备状态出现在所属 Session 的输入区附近，并锁住重复发送及相冲突的 composer 操作。取消保留消息草稿；不确定结果可核对，导航暂停后需回到原会话显式继续。已创建 Session 后的 landing 自然卸载不会抹掉失败反馈；成功会清理首次发送状态，确定失败的提示可单独关闭。关闭提示不删除 Host 工作树。

本切片尚未迁移 CC 的共享工作树切换任意分支与立即创建新分支操作：当前工作树使用项目已有分支，隔离模式允许选择基准分支。它们需要后续独立入口/执行闭环，不能把当前部分交付称为所有交互已一致。

验证：`e2e/pre-session-location.spec.ts` 在英文 1440×900、中文 390×900 的生产 Web + 临时 Host 上通过 2 cases（12.9s）。核对菜单选择不新增 Session、不移动原 HEAD，首次发送仅接受一个 local-fixture Run，持久 target 为 derived、ready、locked，实际 branch 为生成分支；页面无 JS 错误或水平溢出，并验证选择后焦点恢复。Root 查看 desktop Location、narrow 分支列表和选择后的 composer 截图。strict TypeScript、零警告 ESLint、flow/icon/content guards 与 2 个纯模型测试（14 assertions）通过。

最初的真实失败包含选择后焦点未恢复（已修正）与夹具把 Host home 放在 Git repo 内（路径保护正确拒绝；夹具改为同一自有临时目录下的两个并列目录）。早期模型 locator/reader 方法拼写错误未作为产品故障或通过结果。SSR 组件测试被既有 `prop-types`/`react-is` 缺失阻断，最终组件验收使用生产浏览器，纯模型单测不加载 MUI。全仓 typecheck 仍有既有 preview/模块解析诊断；未安装依赖、未运行原生窗口 smoke，未修改真实用户配置或付费调用。
