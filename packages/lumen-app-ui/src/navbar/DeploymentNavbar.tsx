import { BookOpen, ChevronDown, Globe2, Settings, Zap, CircleHelp } from './glyphs'
import { NavbarPopup } from './menu'
import { type LumenNavbarDeploymentContent } from './content'
import {
  NavbarButton,
  NavbarFrame,
  NavbarGlyph,
  NavbarIconOnly,
  type NavbarSurfaceProps,
  reportNavbarAction,
} from './primitives'
import * as React from 'react'
import { LumenChoiceSelect, LumenComboBox } from '../forms'

function DeploymentNavbarLegacy({
  spec,
  onAction,
  content,
}: NavbarSurfaceProps & {
  readonly content: LumenNavbarDeploymentContent
}) {
  return (
    <NavbarFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-deployment">
      <header>
        <div className="hbar-app-ui-navbar-deployment-path">
          {content.workspaceMenu ? (
            <NavbarPopup
              {...content.workspaceMenu}
              className="hbar-app-ui-navbar-deployment-selector"
              onChoose={(id) => reportNavbarAction(onAction, spec, 'workspace', id)}
            >
              <span className="hbar-app-ui-navbar-brand-initial">{content.workspaceInitial}</span>
              <span>{content.workspace}</span>
              <NavbarGlyph icon={ChevronDown} tier="xs" />
            </NavbarPopup>
          ) : (
            <NavbarButton onClick={() => reportNavbarAction(onAction, spec, 'workspace')}>
              <span className="hbar-app-ui-navbar-brand-initial">{content.workspaceInitial}</span>
              <span>{content.workspace}</span>
              <NavbarGlyph icon={ChevronDown} tier="xs" />
            </NavbarButton>
          )}
          <span className="hbar-app-ui-navbar-separator">{content.actions.breadcrumbSeparator}</span>
          {content.projectMenu ? (
            <NavbarPopup
              {...content.projectMenu}
              className="hbar-app-ui-navbar-deployment-selector"
              onChoose={(id) => reportNavbarAction(onAction, spec, 'project', id)}
            >
              <NavbarGlyph icon={Globe2} tier="sm" />
              <span>{content.project}</span>
              <NavbarGlyph icon={ChevronDown} tier="xs" />
            </NavbarPopup>
          ) : (
            <NavbarButton onClick={() => reportNavbarAction(onAction, spec, 'project')}>
              <NavbarGlyph icon={Globe2} tier="sm" />
              <span>{content.project}</span>
              <NavbarGlyph icon={ChevronDown} tier="xs" />
            </NavbarButton>
          )}
          <span className="hbar-app-ui-navbar-separator">{content.actions.breadcrumbSeparator}</span>
          {content.environmentMenu ? (
            <NavbarPopup
              {...content.environmentMenu}
              className="hbar-app-ui-navbar-deployment-selector"
              onChoose={(id) => reportNavbarAction(onAction, spec, 'environment', id)}
            >
              <span className="hbar-app-ui-navbar-environment-dot" />
              <span>{content.environment}</span>
              <NavbarGlyph icon={ChevronDown} tier="xs" />
            </NavbarPopup>
          ) : (
            <NavbarButton onClick={() => reportNavbarAction(onAction, spec, 'environment')}>
              <span className="hbar-app-ui-navbar-environment-dot" />
              <span>{content.environment}</span>
              <NavbarGlyph icon={ChevronDown} tier="xs" />
            </NavbarButton>
          )}
        </div>
        <div className="hbar-app-ui-navbar-deployment-actions">
          <NavbarIconOnly
            label={content.actions.helpLabel}
            icon={BookOpen}
            tier="sm"
            onClick={() => reportNavbarAction(onAction, spec, 'help')}
          />
          <NavbarIconOnly
            label={content.actions.settingsLabel}
            icon={Settings}
            tier="sm"
            onClick={() => reportNavbarAction(onAction, spec, 'settings')}
          />
          <NavbarButton
            className="hbar-app-ui-navbar-deployment-upgrade"
            onClick={() => reportNavbarAction(onAction, spec, 'upgrade')}
          >
            <NavbarGlyph icon={Zap} tier="sm" />
            <span>{content.actions.upgrade}</span>
          </NavbarButton>
          <NavbarButton
            aria-label={content.actions.accountLabel}
            onClick={() => reportNavbarAction(onAction, spec, 'account')}
          >
            <span className="hbar-app-ui-navbar-account">{content.accountInitial}</span>
          </NavbarButton>
        </div>
      </header>
      <main>
        <h1>{content.deploymentLabel}</h1>
        <p>{content.deploymentSummary}</p>
        <dl
          data-hbar-app-ui-list-strategy={content.statsStrategy.kind}
          data-hbar-app-ui-expected-maximum={content.statsStrategy.expectedMaximum}
        >
          {content.stats.map((stat) => (
            <div key={stat.label}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      </main>
    </NavbarFrame>
  )
}
;('use client')

function DeploymentNavbarWorkflow({
  spec,
  onAction,
  content,
}: NavbarSurfaceProps & {
  readonly content: DeploymentNavbarWorkflowContent
}) {
  const [workspaceId, setWorkspaceId] = React.useState(content.initialWorkspaceId)
  const [projectId, setProjectId] = React.useState<string | null>(content.initialProjectId)
  const [projectQuery, setProjectQuery] = React.useState(
    content.projectOptions.find((item) => item.id === content.initialProjectId)?.label ?? '',
  )
  const [projectOpen, setProjectOpen] = React.useState(false)
  const [environmentId, setEnvironmentId] = React.useState(content.initialEnvironmentId)
  const projectOptions = content.projectOptions.filter((item) =>
    item.label.toLocaleLowerCase().includes(projectQuery.toLocaleLowerCase()),
  )
  return (
    <NavbarFrame spec={spec} className="hbar-app-ui-navbar-deployment">
      <header>
        <div className="hbar-app-ui-navbar-deployment-path">
          <div className="hbar-app-ui-navbar-deployment-selector">
            <span className="hbar-app-ui-navbar-brand-initial">{content.workspaceInitial}</span>
            <LumenChoiceSelect
              id={`${spec.id}-workspace`}
              label={content.actions.searchLabel}
              options={content.workspaceOptions}
              value={workspaceId}
              onValueChange={(id) => {
                setWorkspaceId(id)
                reportNavbarAction(onAction, spec, 'workspace', id)
              }}
            />
          </div>
          <span className="hbar-app-ui-navbar-separator">{content.actions.breadcrumbSeparator}</span>
          <div className="hbar-app-ui-navbar-deployment-project">
            <NavbarGlyph icon={Globe2} tier="sm" />
            <LumenComboBox
              id={`${spec.id}-project`}
              value={projectId}
              query={projectQuery}
              open={projectOpen}
              options={projectOptions}
              labels={{
                open: content.actions.selectorOpen,
                empty: content.actions.projectEmpty,
                loading: content.actions.selectorLoading,
              }}
              placeholder={content.actions.projectSearch}
              onQueryChange={setProjectQuery}
              onOpenChange={setProjectOpen}
              onValueChange={(value) => {
                setProjectId(value)
                reportNavbarAction(onAction, spec, 'project', value)
              }}
            />
          </div>
          <span className="hbar-app-ui-navbar-separator">{content.actions.breadcrumbSeparator}</span>
          <div className="hbar-app-ui-navbar-deployment-selector">
            <span className="hbar-app-ui-navbar-environment-dot" />
            <LumenChoiceSelect
              id={`${spec.id}-environment`}
              label={content.environment}
              options={content.environmentOptions}
              value={environmentId}
              onValueChange={(id) => {
                setEnvironmentId(id)
                reportNavbarAction(onAction, spec, 'environment', id)
              }}
            />
          </div>
        </div>
        <div className="hbar-app-ui-navbar-deployment-actions">
          <NavbarIconOnly
            label={content.actions.helpLabel}
            icon={CircleHelp}
            tier="sm"
            onClick={() => reportNavbarAction(onAction, spec, 'help')}
          />
          <NavbarIconOnly
            label={content.actions.settingsLabel}
            icon={Settings}
            tier="sm"
            onClick={() => reportNavbarAction(onAction, spec, 'settings')}
          />
          <NavbarButton
            className="hbar-app-ui-navbar-deployment-upgrade"
            variant="solid"
            onClick={() => reportNavbarAction(onAction, spec, 'upgrade')}
          >
            <NavbarGlyph icon={Zap} tier="sm" />
            <span>{content.actions.upgrade}</span>
          </NavbarButton>
          <NavbarButton
            aria-label={content.actions.accountLabel}
            onClick={() => reportNavbarAction(onAction, spec, 'account')}
          >
            <span className="hbar-app-ui-navbar-account">{content.accountInitial}</span>
          </NavbarButton>
        </div>
      </header>
      <main>
        <h1>{content.deploymentLabel}</h1>
        <p>{content.deploymentSummary}</p>
        <dl
          data-hbar-app-ui-list-strategy={content.statsStrategy.kind}
          data-hbar-app-ui-expected-maximum={content.statsStrategy.expectedMaximum}
        >
          {content.stats.map((stat) => (
            <div key={stat.label}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      </main>
    </NavbarFrame>
  )
}
interface DeploymentNavbarWorkflowContent extends LumenNavbarDeploymentContent {
  readonly initialWorkspaceId: NonNullable<LumenNavbarDeploymentContent['initialWorkspaceId']>
  readonly initialProjectId: NonNullable<LumenNavbarDeploymentContent['initialProjectId']>
  readonly initialEnvironmentId: NonNullable<LumenNavbarDeploymentContent['initialEnvironmentId']>
  readonly workspaceOptions: NonNullable<LumenNavbarDeploymentContent['workspaceOptions']>
  readonly projectOptions: NonNullable<LumenNavbarDeploymentContent['projectOptions']>
  readonly environmentOptions: NonNullable<LumenNavbarDeploymentContent['environmentOptions']>
  readonly actions: LumenNavbarDeploymentContent['actions'] & {
    readonly projectSearch: NonNullable<LumenNavbarDeploymentContent['actions']['projectSearch']>
    readonly projectEmpty: NonNullable<LumenNavbarDeploymentContent['actions']['projectEmpty']>
    readonly selectorOpen: NonNullable<LumenNavbarDeploymentContent['actions']['selectorOpen']>
    readonly selectorLoading: NonNullable<LumenNavbarDeploymentContent['actions']['selectorLoading']>
  }
}
function hasDeploymentNavbarWorkflow(
  content: LumenNavbarDeploymentContent,
): content is DeploymentNavbarWorkflowContent {
  return (
    content.initialWorkspaceId !== undefined &&
    content.initialProjectId !== undefined &&
    content.initialEnvironmentId !== undefined &&
    content.workspaceOptions !== undefined &&
    content.projectOptions !== undefined &&
    content.environmentOptions !== undefined &&
    content.actions.projectSearch !== undefined &&
    content.actions.projectEmpty !== undefined &&
    content.actions.selectorOpen !== undefined &&
    content.actions.selectorLoading !== undefined
  )
}

export function DeploymentNavbar(props: NavbarSurfaceProps & { readonly content: LumenNavbarDeploymentContent }) {
  return hasDeploymentNavbarWorkflow(props.content) ? (
    <DeploymentNavbarWorkflow {...props} content={props.content} />
  ) : (
    <DeploymentNavbarLegacy {...props} />
  )
}
