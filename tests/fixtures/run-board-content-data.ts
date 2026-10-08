export const runBoardContentName = (index: number) =>
  (`完整原运行会话名称 Original session ${index} ` + 'LongSessionIdentityWithoutSpaces'.repeat(4)).slice(0, 160)
export const runBoardContentWorkspace =
  '完整原工作区名称 Original workspace ' + 'LongWorkspaceIdentityWithoutSpaces'.repeat(4)
export const runBoardContentStep = (index: number) =>
  `完整原计划步骤 Original plan step ${index} ` + 'LongPlanExplanationWithoutSpaces'.repeat(4)
