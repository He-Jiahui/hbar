# Settings：保留草稿的原位选项恢复

本单元接续[设置逐入口审计](desktop-settings-final-entry-audit.md)，修复模型／思考等级选项读失败后的恢复断点。它迁移 cc-haha 的“读取动作与错误留在模型区域、可以再次读取”的交互语义，不把 hbar 的分层设置 Save／CAS 改为即选即存，也不冒充供应商连接测试。

## 依据、历史与原问题

基线为 hbar `ea0e3a5`、cc-haha `e28d0a65`。主线查看了原发布画面 `D:/Git/cc-haha/docs/images/app/zh-CN/settings-provider-add.webp`、原 `ProviderSettings.tsx` 的模型拉取与就近结果、已有原组件/实际Host审计记录，以及旧hbar中英1440／320故障图。原图证明区域层次；受控真实Host错误证明hbar恢复断点，两者不混为同一证据。

旧hbar路径：Settings → Model →选择真实Local fixture →一次思考选项读取失败。模型草稿仍在，但整表Refresh因dirty正确禁用，字段下没有只读Retry；跨分类往返也不重读。新维护E2E在冻结旧生产资源上准确失败于Retry不存在，前面的草稿、错误、Refresh禁用／Save可用均已通过。红图和trace保留在 `artifacts/settings-content-recovery/browser/red-results`。

历史 `89de53e` 已增加 `settingsForm.refreshContent`，用于Provider变更后刷新已加载表单，保留原稿；UI此前只接整表refresh/submit/reconcile。不能删除dirty刷新保护来“修复”这个缺口。`c332ffe` 的Provider编辑器需要保留原表单，故不能把既有后台内容刷新一律限制为当前可见页。

本次还发现整表revision过滤选项回包的问题：无关字段编辑会改变revision，但不触发该选项的新读取，旧回包被丢弃后可能一直loading。新增测试验证修后行为；首次执行时产品补丁已落地，未把它描述成旧版本实跑红测，也没有声称已二分首个引入提交。

## 用户行为与模块归属

- 第一个可见失败字段下只有一个“重试表单选项”，实际重新读取该表单全部动态选项，文案不假称只重读单字段。不调用 `settings.apply`，不清dirty、raw、inheritance unsets、baseline revisions或reports。
- 读取中按钮禁用并就近显示进度；重复Enter不会取消或派发第二组读取。失败后仍可再次重试并保留Retry焦点；成功回到原输入，继续选择真实选项。
- 缺少模型明确提示先选模型；模型已不可用明确提示重新选择。不可用的空选择器禁用，没有无效展开或把前置条件问题冒充网络错误的Retry。
- 断线时恢复按钮禁用并说明草稿保留；重连后可显式重试。不宣称无重连事件的自动刷新或新的Host连接协议。
- 捕获runtime、form、分类、字段及原draft revision；切分类、作用域、实例或修改草稿后不把旧反馈或焦点投给新目标。用户主动Tab、点别处、其他焦点及native dialog优先。
- submitting／unknown时重试与表单编辑禁用，runtime再次拒绝恢复动作；原提交身份和未知结果锁不变。未绕过原核对／幂等恢复流程。

`@hbar/contracts` 的原 `settingsForm.refreshContent` 新增可选 `retry:{field,revision,groupId}` 前置条件。只有携带该UI恢复上下文时才核对当前panel/form、busy、分类、revision及失败字段；旧Provider无retry调用继续刷新原缓存表单。不是新增Host写方法或重复RPC。

runtime对每个字段本次loading对象使用独立请求身份。无关编辑保留该身份，依赖变化、新读取和整表重载替换它；回包同时校验原schema与字段身份。不复制业务状态，不增加无界请求map。关闭后的合法结果可以更新原缓存，不抢回页面；dispose后不再发布。

React只保留一次交互的来源及焦点意图，业务选项与草稿仍在runtime。公开标签由Web宿主提供中英typed bundle，错误原因不直接把 `missing_model`／`READ_FAILED` 技术码拼给用户。动作与进度采用正常flex流、长文本换行；没有新增固定坐标或另一套全局通知。

## 真实画面补出的焦点边界

首个原生候选 `CcMgTqhe/D2b5SAOn` 的四组行为断言通过，但主线和agent亲看中文900×600截图后发现：输入拥有焦点，却在滚动面板下方。弹层打开后出现滚动条，使接近换行阈值的字段布局改变；只检查DOM焦点、元素有尺寸或Playwright visible都不足以验收。

修复只在原交互仍持有焦点时使用正常focus滚动，并在下一帧、原owner／目标仍匹配且无inert/modal时揭示aria-controls弹层与原输入。焦点来源变化或卸载会取消／丢弃该帧；面板预留稳定滚动条空间，避免出现滚动条后突变换行。未提高窗口最小尺寸或隐藏字段。

候选原生证据 `artifacts/settings-content-recovery/native/hbar-native-session-settings-content-hJb5F4` 保留，尤其 `04-recovered-input-focus-zh-CN-900.png` 不能回填成视觉通过。最后验收增加输入全框在pane/viewport交集、中心命中与真实选择，不靠测试中的scrollIntoView纠正产品。

最终原生 `CLOy2vbw/D-aX6DgM` 的中英×900×600／1440×960 **4/4通过**，24张截图；输入全框、输入中心及首项中心命中在任何trial click之前检查。随后真实ArrowDown／Enter选择思考等级，得到2项本地草稿，Back／重入保留两值；Host快照与revision不变、0settings写、0Run、0pageerror／native console错误。

- [中文900：恢复后可见的原输入与真实选项](../artifacts/settings-content-recovery/native/hbar-native-session-settings-content-zPEb3l/04-recovered-input-focus-zh-CN-900.png)
- [中文900：键盘选择后的两项本地草稿](../artifacts/settings-content-recovery/native/hbar-native-session-settings-content-zPEb3l/06-keyboard-two-local-drafts-zh-CN-900.png)
- [原生逐项验证与几何](../artifacts/settings-content-recovery/native/hbar-native-session-settings-content-zPEb3l/verification.json)、[精确清理](../artifacts/settings-content-recovery/native/hbar-native-session-settings-content-zPEb3l/cleanup.json)。主线亲看了两张中文900最终图；保留原schema/Lumen视觉，不把此恢复改动描述成整个设置页像素复刻。

另一个只读review加固：如果UI恢复前置条件被拒，但随后后台读取已使同一canonical字段恢复，清掉旧局部命令错误；不让成功字段继续显示过期Retry。这是审阅驱动修正，不冒称独立旧版本故障重现。

## 验证记录

新增运行时13项／98断言通过；与原settings form合跑20项／134断言通过。覆盖dirty/raw/unsets、无关编辑、依赖与同revision重载、双击、scope／instance／关闭、submitting／unknown、旧Provider后台兼容、dispose和断线后显式恢复。断线部分是typed port故障测试，不冒充真实网络端到端。

组件与既有设置／Provider／schema测试合计40项／369断言通过，含新增中英恢复、多个失败仅一入口、长文案、offline、missing_model／model_unavailable说明与禁用、正常空列表。该集合与上述运行时集合有重叠，不相加成唯一测试数。

最后focus补丁后，以上六个文件合并重跑为 **53 pass／0 fail／467 assertions，33.37s**；同时根 `tsc --noEmit`、全部本单元TS/TSX严格ESLint（0warnings）、Prettier通过，content/icon/flow guards分别检查3／4／1文件通过。最终Web构建3074 modules，保留既有大bundle warning；新Host资源构建通过。

首轮真实Host中英2/2通过11.8s：两个独立App窗口；模型草稿与同一form DOM、id、revision1→1保持，Host global revision0和完整snapshot前后相同；第一次Retry再次失败后保焦，下一次恢复真实options；scope晚回包隔离。0settings.apply、0Provider写、0Run。此处对应 `CcMgTqhe` 候选，后续增加了900可视范围验收，不把首轮当最终资源证明。

最终 `CLOy2vbw/D-aX6DgM` 增强维护E2E **2/2通过，13.0s**，保留上述断言，并加入初始900×600的实际可视框／命中及键盘选择；input在pane内完整可见、首选项可见部分中心命中，探测前没有测试滚动或click自动修正。英文／中文均由1项模型草稿变为2项本地草稿，Host仍revision0、写入0。浏览器旧Cc的1440→320→900轮转路径曾通过新断言，另一旧初始900试验卡在响应式侧栏前置竞态，未到目标；二者不能冒称原生屏外问题的浏览器红测。原生候选与最终可视范围证据独立保留。

同一最终资源的完整组合回归 **35/35，0fail／0skip，1.8min，exit0**：新恢复2、Provider渐进编辑2、设置作用域导航2、Provider landing2、启动设置连续性27。日志 `artifacts/settings-content-recovery/final-35.log`，结果 `final-results`；启动截图独立保存，不覆写旧单元证据。35包含上述新2例，不重复相加。旧D1sa资源只修General预期后另2/2通过，证明该旧测试修正不依赖本单元产品。

主线亲看[最终中文320原位失败／重试](../artifacts/settings-content-recovery/browser/zh-CN-failed-320.png)，结合[两个实际App窗口的请求与零写入记录](../artifacts/settings-content-recovery/browser/zh-CN-report.json)核对语义。该错误由有界读故障注入产生，成功选项和延迟回包来自真实临时Host，不把fixture失败冒称生产Host自发故障。

根 `bun run check` 实跑native build、strict lint、typecheck通过，完整Bun **2068 pass／1 fail／15372 assertions，357文件，300.41s**，总exit1。唯一失败仍是外部 `QuoteAuthentication.tsx:native-visible-control`；日志 `artifacts/settings-content-recovery/final-check.log`。该次运行开始于可视范围补丁之前，不能将它写成最后focus补丁后的完整全量重跑。补丁后另跑严格lint/typecheck和对应交互验证。

旧设置4suite初跑31pass／2fail，失败仅Provider landing精确导航数组遗漏已上线General；`7f9d14d` 原预期与 `80861aa` 新分类的历史已核对。冻结旧 `D1saJc7c/DIGCkbQF` 同样准确红，证据 `artifacts/settings-content-recovery/landing-preexisting-red`。维护测试仅补desktop/mobile精确顺序中的General，保留后续分类记忆和session scope断言，不删断言或改产品导航。

浏览器维护测试的两次中间失败亦保留：恢复focus已经自动打开ComboBox后再点击toggle会关闭；缓存命中不会产生预想的新RPC。测试已分别改为验证真实已打开的选项、以第二独立App窗口验证另一scope；没有为测试取消产品缓存或改变组合框语义。

本单元没有修改hbar-ui产品，不夹带并行Authentication工作。新构建Host/Web资源使用现有launcher验收，不宣称重编exe或通用desktop smoke全绿。仅精确清理本次临时Host/profile；旧保护PID及此前工具拒绝清理的目录不触碰。

提交前遇到零字节 `.git/index.lock`：时间停在15:40:06 UTC，16:02 UTC多次检查无Git进程、独占打开证明未被占用、暂存区为空。再次确认路径与状态后，仅将该遗留锁移动保留为 `.git/index.lock.settings-content-20260926-160209.bak`，没有删除索引、改写历史或清理外部改动。

## 剩余总体目标

设置内容恢复不是整个设置页或全桌面体验完成声明。原位真实连接测试、账户登录、扩展安装管理仍需要对应能力闭环；图片缩略图／画廊是下一独立单元，见已提交的[原组件与安全读取审计](desktop-image-viewer-entry-audit.md)。总体Goal继续保持未完成。
