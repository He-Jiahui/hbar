/** Foundation and host-controlled workbench API. Reference compositions live in /catalog. */
export { default as LumenProvider } from './LumenProvider'

export type { LumenProviderProps } from './LumenProvider'

export { default as LumenSurface } from './LumenSurface'

export type { LumenSurfaceProps, LumenSurfaceRole } from './LumenSurface'

export {
  LumenRecordRow,
  LumenMetricRow,
  LumenAdaptiveToolbar,
  LumenReadingMarker,
  focusLumenControl,
} from './workbench-compositions'

export type {
  LumenRecordRowProps,
  LumenMetricRowProps,
  LumenToolbarItem,
  LumenAdaptiveToolbarProps,
  LumenReadingMarkerProps,
} from './workbench-compositions'

export { default as LumenIndicator } from './LumenIndicator'

export type { LumenIndicatorProps, LumenState, LumenTone } from './LumenIndicator'

export { default as LumenField } from './LumenField'

export type { LumenFieldProps } from './LumenField'

export { default as LumenDivider } from './LumenDivider'

export type { LumenDividerProps } from './LumenDivider'

export { default as LumenSlider } from './LumenSlider'

export type { LumenSliderProps } from './LumenSlider'

export { LumenRange } from './range'

export type { LumenRangeProps } from './range'

export { LumenToggleButton } from './toggle-button'

export type { LumenToggleButtonProps } from './toggle-button'

export { LumenDialog } from './dialog'

export type { LumenDialogProps } from './dialog'

export { LumenContentText, LUMEN_TEXT_CONTEXTS } from './content-text'

export type { LumenContentTextProps, LumenTextContext } from './content-text'

export { LumenAgentApproval01 } from './agent-approval'

export { LumenAgentPlan01, LumenAgentPlan02, LumenAgentPlan05 } from './agent-plan'

export { LumenToolCalls } from './tool-calls'

export { LumenSettingsForm01, LumenSettingsForm03, LumenSettingsForm05, LumenSettingsForm06 } from './settings-form'

export { LumenFileManager01, LumenFileManager03 } from './file-manager'

export { LumenEditor02, LumenEditor03, LumenEditor05 } from './editor'

export { LumenIntegrations01, LumenIntegrations02 } from './integrations'

export { LumenNavbar01 } from './navbar'

export { LumenPromptInput01, LumenPromptInput04, LumenPromptInput07 } from './prompt-input'

export { LumenDashboard02 } from './dashboard'

export { LumenNotifications } from './notifications'

export type { LumenNotificationEntry, LumenNotificationsContent } from './notifications'

export { LumenWizard07 } from './wizard'

export { LumenAppShell04, LumenAppShell09 } from './app-shell-workflows'

export { LumenAppSidebar06 } from './app-sidebar-workflows'

export { LumenAiChat01 } from './ai-chat'

export { LumenOnboarding3Reference } from './onboarding-3-reference'

export type { LumenOnboarding3ReferenceContent } from './onboarding-3-reference'

export { LumenOnboarding6Reference } from './onboarding-6-reference'

export type { LumenOnboarding6ReferenceContent } from './onboarding-6-reference'

export { LumenUsage01, LumenUsage02, LumenUsage05, LumenUsage07, LumenUsage08 } from './usage'

export type { LumenUsageContent } from './usage'

export type { LumenUsageRequestRecord } from './usage-request-table'

export { LumenDisclosure } from './disclosure'

export type { LumenDisclosureProps } from './disclosure'

export {
  LumenCheckBox,
  LumenCheckBoxControl,
  LumenComboBox,
  LumenFormField,
  LumenInput,
  LumenMultiSelect,
  LumenSelect,
  LumenTextarea,
  LumenToggle,
  LumenToggleControl,
} from './forms'

export type {
  LumenCheckBoxControlProps,
  LumenCheckBoxProps,
  LumenComboBoxLabels,
  LumenComboBoxProps,
  LumenControlOption,
  LumenFieldVariant,
  LumenFormFieldProps,
  LumenInputProps,
  LumenMultiSelectLabels,
  LumenMultiSelectProps,
  LumenSelectProps,
  LumenTextareaProps,
  LumenToggleControlProps,
  LumenToggleProps,
} from './forms'

export { LumenPopupSelect } from './popup-select'

export type { LumenPopupSelectProps } from './popup-select'

export {
  FloatingSurface,
  LumenFloatingSurface,
  claimFloatingSurface,
  floatingSurfaceCoordinator,
  registerFloatingSurface,
  useFloatingTrigger,
} from './floating-surface'

export type {
  AnchoredFloatingSurfaceProps,
  FloatingPlacement,
  FloatingSurfaceMaterial,
  FloatingSurfaceMode,
  FloatingSurfaceProps,
  FloatingSurfaceRegistration,
  FloatingTriggerProps,
  ModalFloatingSurfaceProps,
  PointFloatingSurfaceProps,
} from './floating-surface'

export { LumenToggleGroup } from './toggle-group'

export type {
  LumenToggleGroupMultipleProps,
  LumenToggleGroupProps,
  LumenToggleGroupSingleProps,
  LumenToggleOption,
} from './toggle-group'

export { LumenCommandList } from './command-list'

export { LumenPlanEditor } from './plan-editor'

export type {
  LumenPlanEditorEditing,
  LumenPlanEditorLabels,
  LumenPlanEditorProps,
  LumenPlanListStrategy,
  LumenPlanState,
  LumenPlanStep,
} from './plan-editor'

export { LumenFileDocument, LumenWorkspaceFiles } from './file-workspace'

export type {
  LumenFileDocumentProps,
  LumenWorkspaceFile,
  LumenWorkspaceFileLabels,
  LumenWorkspaceFilesProps,
} from './file-workspace'

export {
  LumenApprovalRequest,
  LumenCompactUsage,
  LumenConversation,
  LumenMessage,
  LumenPromptComposer,
  LumenQuestionnaire,
  LumenRunActivity,
} from './session-components'

export { LumenImageGallery, LumenImageTile } from './image-gallery'

export type { LumenImageGalleryLabels } from './image-gallery'

export type {
  LumenApprovalDecision,
  LumenApprovalRequestLabels,
  LumenApprovalRequestProps,
  LumenCompactUsageMetric,
  LumenCompactUsageProps,
  LumenComposerAttachment,
  LumenConversationProps,
  LumenConversationScrollTarget,
  LumenConversationScrollTargetResult,
  LumenDecisionState,
  LumenFailureMessage,
  LumenMessageProps,
  LumenPromptComposerProps,
  LumenPromptLabels,
  LumenQuestionAnswer,
  LumenQuestionnaireLabels,
  LumenQuestionnaireOption,
  LumenQuestionnaireProps,
  LumenQuestionnaireQuestion,
  LumenRunActivityItem,
  LumenRunActivityLabels,
  LumenRunActivityProps,
  LumenRunActivityStatus,
  LumenRunPlan,
  LumenRunPlanStepStatus,
} from './session-components'

export { LumenButton, LumenIconButton, LumenNavigationButton, LumenStatus, LumenText } from './primitives'

export type {
  LumenActionTone,
  LumenActionVariant,
  LumenButtonProps,
  LumenIconButtonProps,
  LumenNavigationButtonProps,
  LumenStatusProps,
  LumenTextProps,
  LumenTextTone,
  LumenTextVariant,
} from './primitives'

export { LumenCollection, LumenCollectionItem, LumenFrame } from './structure'

export { LumenImage } from './lumen-image'

export { default as LumenWorkbenchNotice } from './LumenWorkbenchNotice'

export {
  LumenActionMenu,
  LumenAppShell,
  LumenAppSidebar,
  LumenIcon,
  LumenShellHeaderAction,
  LumenSidebarAction,
  LumenWindowTitlebar,
} from './workbench'

export type { LumenToolPresentation } from './tool-pane-layout'

export type {
  LumenActionMenuItem,
  LumenActionMenuProps,
  LumenAppShellProps,
  LumenAppSidebarProps,
  LumenAppSidebarStatus,
  LumenIconProps,
  LumenIconTier,
  LumenSidebarActionProps,
  LumenWindowPlatform,
  LumenWindowTitlebarLabels,
  LumenWindowTitlebarProps,
} from './workbench'

export {
  LumenBarSeries,
  LumenCompactMetrics,
  LumenPageAction,
  LumenPageHeader,
  LumenSettingsList,
  LumenToolPane,
} from './workspace-components'

export type {
  LumenBarPoint,
  LumenCompactMetric,
  LumenPageActionProps,
  LumenPageHeaderProps,
  LumenSettingsListItem,
  LumenSettingsListProps,
  LumenToolPaneProps,
} from './workspace-components'

export { applyLumenAppearance, DEFAULT_LUMEN_APPEARANCE, LUMEN_SIZES, normalizeLumenGlow } from './appearance'

export type { LumenAppearance, LumenAppearanceRoot, LumenMode, LumenShape, LumenSize } from './appearance'

export { LumenTree, LumenTreeItem } from './tree'

export type { LumenTreeProps, LumenTreeItemProps } from './tree'

export { LumenChoiceSelect, LumenFileButton } from './forms'

export type { LumenChoiceSelectProps, LumenFileButtonProps } from './forms'

export * from './ui-controls'

export { resolveLumenColors } from './appearance'

export type { LumenColors } from './appearance'

export { getLumenColorProperties } from './appearance'
export { default as createLumenTheme } from './theme'
export type { LumenThemeOptions } from './theme'

export { LUMEN_STYLE_PARTS, lumenPartProps, lumenPartSelector } from './style-contract'
export type { LumenStylePart, LumenStylePartProps } from './style-contract'
