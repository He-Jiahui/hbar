# 语言热切换与当前命令、模型、Goal、Plan 上下文

本页是 [设备语言入口](desktop-device-language.md) 的追加闭环。稳定 runtime 身份解决了草稿丢失，但只让 `commandText.resolve` 读当前语言还不足以更新已经打开的搜索索引。

## 实际问题与修正

原命令目录在 setQuery/catalog refresh 时计算 visibleIds。中文输入“工程”，通过第二同源窗口 General 切英文后，标签变英文、query仍为“工程”，但旧的18个匹配结果仍在。重新输入同一个query才变0。这是实际生产浏览器红测，不是对源码行为的猜测；修复前截图、trace和JSON保留在 `artifacts/desktop-entry-matrix/language-controls/before-palette-fix/`。

修正只增加公开 `CommandTextPort` 的可选订阅。Web的稳定copy adapter在已提交locale更新后通知，palette owner重算当前query的visibleIds/categories。没有重新读取Host catalog、重建runtime或把language装进命令业务参数。

翻译不是导航/执行意图：保留原selected command身份、参数草稿、view、执行状态、结果、unknown锁与sensitiveResetRevision。搜索中旧项可能不再匹配，不自动选择一个邻居或执行隐藏的行；Lumen列表只有实际匹配行可被Enter打开。参数/结果页则保持当前原命令。只改变UI文案，不翻译已返回业务结果，也不重放操作。

适配器用独立已通知locale记录，先被别的consumer调用resolve也不会“消费”通知；重复同locale不再通知。runtime dispose退订，不让旧对象接收后续切换。

## 验证

- `command-palette-language.test.ts`、原palette runtime、language owner：**10 pass / 0 fail / 107 assertions**。包括先resolve再notify、query重算、catalog/selection/draft身份、dispose、mock在途输入、直接确认结果以及RESULT_UNKNOWN锁；locale变化不增加执行/目录读取次数。没有真实Provider或预算写。
- `language-session-controls.spec.ts`：独立当前生产bundle + 临时真实demoHost，**2/2通过**，25.5秒。中英×1440/900/390/320，完整local-fixture配置/revisions、paused Goal完整DTO/ID、Plan mode、单次审批选择、原composer精确文本和唯一WebSocket保持。退出Plan后原deny未被消费，Host全局默认仍ask。
- 实际已开目录中“工程”切英文自动0匹配，query保留。命令参数1234跨语言是同DOM node，没有提交预算写；UI真正执行 `session.getBudget` 只读后，结果完整文本跨语言保持。Run列表均为空。这个Browser测试没有人工注入unknown；该边界由上面的runtime单测验证。
- 当前严格根typecheck、定向ESLint和格式/diff检查通过。首次新增unit把数字参数当number，而接口实际接受string/boolean，按既有input合同修正fixture为'777'后重跑全10通过，未放宽产品schema。
- 本追加单元没有另跑原生palette、多窗口native广播或OS语言更新；不能把设备语言既有原生900证据改称这些已通过。整体全仓门禁另行运行，独立10项不替代完整suite。

证据：

- [Host状态与八组布局](../artifacts/desktop-entry-matrix/language-controls/verification.json)
- [query自动重算](../artifacts/desktop-entry-matrix/language-controls/palette-localized-verification.json)
- [参数/只读结果保持](../artifacts/desktop-entry-matrix/language-controls/palette-preservation-verification.json)
- [英文零匹配截图](../artifacts/desktop-entry-matrix/language-controls/palette-localized-after-en-US.png)
- [中文320模型菜单](../artifacts/desktop-entry-matrix/language-controls/model-zh-CN-320.png)
- [英文320执行菜单](../artifacts/desktop-entry-matrix/language-controls/execution-en-US-320.png)

参考模型/permission/Goal/Plan入口仍依据原 [Plan对照](desktop-plan-exit-reference.md)、[Goal生命周期](desktop-goal-lifecycle.md) 与 [逐入口矩阵](desktop-entry-audit-2026-09-26.md)。本单元只防止热切换使这些已实现的工作上下文退化，不把它称为新的商业模型支持、Search chats或整桌面完成。
