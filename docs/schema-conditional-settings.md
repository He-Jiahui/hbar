# Schema 设置的条件显示

`SettingsDescription.fields[].visibleWhen` 定义只影响展示的条件。宿主使用稳定 Schema path 和类型化比较值，不传表达式、函数或脚本。

```ts
visibleWhen: {
  all: [
    {
      path: [{ kind: 'field', name: 'chatDatabase.scheduleEnabled' }],
      equals: true,
    },
    {
      path: [{ kind: 'field', name: 'chatDatabase.scheduleKind' }],
      equals: 'weekly',
    },
  ],
}
```

所有比较同时匹配时显示字段。支持布尔、字符串、数字、null 和有界数组的严格相等比较；数组按顺序比较。每个字段最多 16 个比较，依赖必须存在、类型匹配且不重复，不能自引用或形成循环。

runtime 编译时将 path 转成稳定字段名；`HbarSchemaForm` 按当前 `FormState.draft` 计算，并同时应用调用方的 `fieldNames` 筛选。依赖缺失或存在无效 raw 输入时隐藏，避免沿用旧的解析值错误显示。标题、说明、来源、控件、错误和操作按钮属于同一行，隐藏时整行移除，正常 flex 流随之收缩。

显示条件不更改保存契约。隐藏字段的值、草稿、raw 输入和继承关系都保留；重新显示时恢复原值。隐藏不等于授权或跳过字段校验，Host 仍执行完整设置校验和 revision/CAS。

聊天数据库的执行周期、执行时间和时区依赖定时触发；星期选择还依赖每周周期。容量阈值和容量优先选项依赖容量触发开关。

## 时间与星期选择

Schema 的 `TimePicker` 将既有整数字段 `scheduleHour`（0–23）、`scheduleMinute`（0–59）和字符串 `timezone` 作为一个编辑项呈现。描述的 `time.minutePath`、`time.timezonePath` 声明其归属，编译时验证字段存在、类型和范围、作用域及唯一归属。分钟和时区不再各自渲染输入行。

时间控件复用 Lumen input 与浏览器原生 `type="time"` 选择器；点击时打开原生选择界面，同时保留原生键盘和触摸行为。按分钟配置，不要求用户分别输入小时和分钟。每天模式仅显示时间；每周模式显示时间和七个星期按钮，至少保留一天，窄屏采用正常 flex 换行。

定时从关闭变为开启，或用户修改时间时，自动记录当前设备的 IANA 时区。界面显示实际保存/草稿中的执行时区，无须手动选择；既有已保存规则在单纯浏览时保留原时区，避免悄悄改变执行时间。时区随设置保存，Host 调度继续使用该规则的时区和原有 DST 计算。

`settingsForm.batch` 对一个时间编辑项最多 8 个字段操作执行同一草稿事务：set、reset 或 inherit。先在局部状态上全部验证，再发布完整状态；失败不留下部分修改。时间的恢复已保存值、恢复继承及错误展示涵盖小时、分钟和时区三个字段，仍由现有 Settings revision/CAS 保存。无需存储迁移。

原数字解析分支只接收字符串，实际 number 会被误判为无效；`3d5e9afd` 的提交差异及真实页面复现确认了原因。已单独修正为接受类型化数字，继续校验范围并保留无效输入前的有效草稿。

## 验证记录

2026-10-10 完成条件显示、时间选择与星期选择的测试。相关 Schema、分层设置、数据库规则和调度单元/组件回归共 56 个通过；真实临时 Host 中英文用例验证 1440/768/320 布局、定时显隐、每天/每周切换、保存与刷新、自动时区、星期最少一项和项目恢复继承。两种设备时区分别为 Asia/Shanghai 与 America/Los_Angeles。

原生时间弹层由浏览器/操作系统绘制，截图记录应用表单；自动化通过点击打开原生选择器，再对其标准输入值与提交结果进行验证。没有把仅检查 input 类型写成已验证所有平台的原生弹层样式。

最终 4 个真实 Host 浏览器用例通过，包含新增的中英文选择器流程，以及原有数据库设置保存、分页和清理回归。桌面、平板和窄屏截图已人工检查。

范围严格 TypeScript、ESLint、格式、内容/图标/流式布局规范和 Web 构建通过。全仓类型检查仍有 96 条旧诊断，包括 CLI PluginInfo、旧 stores 引用和旧测试夹具。全仓 lint 在旧页面批次已经报错，确认不涉及本次范围后中止，未宣称全仓 lint 完成或通过。本次未运行原生 Desktop 打包。截图和日志保存于忽略目录 `artifacts/schema-schedule/`、`.dev/schema-schedule/`。

验证：`tests/schema-visibility.test.tsx` 覆盖非默认中文、整行移除、草稿恢复、缺失/无效依赖以及协议和编译拒绝；相关 schema、runtime 和数据库设置回归共 25 个测试通过。范围严格 TypeScript、ESLint、内容/图标规范、格式和 Web 构建通过。

界面继续使用 settings-form 的分节表单结构和 forms 的就近校验：[设置结构参考](https://pro.reactbits.dev/docs/app-ui/settings-form)、[表单交互参考](https://pro.reactbits.dev/docs/app-ui/forms)。本次增加行为契约，沿用现有 Lumen 主题与内容布局。
