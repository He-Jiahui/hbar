# 会话工程与分支只读上下文

参考 `D:/Git/cc-haha/docs/images/app/en/session-new.webp` 和 `workspace-changes.webp`：参考桌面的 composer 靠近发送控件展示工程/分支。其 `ProjectContextChip.tsx` 是只读展示；首次发送前的 `RepositoryLaunchControls.tsx` 才负责切换启动目录、分支或工作树。hbar 不把这些启动前动作伪装成已绑定会话的可编辑能力。

本单元从当前会话的 `session.workspaceId` 定位工程，仅调用现有 Host `git.info` 查询明确的 `workspace.path`；不调用 `git.branch` 或 `git.worktree`。已确认分支时显示“工程 / 分支”；Git 返回空分支时只显示工程，不推断是非仓库、detached HEAD 还是其他没有可展示分支的情况。查询失败、超时或断线会隐藏旧分支并提供就近重试（断线时等待连接恢复）。工程名来自会话的工作区归属，不从 Git 的仓库名、remote URL 或当前全局导航猜测。

参考宽屏把只读位置放在 composer 工具行，紧凑布局放在输入框下方。hbar 现在依据 composer 可用宽度（不是截图坐标或单纯视口宽度）在这两处切换：真实 Host 的 1440/900px 页面，footer 均为 832px，工程/分支与权限、Goal、Plan、模型、发送同处一行；390/320px 时移至输入框下方的正常流。仅一个 React hook 订阅/定时查询，两个纯展示容器由 CSS `display:none` 互斥，隐藏者不在可访问树或 Tab 顺序；失败时错误与重试在下方保留可读空间。工具行中的长工程/分支收缩，分支保留尾部，完整内容保留在 `title` 和可访问名称中；没有固定坐标或假按钮。共享 `LumenPromptComposer` 的上下横向装饰线是组件自身 `boundary="horizontal"` 的 beam，并非这项上下文的滚动条；本单元未修改共享组件或用局部 CSS 隐藏它，仍是与参考审美不同的已知点。

客户端只投影当前会话；导航或工程路径改变立即失效，结果按捕获的会话、工程、路径与代际提交。断线立即清理；重新连接、窗口重新获得焦点、运行终态和当前可见视图的 60 秒单飞计时触发读取。无可取消的跨传输保证时，晚到的旧 Host 响应不会污染新目标。`git.info` 虽然网络结果小，Host 内部仍查询 Git status，因此不随每次按键或渲染刷新。

验证：`tests/session-git-context.test.ts` 定向覆盖真实输入路径、空分支、跨工程晚到、工程路径更新、单飞、错误重试、取消及断线旧响应；`tests/session-project-context-react.test.tsx` 覆盖目标绑定及中英错误/断线内容。`e2e/session-project-context.spec.ts` 在临时目录内建立 A/B 两个真实 Git 工程，通过真实 Host 读取 A/B 当前分支、外部 checkout、焦点刷新、返回 A、再一次外部 checkout 后发送并完成真实 Run、断线清理，并在两种语言的 1440/900/390/320 四宽截图检查可访问树只有一个工程组、宽屏与权限同一行、窄屏下置、分支占可见宽度、权限/模型/发送可达和整页不溢出；1440/320 还实际打开与关闭权限、模型菜单。截图在忽略目录 `artifacts/session-project-context/context-<locale>-<width>.png`。真实 Host E2E 没有注入确定性的慢响应；这一竞争由 runtime 行为测试覆盖。构建产物使用独立忽略目录，不覆盖共享 `apps/web/dist`。
