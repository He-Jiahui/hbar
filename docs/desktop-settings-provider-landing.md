# 全局设置：服务商首落点与分类记忆

cc-haha 已发布的 `D:/Git/cc-haha/docs/images/app/zh-CN/settings-general.webp` 显示“服务商”在“通用”之上，但截图当前选中“通用”，不能仅凭图片证明首次落点。其 `desktop/src/pages/Settings.tsx` 导航顺序及 `desktop/src/stores/uiStore.ts` 的 `getStoredSettingsTab()` 共同证明：无记忆时默认服务商，随后使用本机保存的上次类别。hbar 修改前的 Host 设置描述先列模型、会话、服务商，Web 再把外观置首；首次全局设置实际落模型，已有的供应商管理需要继续寻找。

Web 现在以独立的展示顺序列出服务商、外观、模型、会话默认值、扩展和诊断；不修改 Host Schema 的字段顺序或项目/会话作用域。首次全局齿轮打开服务商，主区即显示真实供应商列表与“添加供应商”。显式选分类时将其 ID 保存为设备本地偏好，返回或刷新后恢复；无效旧值回退服务商，命令传入的未注册 ID 不会成为记忆落点，存储不可用时本次运行仍保留选择。项目/会话设置仍以其原目标和模型分类进入，原表单草稿不迁移或丢弃。分类及图标由 Web 宿主提供，React 组件只排序现有类型化条目。

验证：`bun test tests/settings-workspace.test.tsx` **11/11、175 次断言**，根 TypeScript、定向严格 ESLint、Prettier、内容与图标 guard、隔离生产构建通过。真实临时 Host 的 `e2e/settings-provider-landing.spec.ts` **中英 2/2**，覆盖无效本地类别、全局首次落点、添加入口、桌面导航与 320px 选择顺序、键盘焦点、返回/刷新后保留外观、会话齿轮仍落其模型与会话作用域；截图 `artifacts/desktop-experience/provider-landing-{en-US,zh-CN}-{1440,320}.png` 已人工查看。

Windows x64 release 应用与 NSIS 包构建成功；隔离数据目录的原生 WebView2 点击全局设置，确认服务商第一且已选、添加入口可见，截图 `artifacts/desktop-experience/native-provider-landing.png` 已人工查看。首次原生 smoke 在释放临时 WebView profile 时遇到 `EBUSY`，其检查结果被清理异常遮盖，未计为通过；改为分别报告清理错误并用新端口重跑后通过。该原生 smoke 未尝试真实凭据写入、供应商编辑或多窗口同步；供应商编辑功能由原有专用测试负责。没有安装或重启用户正在使用的窗口。
