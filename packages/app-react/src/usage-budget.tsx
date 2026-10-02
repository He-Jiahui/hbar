import { LumenFrame, LumenText, LumenUsage05 } from '@lumen/app-ui'
import type { UsageBudgetRuntime } from '@hbar/app-runtime'
import { useHbarRuntimeState } from './runtime'
export interface HbarUsageBudgetLabels { readonly title:string; readonly description:string; readonly cap:string; readonly save:string; readonly saving:string; readonly unknown:string; readonly reconcile:string; readonly error:(message:string)=>string }
export interface HbarUsageBudgetProps { readonly runtime: UsageBudgetRuntime; readonly labels:HbarUsageBudgetLabels }
export function HbarUsageBudget({runtime,labels}:HbarUsageBudgetProps) {
 const state=useHbarRuntimeState(runtime.state); const busy=state.status==='loading'||state.status==='submitting'||state.status==='unknown'; const value=state.draftLimit; const valid=/^\d+$/.test(value)&&Number(value)>0&&Number(value)<=1_000_000_000
 const budget={title:labels.title,description:labels.description,labels:{cap:labels.cap,save:labels.save,saving:labels.saving},cap:{value,display:value,input:'number' as const,minimum:1,maximum:1_000_000_000,step:1},busy,canSave:valid&&!busy&&state.targetSessionId!==null,...(state.error?{error:labels.error(state.error)}:{}),...(state.status==='unknown'?{status:{label:labels.unknown,tone:'warning' as const}}:{}),onCapChange:runtime.setDraftLimit,onSave:()=>{void runtime.save().catch(()=>undefined)},...(state.status==='unknown'?{clear:{label:labels.reconcile,onInvoke:()=>{void runtime.reconcile().catch(()=>undefined)}}}: {})}
 return <LumenFrame as="section" aria-label={labels.title}><LumenText as="h2">{labels.title}</LumenText><LumenUsage05 content={{budget}}/></LumenFrame>
}
