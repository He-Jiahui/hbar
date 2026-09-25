import type { HbarAppUiAppDialogContent } from '../../packages/hbar-app-ui/src/index'

const scroll = { kind: 'pane-scroll', expectedMaximum: 80 } as const
const grown = { kind: 'content-grown', expectedMaximum: 16 } as const

export const HBAR_APP_UI_APP_DIALOG_FIXTURES: HbarAppUiAppDialogContent = {
  plan: {
    labels: {
      trigger: 'Change plan',
      title: 'Apply plan change',
      detail: 'Your workspace moves to the Scale plan at the next renewal on Jul 1. Nothing is charged today.',
      close: 'Close dialog',
      cancel: 'Cancel',
      confirm: 'Apply change',
      transition: '→',
      confirmationTitle: 'Plan change scheduled',
      confirmationDetail: 'Scale takes effect Jul 1. You can undo it until then.',
      empty: 'No plan changes',
    },
    rows: [
      { id: 'plan', label: 'Plan', from: 'Team', to: 'Scale' },
      { id: 'seats', label: 'Seats', from: '24', to: '40' },
      { id: 'total', label: 'Monthly total', from: '$1,440.00', to: '$2,600.00' },
      { id: 'support', label: 'Support', from: 'Business hours', to: '24/7 priority' },
      { id: 'retention', label: 'Audit log retention', from: '30 days', to: '1 year' },
    ],
    listStrategy: scroll,
  },
  deleteProject: {
    labels: {
      trigger: 'Delete project',
      title: 'Delete atlas-production?',
      detail: "This permanently removes the project and everything in it. It can't be undone.",
      close: 'Close dialog',
      confirmation: (name) => `Type ${name} to confirm`,
      confirmationBefore: 'Type ',
      confirmationAfter: ' to confirm',
      placeholder: 'atlas-production',
      cancel: 'Cancel',
      confirm: 'Delete project',
      empty: 'No project metrics',
      successTitle: 'Project deleted',
      successDetail: 'atlas-production and its 1,204 deployments were removed.',
    },
    projectName: 'atlas-production',
    metrics: [
      { id: 'deployments', value: '1,204', label: 'Deployments' },
      { id: 'variables', value: '38', label: 'Environment variables' },
      { id: 'domains', value: '3', label: 'Custom domains' },
      { id: 'members', value: '11', label: 'Team members' },
    ],
    listStrategy: scroll,
  },
  invite: {
    labels: {
      trigger: 'Invite member',
      title: 'Invite a member',
      detail: "They'll get an email invite to join the Northwind workspace.",
      close: 'Close dialog',
      name: 'Full name',
      namePlaceholder: 'Jordan Ellis',
      email: 'Work email',
      emailPlaceholder: 'name@northwind.io',
      emailHint: 'Invites expire after 7 days.',
      role: 'Role',
      roleHint: 'Editors can change content but not billing.',
      cancel: 'Cancel',
      confirm: 'Send invite',
      nameError: "Enter the member's name.",
      emailError: 'Enter a valid email, like name@northwind.io.',
      successTitle: 'Invite sent',
      successDetail: "They'll appear as pending until they accept.",
    },
    roles: [
      { id: 'Admin', label: 'Admin' },
      { id: 'Editor', label: 'Editor' },
      { id: 'Viewer', label: 'Viewer' },
      { id: 'Billing', label: 'Billing' },
    ],
    initialRoleId: 'Editor',
  },
  wizard: {
    labels: {
      trigger: 'New workspace',
      count: (step, total) => `Step ${step} of ${total}`,
      close: 'Close dialog',
      name: 'Workspace name',
      url: 'Workspace URL',
      urlHint: 'You can change this later in settings.',
      environment: 'Primary region',
      environmentHint: 'Choose where your workspace data is stored.',
      reviewName: 'Workspace',
      reviewUrl: 'URL',
      cancel: 'Cancel',
      next: 'Continue',
      confirm: 'Create workspace',
    },
    steps: [
      { id: 'workspace', label: 'Workspace' },
      { id: 'region', label: 'Region' },
      { id: 'team', label: 'Team' },
    ],
    workspaceName: 'Northwind',
    workspacePrefix: 'northwind.app/',
    workspaceSlug: 'northwind',
    environments: [
      { id: 'production', label: 'Production' },
      { id: 'staging', label: 'Staging' },
      { id: 'development', label: 'Development' },
    ],
    initialEnvironmentId: 'production',
    reference: {
      labels: {
        namePlaceholder: 'Acme',
        region: 'Primary region',
        regionHint: 'Choose where your workspace data is stored.',
        team: 'Invite teammates',
        teamPlaceholder: 'priya@northwind.io, marcus@northwind.io',
        teamHint: 'Separate addresses with a comma. You can skip this and invite people later.',
        reviewRegion: 'Region',
        back: 'Back',
        emptyRegions: 'No regions available',
        successTitle: 'Workspace created',
        successDetail: (slug) => `Redirecting you to ${slug}.`,
      },
      steps: [
        { id: 'workspace', label: 'Workspace' },
        { id: 'region', label: 'Region' },
        { id: 'team', label: 'Team' },
      ],
      regions: [
        { id: 'iad1', label: 'United States (iad1)' },
        { id: 'fra1', label: 'Europe (fra1)' },
        { id: 'syd1', label: 'Asia Pacific (syd1)' },
        { id: 'gru1', label: 'South America (gru1)' },
      ],
      initialRegionId: 'iad1',
      slugForName: (name) => name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'workspace',
      listStrategy: grown,
    },
  },
  alert: {
    labels: {
      trigger: 'Edit alert rule',
      title: 'Edit alert rule',
      close: 'Close drawer',
      name: 'Rule name',
      deliver: 'Deliver to',
      threshold: 'Trigger threshold',
      note: 'Note',
      enabled: 'Rule enabled',
      enabledHint: 'Turn off to pause without deleting.',
      toggle: 'Rule enabled',
      cancel: 'Cancel',
      save: 'Save changes',
    },
    ruleName: 'Error rate spike',
    channels: [
      { id: 'Email', label: 'Email' },
      { id: 'Slack', label: 'Slack' },
      { id: 'PagerDuty', label: 'PagerDuty' },
      { id: 'Webhook', label: 'Webhook' },
    ],
    initialChannelId: 'Slack',
    threshold: '5% / 5 min',
    note: 'Page the on-call engineer when errors climb.',
    initialEnabled: true,
    reference: {
      labels: {
        discardTitle: 'Discard your changes?',
        discardDetail: "You've edited this rule. Closing now loses what you changed.",
        keepEditing: 'Keep editing',
        discard: 'Discard changes',
        savedTitle: 'Rule updated',
        savedDetail: 'Changes apply to the next alert.',
        emptyChannels: 'No delivery channels available',
        saving: 'Saving changes…',
        saveError: 'Could not save this rule. Try again.',
      },
      listStrategy: { kind: 'content-grown', expectedMaximum: 16 },
    },
  },
  evidence: {
    labels: {
      trigger: 'View evidence details',
      title: 'SOC 2 Type II report',
      close: 'Close evidence details',
      controls: 'Controls covered',
      history: 'History',
      archive: 'Archive',
      download: 'Download',
      emptyDetails: 'No evidence details',
      emptyControls: 'No controls',
      emptyHistory: 'No history',
    },
    status: 'Current',
    reference: 'SOC2-2024',
    description:
      'Independent audit of security, availability, and confidentiality controls for the 2024 reporting period.',
    details: [
      { id: 'owner', label: 'Owner', value: 'Priya Raman' },
      { id: 'file', label: 'File', value: 'PDF · 4.2 MB' },
      { id: 'updated', label: 'Updated', value: 'Jun 18, 2024' },
      { id: 'source', label: 'Source', value: 'Vanta' },
      { id: 'retention', label: 'Retention', value: '7 years' },
    ],
    controls: [
      { id: 'ac2', code: 'AC-2', label: 'Account management' },
      { id: 'cc61', code: 'CC6.1', label: 'Logical access controls' },
      { id: 'cc72', code: 'CC7.2', label: 'Security monitoring' },
      { id: 'a12', code: 'A1.2', label: 'Availability commitments' },
    ],
    history: [{ id: 'upload', time: 'Jun 18, 2024', label: 'Report uploaded by Priya Raman' }],
    listStrategy: scroll,
  },
  menu: {
    labels: {
      trigger: 'Report actions',
      menu: 'Report actions',
      submenu: (label) => `${label} submenu`,
      empty: 'No actions',
    },
    items: [
      { id: 'rename', label: 'Rename report', shortcut: '⌘R' },
      { id: 'duplicate', label: 'Duplicate', shortcut: '⌘D' },
      { id: 'export', label: 'Export as', submenu: true, separatorBefore: true },
      { id: 'copy', label: 'Copy link', shortcut: '⌘⇧C' },
      { id: 'archive', label: 'Move to archive', separatorBefore: true },
      { id: 'delete', label: 'Delete report', danger: true },
    ],
    listStrategy: grown,
  },
}

export function appDialogFixture(name: string | null): HbarAppUiAppDialogContent {
  if (name === 'localized') return createHbarAppUiAppDialogLocalizedFixtures()
  if (name === 'alert-save-failure') {
    const alert = HBAR_APP_UI_APP_DIALOG_FIXTURES.alert!
    let attempts = 0
    return {
      ...HBAR_APP_UI_APP_DIALOG_FIXTURES,
      alert: {
        ...alert,
        reference: {
          ...alert.reference!,
          onSave: async () => {
            attempts += 1
            if (attempts === 1) throw new Error('Simulated save failure')
          },
        },
      },
    }
  }
  if (name === 'alert-empty' || name === 'alert-overflow') {
    const alert = HBAR_APP_UI_APP_DIALOG_FIXTURES.alert!
    return {
      ...HBAR_APP_UI_APP_DIALOG_FIXTURES,
      alert: {
        ...alert,
        channels: name === 'alert-empty' ? [] : Array.from({ length: 17 }, (_, index) => ({
          id: `channel-${index}`,
          label: `Channel ${index + 1}`,
        })),
        initialChannelId: 'stale-channel',
      },
    }
  }
  if (name === 'wizard-empty' || name === 'wizard-overflow') {
    const wizard = HBAR_APP_UI_APP_DIALOG_FIXTURES.wizard!
    return {
      ...HBAR_APP_UI_APP_DIALOG_FIXTURES,
      wizard: {
        ...wizard,
        reference: {
          ...wizard.reference!,
          regions: name === 'wizard-empty' ? [] : Array.from({ length: 17 }, (_, index) => ({
            id: `region-${index}`,
            label: `Region ${index + 1}`,
          })),
          initialRegionId: 'stale-region',
        },
      },
    }
  }
  if (name !== 'overflow') return HBAR_APP_UI_APP_DIALOG_FIXTURES
  const deleteProject = HBAR_APP_UI_APP_DIALOG_FIXTURES.deleteProject!
  return {
    ...HBAR_APP_UI_APP_DIALOG_FIXTURES,
    deleteProject: {
      ...deleteProject,
      metrics: Array.from({ length: deleteProject.listStrategy.expectedMaximum + 1 }, (_, index) => ({
        id: `metric-${index}`,
        label: `Metric ${index + 1}`,
        value: String(index + 1),
      })),
    },
  }
}

export function createHbarAppUiAppDialogLocalizedFixtures(): HbarAppUiAppDialogContent {
  return {
    ...HBAR_APP_UI_APP_DIALOG_FIXTURES,
    plan: {
      ...HBAR_APP_UI_APP_DIALOG_FIXTURES.plan!,
      labels: {
        ...HBAR_APP_UI_APP_DIALOG_FIXTURES.plan!.labels,
        trigger: '更改方案',
        title: '应用方案变更',
        detail: '工作区将在下个续订日升级。',
        close: '关闭方案变更',
        cancel: '取消',
        confirm: '应用变更',
        confirmationTitle: '方案变更已安排',
        confirmationDetail: '规模版将在下个续订日生效。',
        empty: '没有变更',
      },
      rows: [{ id: 'plan', label: '方案', from: '团队版', to: '规模版' }],
    },
    deleteProject: {
      ...HBAR_APP_UI_APP_DIALOG_FIXTURES.deleteProject!,
      labels: {
        ...HBAR_APP_UI_APP_DIALOG_FIXTURES.deleteProject!.labels,
        trigger: '删除项目',
        title: '删除生产项目？',
        detail: '这将永久移除项目及其全部内容，无法撤销。',
        close: '关闭对话框',
        confirmation: (name) => `输入 ${name} 确认`,
        confirmationBefore: '输入 ',
        confirmationAfter: ' 确认',
        placeholder: '生产项目',
        cancel: '取消',
        confirm: '删除项目',
        empty: '没有项目指标',
        successTitle: '项目已删除',
        successDetail: '项目和部署记录已移除。',
      },
      projectName: '生产项目',
      metrics: [{ id: 'deployments', value: '1,204', label: '部署' }],
    },
    invite: {
      ...HBAR_APP_UI_APP_DIALOG_FIXTURES.invite!,
      labels: {
        ...HBAR_APP_UI_APP_DIALOG_FIXTURES.invite!.labels,
        trigger: '邀请成员',
        title: '邀请成员加入工作区',
        detail: '收到邮件后可加入这个工作区。',
        close: '关闭对话框',
        name: '成员姓名',
        namePlaceholder: '姓名',
        email: '工作邮箱',
        emailPlaceholder: 'name@example.cn',
        emailHint: '邀请将在七天后过期。',
        role: '权限角色',
        roleHint: '可根据职责调整工作区权限。',
        cancel: '取消',
        confirm: '发送邀请',
        nameError: '请输入成员姓名。',
        emailError: '请输入有效的工作邮箱。',
        successTitle: '邀请已发送',
        successDetail: '对方接受前会显示为待加入。',
      },
      roles: [{ id: 'viewer', label: '查看者' }],
      initialRoleId: 'viewer',
    },
    wizard: {
      ...HBAR_APP_UI_APP_DIALOG_FIXTURES.wizard!,
      labels: {
        ...HBAR_APP_UI_APP_DIALOG_FIXTURES.wizard!.labels,
        trigger: '创建工作区',
        count: (step, total) => `第 ${step} 步，共 ${total} 步`,
        close: '关闭对话框',
        name: '工作区名称',
        url: '工作区地址',
        urlHint: '稍后可在设置中修改该地址。',
        cancel: '取消',
        next: '继续',
        confirm: '创建工作区',
        reviewName: '工作区',
      },
      workspaceName: '跨区域协作工作区',
      reference: {
        ...HBAR_APP_UI_APP_DIALOG_FIXTURES.wizard!.reference!,
        labels: {
          namePlaceholder: '请输入名称',
          region: '主要数据存储区域',
          regionHint: '请选择工作区数据的存储区域，稍后还可查看团队配置。',
          team: '邀请协作成员',
          teamPlaceholder: '输入邮箱地址，使用逗号分隔',
          teamHint: '可先跳过此步骤，之后再邀请更多协作成员加入。',
          reviewRegion: '存储区域',
          back: '返回',
          emptyRegions: '当前没有可用区域',
          successTitle: '工作区已创建',
          successDetail: (slug) => `正在跳转到 ${slug}。`,
        },
        steps: [
          { id: 'workspace', label: '工作区' },
          { id: 'region', label: '区域' },
          { id: 'team', label: '团队' },
        ],
        regions: [{ id: 'iad1', label: '美国东部区域（iad1）' }],
        initialRegionId: 'iad1',
        slugForName: () => 'cross-region-collaboration',
      },
    },
    alert: {
      ...HBAR_APP_UI_APP_DIALOG_FIXTURES.alert!,
      labels: {
        trigger: '编辑告警规则',
        title: '编辑告警规则',
        close: '关闭抽屉',
        name: '规则名称',
        deliver: '发送渠道',
        threshold: '触发阈值',
        note: '备注',
        enabled: '启用规则',
        enabledHint: '关闭后暂停通知，但不会删除这条很长的告警规则。',
        toggle: '启用规则',
        cancel: '取消',
        save: '保存修改',
      },
      ruleName: '跨区域生产环境错误率持续上升的告警规则',
      channels: [{ id: 'mail', label: '电子邮件与值班消息通知' }],
      initialChannelId: 'mail',
      reference: {
        ...HBAR_APP_UI_APP_DIALOG_FIXTURES.alert!.reference!,
        labels: {
          discardTitle: '放弃未保存的修改？',
          discardDetail: '关闭抽屉后，尚未保存的规则修改将丢失。',
          keepEditing: '继续编辑',
          discard: '放弃修改',
          savedTitle: '告警规则已更新',
          savedDetail: '新的设置将在下一次告警时生效。',
          emptyChannels: '没有可用的发送渠道',
          saving: '正在保存修改…',
          saveError: '未能保存规则，请重试。',
        },
      },
    },
  }
}
