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

验证：`tests/schema-visibility.test.tsx` 覆盖非默认中文、整行移除、草稿恢复、缺失/无效依赖以及协议和编译拒绝；相关 schema、runtime 和数据库设置回归共 25 个测试通过。范围严格 TypeScript、ESLint、内容/图标规范、格式和 Web 构建通过。

界面继续使用 settings-form 的分节表单结构和 forms 的就近校验：[设置结构参考](https://pro.reactbits.dev/docs/app-ui/settings-form)、[表单交互参考](https://pro.reactbits.dev/docs/app-ui/forms)。本次增加行为契约，沿用现有 Lumen 主题与内容布局。
