# 桌面迁移验收：统一公开 Lumen 解析

2026-10-01，隔离 `codex/session-launch-target` 的 `059c24c2` 后续质量单元。
目的是真正恢复默认严格类型验收，不改变已验证的 UI，不整合主目录，不新增产品功能。

## 红证据和原因

- 原 `bun run typecheck` exit 1：根测试、脚本和 preview 无法解析 `@lumen/app-ui`
  及 `/catalog`，产生 312 行未解析模块和派生类型错误。原临时诊断配置能通过，
  但不能作为默认命令已通过的证明。
- 新回归用 TypeScript 的真实 `resolveModuleName`，从根测试／preview／E2E 的
  实际存在文件解析三个入口；修改前 public resolution 为 undefined，两条红测失败。
- 只读 `packages/lumen-app-ui/package.json` 已公开 `.`、`./catalog`、
  `./variants`。Web/package 自身的依赖解析可用，根目录未链接同名依赖；不是
  fixture 应被排除或需要消除 strict 的证据。
- 修复根解析后，直接 Bun React 测试仍拾取上游 `hbar-ui/tsconfig.json` 的 MUI
  vendored aliases，实际报缺 `prop-types`／`react-is`。同一组加
  `--tsconfig-override ./tsconfig.json` 后通过，不需要安装该上游 monorepo 的依赖。
  这是当前机器的实测对比，不外推为所有 Bun 版本的解析规则。

历史检查：`a1994593` 已建立完整 hbar／Lumen lint 与 root input coverage。
本次保留这一范围，不从上游 MUI monorepo 增加未经要求的 workspace，也不修改共享源码。

## 修复与边界

根 `tsconfig.json` 仅增加精确三个公共 TypeScript entry 的 paths，直接对应原 manifest
导出的源入口。没有 `@lumen/app-ui/*` wildcard，不放开私有导入，`/src/button` 仍无法
解析；样式仍由现有 Web bundler 负责。没有编造声明文件、any shim、skip 新目录或
修改 strict/noUnchecked/exactOptional/noUnused 等选项。

根 `package.json` 的既有 `test`／`check` 在 Bun test 处显式选择根配置，native build、
lint、typecheck 步骤、顺序与 20 秒单测试超时都保留。没有运行本轮未获确认的 native
build，仅执行相关测试的同一 Bun suffix。新回归检查公开 manifest、真实 importer、
私有路径拒绝、严格选项、代表性 root input 与维护命令内容。

## 验证记录

- 默认 `bun run typecheck` 修复后通过；最终回归使用标准根命令，不再用诊断 aliases。
- parser、React 文件引用、消息工具、Run 状态、解析与 lint 范围组合：46 tests /
  371 assertions 通过；在新增 importer 存在性断言后，配置／lint 范围四测试独立
  通过 103 assertions。两组不累计为更多独立用例。
- 新测试类型感知 ESLint 零警告、相关格式检查通过。
- 完整 `bun run lint` 已实际运行并以 1902 errors / 0 warnings 失败，输出集中在
  共享 Lumen 的五个 Vitest 测试文件：conversation-viewport、file-workspace、
  image-gallery、session-composer、sidebar-resize。它们导入本工作树未链接的
  `vitest` 与 `@mui/internal-test-utils`，类型感知规则据此报告 unresolved unsafe。
  没有为变绿排除它们、降低规则、伪造声明或安装上游依赖；不宣称全仓 lint 通过。
  后续 `tsc -p tsconfig.eslint.json` 也失败，确认同五文件未解析模块，另有 unused
  React、可能 undefined 的 gallery item、unknown React child 等实际类型问题；
  不能把它们全部归因于模块解析，仍未修改共享测试。
- 生产 Web build 3411 modules。JS `index-D2kO73SQ.js` 与 CSS `index-DqultGzR.css`
  分别与前次实渲资产 SHA256 完全相同：
  `51CDCD3258219C0A4D375EBC142FA7B45B05AABB93409CA6D0FB14A9AA84F08A`、
  `57190B7EEF89426E7E1F27556DC463605EC8D8B9FFB05611967DBC943B17C4E1`。
  因此本配置单元没有重做逐按钮／视口截图矩阵。
- 初次格式检查发现 tsconfig 的排版不匹配，已用项目 Prettier 修正后重查。
  首次直接 Bun React 测试 3 个加载错误已如上保留，不将该轮记作通过。

完整 `bun run check`、完整业务 test、原生启动／打包／验收未运行，不凭单独类型与
相关测试宣布桌面目标完成。主目录和共享 Lumen 未修改，未安装依赖、未合并或重启。
整合与后续产品范围仍见[当前交互地图](desktop-interaction-map-current.md)。
