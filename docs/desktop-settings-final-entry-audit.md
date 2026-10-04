# 设置入口最终轮审计：真实能力、返回路径与读取恢复

2026-09-26。只读产品审计；hbar 基线 `a62f098`（包含 `0ee3099` 多文件预览），参考 cc-haha 基线 `e28d0a65`。本轮未改产品、测试、共享构建目录或 Git 索引。结论不是“全部设置已等同参考”。

## 结论与优先级

本轮最高影响、且已有公开能力可直接支撑的设置缺口是：**模型／思考等级动态选项读取失败后，没有保留未保存草稿的就近重试入口**。已用当前生产 App、真实临时 demo Host、英文／中文、1440／320 复现。现成 `settingsForm.refreshContent` 可以重新读取内容，不需要新增 Host 写入或权限。

其次是同一位置的恢复解释：未选模型显示技术原因 `missing_model`，真正读取失败显示 `READ_FAILED`；两者都没有明确的下一步。应区分“先选择模型”“当前模型已不可用”“读取失败，可重试”，不能把不可用一概显示为故障或伪造可选模型。

导航代理已另行实证的项目侧栏调宽缺口影响整个工作台，覆盖面比本设置故障路径更广；本报告不要求为了这一设置修补阻挡侧栏调宽。供应商连接测试、OAuth 登录、插件市场／更新／卸载等缺少本轮核验到的等价公开闭环，不应先做没有行为的按钮。

## 证据等级和本轮执行

- **发布画面**：直接查看 `D:/Git/cc-haha/docs/images/app/zh-CN/settings-general.webp`、`settings-provider-add.webp`、`settings-usage.webp`。它们证明已发布桌面层级和入口位置；不能证明当前网络错误、键盘或窄屏行为。
- **参考原组件 fixture**：复用既有 `D:/Git/hbar/artifacts/desktop-entry-matrix/extensions/` 的原组件截图与 `capture.ts`／`vite.config.ts`，本轮查看 `reference-plugin-detail-zh-CN-320.png`。这是 cc 原组件、stores、样式的隔离渲染，但 GET 是 fixture，外网及写请求被阻断；不是插件安装／启停的真实后端成功证据。本轮没有重启该 harness。
- **本轮 hbar 实际生产 UI**：隔离 build `D:/Git/hbar/artifacts/desktop-final-entry-audit/settings/web`，资源 `index-fbz8IPGL.js`；Edge headless、actual App、真实临时 demo Host。两语言 × 八分类 × 两宽度共32张分类截图，另4张供应商新增弹窗。没有付费 provider、Run 或供应商配置写入。
- **受控故障**：只阻断一次 `schema.content.query / settings.getThinkingLevels` 读，其他通信接真实 Host。该故障验证 UI 恢复路径，不宣称 Host 自发产生此故障。
- 新证据和脚本全部在 `D:/Git/hbar/artifacts/desktop-final-entry-audit/settings/`：`capture.ts`、`capture-report.json`、`model-options-red.ts`、`model-options-red-report.json`。最终普通捕获 `captured`；故障路径 `reproduced`。浏览器 pageerror 两语言均为空，32个分类页面均无整页横向溢出。

参考图名里的 `settings-general` 不等于 hbar 也实现了参考所有通用设置。hbar 的实时外观预览是已有额外能力，不能称参考图中有同一预览。

## 有限完整入口矩阵

以下“已对齐”指动作层级／返回语义已存在，不指像素相同。“既有验证”不冒充本轮重跑。

| 入口／位置                                                     | cc-haha 的动作与层级                                                                                                             | 当前 hbar 实际入口、返回与恢复                                                                                                            | 分类                                                           |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 全局 Settings                                                  | Sidebar 底部齿轮，打开单独 Settings tab；分类 store 保持上次项                                                                   | Sidebar 底部设置；全局冷入口 Providers，记忆分类；页面左上 Back 回原会话／工具上下文。1440分类侧栏，320分类 select                        | 已对齐；页面而非独立 Settings tab 是有意适配                   |
| 项目／会话设置                                                 | 全局设置 rail 与会话运行选择分工                                                                                                 | 项目行菜单进入 pinned workspace；会话工具进入该会话模型组；scope 值携带原目标，不借当前另一会话                                           | 已对齐，作用域是 hbar 的额外真实契约                           |
| 分类顺序                                                       | Providers、General、H5、IM、Terminal、MCP、Agents、Skills、Memory、Plugins、Pets、Computer Use、Usage、Trace、Diagnostics、About | Providers、General、Appearance、Model、Session defaults、Extensions and skills、Usage、Diagnostics                                        | 有意适配，仅列可落地分类，不照搬占位页                         |
| Provider 列表标题行                                            | 右侧导入／新增；条目含协议／模型／当前默认、测试／编辑／删除；可排序                                                             | 新增与刷新在列表标题右侧；条目打开编辑，更多菜单删除；显示协议／供应商默认模型／模型数／凭据存在状态                                      | 基础 CRUD 入口已对齐；导入、排序、账户登录、真实连接测试不等价 |
| 新增／编辑 Provider                                            | 中央模态，预设→连接字段→模型→高级；底部取消／添加或保存，右上 X                                                                  | 原位模态，预设搜索→连接基础→模型与高级披露；底部检查配置／取消／保存，右上 X；320正文滚动、底部操作可达                                   | 已对齐。检查配置仅本地 schema 校验，不是参考“测试连接”         |
| Provider 取消                                                  | 返回原列表；新增模态卸载清局部状态                                                                                               | dirty 二次确认；取消清草稿／敏感值并回原 editor 来源；submitting／unknown 不可丢弃。既有 `provider-progressive-edit` 验证，不在本轮重发写 | 已对齐且保守适配                                               |
| Provider 未知结果                                              | 原实现保存异常提示／留模态                                                                                                       | 保留原提交身份、读回核对；非空新 API key 不能仅凭 `hasKey` 判定成功，不能自动关闭或重放                                                   | 有意安全适配；完整密钥恢复缺精确 receipt                       |
| 模型选择                                                       | Provider modal 内模型映射／拉取；会话 composer 就地选择                                                                          | Settings Model 有真实 options callback、层级 scope、继承说明、下一 Run 生效；composer 的即时选择另有入口                                  | 已对齐能力边界，不把全局默认误当当前会话写入                   |
| 模型／思考选项读失败                                           | Provider 拉取模型按钮仍在原模型区域，可再次拉取；错误就近                                                                        | schema field 只显示错误；有未保存模型选择时整表 Refresh disabled，切组回来也不重读                                                        | **真实 P1 缺口：当前公开只读重试没有 UI 入口**                 |
| 未选模型时思考等级                                             | 模型区域上下文说明                                                                                                               | 当前显示 `选项当前不可用：missing_model`，仍可打开空列表                                                                                  | **真实 P2 表达缺口**，可与 P1 同一闭环收口                     |
| 模型／默认预算取消与恢复                                       | 参考多数直接选择立即生效，Provider 有显式取消                                                                                    | 显式 Save、字段“恢复已保存值”、非全局“恢复继承”；Back／切分类保留 schema 草稿；dirty 禁整表刷新避免覆盖                                   | 有意 CAS 适配，不应改即选即存或用 Refresh 丢草稿               |
| Session defaults                                               | 参考 General 的各运行默认项                                                                                                      | 只有真实支持的默认 Token 预算；global/workspace 可写，session 只读并说明                                                                  | 有意适配；未伪造参考所有运行偏好                               |
| General 显示语言                                               | 直接可见语言项，原位应用                                                                                                         | 跟随环境／English／简体中文三项，radio 键盘；client scope，原位保存与读写失败重试。已交付 runtime 不因 locale 重建                        | 已对齐；其余三套翻译和回复语言未支持                           |
| Appearance 主题                                                | 参考 General 内 system 开关与主题选项即选即存                                                                                    | 独立 Appearance；System／Light／Dark直接可见；S/M/L尺寸、实时预览；显式保存、舍弃、重置                                                   | 有意适配。只迁移发现方式，不假装六种 palette 已支持            |
| Appearance 返回／失败                                          | 参考即时偏好，不承担四键 CAS 草稿                                                                                                | per-owner 草稿跨分类／Back保留；pending Host不可保存；restoreError 只读恢复；部分应用／unknown有明确核对／继续或舍弃路径                  | 已有独立闭环；本轮只视觉检查正常态，不重验所有故障             |
| Usage                                                          | Settings 原位统计→时间模式→图表；头像／资料／连续天数属于参考事实                                                                | Settings 原位 Host global `usage.query`；近1h／24h／7d／30d、刷新、真实总量、桶与模型/项目细目；空态不跳 Status                           | 已对齐层级，时间窗口有意适配；不伪造头像、连续天数或费用       |
| Extensions 列表                                                | 独立 Plugins 分类，搜索、详情、批量等入口；Skills 另分类                                                                         | 合并扩展与技能、过滤、计数／分页；插件行进入真实详情；列表顶部刷新与系统命令链接                                                          | 合并分类为有意适配；没有假市场／安装按钮                       |
| Plugin 详情                                                    | 返回列表→摘要→启停／更新／应用／卸载→贡献                                                                                        | Back→状态／作用域→就近启停或 required原因、只读重读→公开贡献；保留原过滤／页码／行焦点。unknown不假确认                                   | 详情与启停已对齐；安装更新卸载不支持，不声称全部等价           |
| Skill 列表／详情                                               | 行进入 SKILL.md / 文件，独立市场安装                                                                                             | `skill.list` 仅显示公开发现信息；没有真实正文／编辑／执行闭环                                                                             | 缺 Host 归属／内容与动作契约，不应以泛化命令搜索伪装详情       |
| Diagnostics                                                    | 原位诊断，参考还含更广修复／日志流程                                                                                             | 独立分类 `system.diagnose`，Host、运行、存储事实；原位刷新／失败重试，明确不会清理数据                                                    | 只读部分已对齐；日志、清理、重建不可虚构                       |
| H5、IM、Terminal、MCP、Agents、Memory、Pets、Trace、About 设置 | 参考各自业务页面                                                                                                                 | hbar 部分能力存在于执行工具／工作台，但没有本审计核实的等价配置、生命周期和权限合同                                                       | 缺对应产品／Host 契约；不等于模型工具可用就能照搬设置页        |

## P1：真实复现与最小下一单元

路径：Global Settings → Model → 选 `Local fixture · fixture`，对依赖的思考选项读注入一次失败。

两语言实测一致：

1. 初始模型未设，思考选项为 `missing_model`；模型候选来自真实 Host。
2. 选择模型后保留 **1项未保存更改**，思考字段显示 `READ_FAILED`。
3. Footer Refresh disabled；Save enabled。页面内没有“重试选项”按钮。`Restore saved value` 有效但会舍弃该字段草稿，不是重试。
4. 打开失败字段下拉，再 Escape；Appearance → Model 往返；读取计数不再增加，错误仍在。
5. 每语言思考读取共2次（初次无模型 + 唯一失败读），注入失败1次，`settings.apply` 写入0次。未发送 Run。

强视觉证据：

- `D:/Git/hbar/artifacts/desktop-final-entry-audit/settings/en-US-model-options-read-failure-1440.png`
- `D:/Git/hbar/artifacts/desktop-final-entry-audit/settings/zh-CN-model-options-read-failure-320.png`
- 对应 `model-options-red-report.json` 含可见按钮、disabled状态、原 formId、计数、无写记录。

现有接口与根因：

- `packages/contracts/src/commands/settings-editor.ts:44` 已公开 `settingsForm.refreshContent({formId})`。
- `packages/app-runtime/src/settings-forms.ts:303,608` 已支持绕过内容缓存重新读取，不调用 `settings.apply`，不会全表 rebase。
- `packages/app-react/src/lumen-settings-workspace.tsx` 的 `runFormCommand` 只有 refresh/submit/reconcile；`canRefresh` 要求 `dirtyCount===0`。这个保护不能删掉。
- `packages/schema-react/src/form.tsx:116` 仅输出 unavailable/error；`packages/app-react/src/lumen-schema-components.tsx:130` 的 ComboBox 只处理打开、查询、选择，没有重试 action。
- `apps/web/src/shell-copy.ts:561` 将 reason code直接拼入可见文案。

最小交付应在本表单失败字段附近增加 typed 只读“重试选项”，捕获原 formId／field／scope；复用 `refreshContent`，不把 dirty 状态强行清空，也不先保存模型选择。现有命令重读该表单全部动态选项，而非仅一个 field；UI文案应如实表述。若改成 field级合同，需独立同步 schema/runtime/tests，不在 View 私下访问 resolver。

验收：原草稿／revision／unsets与原 panel target保持；恢复读取成功后 options可用；pending防连点；切作用域／分类／关闭后迟到回复不覆盖另一表单；断线时说明并禁读，重连显式重试；unknown submit不冒充可编辑；无 `settings.apply`；中英1440/320和键盘 focus可继续。没有模型与模型已撤销分别说明，不能给 unavailable 原因套网络重试。

## 视觉核对与精确范围

本轮截图前缀均在 `D:/Git/hbar/artifacts/desktop-final-entry-audit/settings/`：`{en-US,zh-CN}-{providers,general,appearance,model,session,extensions,usage,diagnostics}-{1440,320}.png`，以及 `*-provider-add-*.png`。

人工查看了两个宽度的供应商、General、Appearance、Model、Session defaults、Extensions、Usage、Diagnostics代表图与故障图。320下分类 select、Back、scope和正文保持 normal flow；长页可纵向滚动，不因截图未含底部而判不可达。Provider新增模态底部取消／保存处于同一个可见操作区。hbar 的 Lumen装饰、文字密度和参考纸感仍不同，本报告不把“无横溢”写成像素复刻完成。

关键参考源：

- `D:/Git/cc-haha/desktop/src/components/layout/Sidebar.tsx:1461-1475`：底部设置打开稳定 Settings tab。
- `D:/Git/cc-haha/desktop/src/pages/Settings.tsx:60-113`：分类 rail与对应页面；选中分类滚入视野；详情代替列表而不重复列表介绍。
- `D:/Git/cc-haha/desktop/src/pages/settings/ProviderSettings.tsx:228,373,1352,1538,1769,1936`：新增、条目动作、模型拉取、取消保存、就近拉取及测试。
- `D:/Git/cc-haha/desktop/src/pages/settings/GeneralSettings.tsx:675-755`：主题与显示语言直接选择。
- `D:/Git/cc-haha/desktop/src/pages/ActivitySettings.tsx:820,973`：摘要与时间模式；资料编辑是该产品额外真实合同。
- `D:/Git/cc-haha/desktop/src/components/plugins/PluginDetail.tsx`：返回、作用域摘要、操作与贡献详情。

当前 hbar 入口事实源：`apps/web/src/settings-group-presentation.ts`、`apps/web/src/App.tsx:338-380`、`packages/app-react/src/lumen-workspace-shell.tsx:466,788`、`lumen-settings-workspace.tsx`、`provider-settings.tsx`、`lumen-provider-editor.tsx`、`extension-workspace.tsx`、`extension-plugin-detail.tsx`、`settings-usage.tsx`、`system-diagnostics.tsx`。已有专项证据分别见 `desktop-device-language.md`、`desktop-appearance-draft-recovery.md`、`desktop-settings-provider-landing.md`、`desktop-settings-usage.md`、`desktop-extension-plugin-action.md`、`desktop-startup-settings-handoff.md`，本轮未重跑其中写入／原生全部矩阵。

## 运行、失败与清理记录

隔离 build通过，保留既有 >1500kB chunk warning。首轮曾用 UI45115／Host45113，随后协调改为 UI45115／Host45116；最后只读检查两端口均无 listener。旧保护PID9572/48668完全未操作。

初次capture模块路径错误未启动服务；修正后第一轮到320时未等侧栏响应式切换，locator超时。第二轮试图在resize自动收起期间点击Hide，控件已隐藏而超时。最终等过响应式状态变化后正常完成32分类＋4模态捕获。两次失败报告保留为 `first-capture-report.json`、`second-capture-report.json`，不是产品缺陷证据。

Windows的被信号终止 child可出现 `exitCode===null`、`signalCode!==null`。首轮脚本只查exitCode导致错误报告仍活；已查PID40444不存在／端口不监听。其唯一临时目录 `C:/Users/HeJiahui/AppData/Local/Temp/hbar-final-settings-pKDK1c` 的精确清理命令被工具政策阻断，因此没有换工具绕过；该 fixture保留供主线安全核对，无用户数据。

成功capture的 owned Host22436已退出，目录 `hbar-final-settings-JW6848` 已按本轮生成的精确root清理；`cleanup.json` 的 `hostExited:false` 仍沿用了旧exitCode表达式，不代表进程仍存在（之后CIM和端口检查均为空）。故障复现 owned Host11756及目录 `hbar-final-settings-red-akwErX` 已清理，见 `model-options-cleanup.json`。没有枚举终止用户进程，也没有修改共享dist。

本轮为审计与受控红证据，不运行或宣称 root lint／typecheck／全测试／原生验收通过，不提交修补。下一设置单元应先将上述实际红路径写为回归，再实现就近只读恢复。
