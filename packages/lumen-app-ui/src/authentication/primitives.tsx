import { Apple } from 'lucide-react'
import * as React from 'react'
import { LumenInput } from '../forms'
import LumenSurface from '../LumenSurface'
import { LumenButton, LumenStatus } from '../primitives'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Eye,
  EyeOff,
  KeyRound,
  Laptop,
  Link2,
  Mail,
  Monitor,
  MoreHorizontal,
  MousePointer2,
  QrCode,
  Smartphone,
  Upload,
  Wifi,
} from './glyphs'
import { type LumenAuthListStrategy, type LumenAuthProviderChoice, uniqueLumenAuthItems } from './content'

export interface LumenAuthCompositionProps {
  readonly spec: {
    readonly id: string
    readonly variant: number
    readonly density?: string | undefined
    readonly className?: string | undefined
    readonly profile: {
      readonly surface?: string | undefined
      readonly initialState?: string | undefined
      readonly visualMode?: string | undefined
    }
  }
  // Shared by composition implementations; AuthFrame uses only spec.
  readonly onAction?:
    | ((event: { readonly variantId: string; readonly actionId: string; readonly value?: string | undefined }) => void)
    | undefined
}

export function AuthFrame({
  spec,
  className,
  children,
}: LumenAuthCompositionProps & {
  readonly children: React.ReactNode
  readonly className?: string | undefined
}) {
  const contentClassName = [
    'lumen-authentication',
    'hbar-app-ui-auth-surface',
    `hbar-app-ui-auth-variant-${spec.variant}`,
    spec.density ? `hbar-app-ui-density-${spec.density}` : '',
    spec.profile.surface ? `hbar-app-ui-surface-${spec.profile.surface}` : '',
    spec.profile.initialState ? `hbar-app-ui-state-${spec.profile.initialState}` : '',
    spec.profile.visualMode ? `hbar-app-ui-visual-${spec.profile.visualMode}` : '',
    spec.className,
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <LumenSurface
      as={spec.variant >= 2 && spec.variant <= 14 ? 'div' : 'section'}
      boundary={spec.variant <= 14 ? 'none' : 'horizontal'}
      glassStrength={spec.variant <= 14 ? 0 : 65}
      className="lumen-authentication-root-surface"
      contentClassName={contentClassName}
      data-lumen-component="authentication"
      data-lumen-variant={spec.variant}
      data-hbar-app-ui-component={spec.id}
      data-hbar-app-ui-surface={spec.profile.surface}
      data-hbar-app-ui-state={spec.profile.initialState}
    >
      {children}
    </LumenSurface>
  )
}

export function AuthCard({
  children,
  className = '',
}: {
  readonly children: React.ReactNode
  readonly className?: string | undefined
}) {
  return <section className={`hbar-app-ui-auth-card ${className}`}>{children}</section>
}

export function AuthIcon({
  children,
  tier = 'sm',
}: {
  readonly children: React.ReactNode
  readonly tier?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | undefined
}) {
  return (
    <span className={`hbar-app-ui-auth-icon hbar-app-ui-icon-${tier}`} aria-hidden="true">
      {children}
    </span>
  )
}

export function AuthButton({
  children,
  tone = 'neutral',
  indicator = 'lamp',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly tone?: 'neutral' | 'accent' | 'danger' | undefined
  readonly indicator?: 'lamp' | 'none' | undefined
}) {
  return (
    <LumenButton
      {...props}
      tone={tone === 'accent' ? 'primary' : tone}
      variant={tone === 'neutral' ? 'outlined' : 'solid'}
      indicator={indicator}
      className={`hbar-app-ui-auth-button hbar-app-ui-auth-button-${tone} ${className ?? ''}`}
    >
      {children}
    </LumenButton>
  )
}

export function AuthIconButton({
  label,
  children,
  indicator,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly label: string
  readonly indicator?: 'lamp' | 'none' | undefined
}) {
  return (
    <AuthButton
      {...props}
      indicator={indicator}
      className={`hbar-app-ui-auth-icon-button ${props.className ?? ''}`}
      aria-label={props['aria-label'] ?? label}
      title={props.title ?? label}
    >
      {children}
    </AuthButton>
  )
}

export function AuthBrand({
  label,
  compact = false,
  plain = false,
}: {
  readonly label: string
  readonly compact?: boolean | undefined
  readonly plain?: boolean | undefined
}) {
  return (
    <div
      className={`hbar-app-ui-auth-brand ${compact ? 'is-compact' : ''}`}
      aria-label={plain ? undefined : label}
      role={plain ? undefined : 'img'}
    >
      <span aria-hidden={plain ? undefined : true}>{label.slice(0, 1)}</span>
      {plain ? <span className="hbar-app-ui-auth-brand-label">{label}</span> : <strong>{label}</strong>}
    </div>
  )
}

export function AuthDivider({ label }: { readonly label: string }) {
  return (
    <div className="hbar-app-ui-auth-divider">
      <span aria-hidden="true" />
      <small>{label}</small>
      <span aria-hidden="true" />
    </div>
  )
}

export function AuthFooterLinks({
  links,
  onSelect,
  indicator,
  navigation = true,
}: {
  readonly links: readonly string[]
  readonly onSelect: (value: string) => void
  readonly indicator?: 'lamp' | 'none' | undefined
  readonly navigation?: boolean | undefined
}) {
  const Container = navigation ? 'nav' : 'div'
  return (
    <Container className="hbar-app-ui-auth-footer-links" aria-label={navigation ? links.join(', ') : undefined}>
      {links.map((link) => (
        <LumenButton
          type="button"
          indicator={indicator}
          className="hbar-app-ui-auth-inline-link"
          key={link}
          onClick={() => onSelect(link)}
        >
          {link}
        </LumenButton>
      ))}
    </Container>
  )
}

export function AuthField({
  label,
  placeholder,
  value,
  type = 'text',
  onChange,
  children,
  helper,
  plain = false,
}: {
  readonly label: string
  readonly placeholder?: string | undefined
  readonly value?: string | undefined
  readonly type?: string | undefined
  readonly onChange?: ((value: string) => void) | undefined
  readonly children?: React.ReactNode
  readonly helper?: React.ReactNode
  readonly plain?: boolean | undefined
}) {
  return (
    <label className="hbar-app-ui-auth-field">
      <span>{label}</span>
      <div className="hbar-app-ui-auth-input-wrap">
        <LumenInput
          variant={plain ? 'plain' : 'boundary'}
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange?.(event.currentTarget.value)}
        />
        {children}
      </div>
      {helper && <small>{helper}</small>}
    </label>
  )
}

export function AuthPasswordButton({
  visible,
  showLabel,
  hideLabel,
  onToggle,
  plain = false,
}: {
  readonly visible: boolean
  readonly showLabel: string
  readonly hideLabel: string
  readonly onToggle: () => void
  readonly plain?: boolean | undefined
}) {
  return (
    <AuthIconButton
      type="button"
      label={visible ? hideLabel : showLabel}
      indicator={plain ? 'none' : 'lamp'}
      onClick={onToggle}
    >
      {visible ? (
        <AuthIcon>
          <EyeOff />
        </AuthIcon>
      ) : (
        <AuthIcon>
          <Eye />
        </AuthIcon>
      )}
    </AuthIconButton>
  )
}

export function AuthProviderIcon({ kind }: { readonly kind?: LumenAuthProviderChoice['icon'] | undefined }) {
  switch (kind) {
    case 'google':
      return (
        <AuthIcon>
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M13.5 4.2A6 6 0 1 0 14 8H8m6 0v4" />
          </svg>
        </AuthIcon>
      )
    case 'apple':
      return (
        <AuthIcon>
          <Apple />
        </AuthIcon>
      )
    case 'github':
      return (
        <AuthIcon>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3.1-.4 6.4-1.6 6.4-7A5.4 5.4 0 0 0 20 4.8 5.1 5.1 0 0 0 19.9 1S18.7.7 16 2.5a13.4 13.4 0 0 0-7 0C6.3.7 5.1 1 5.1 1A5.1 5.1 0 0 0 5 4.8a5.4 5.4 0 0 0-1.5 3.8c0 5.4 3.3 6.6 6.4 7a3.4 3.4 0 0 0-.9 2.6V22" />
          </svg>
        </AuthIcon>
      )
    case 'mail':
      return (
        <AuthIcon>
          <Mail />
        </AuthIcon>
      )
    case 'key':
      return (
        <AuthIcon>
          <KeyRound />
        </AuthIcon>
      )
    case undefined:
      return (
        <AuthIcon>
          <CircleHelp />
        </AuthIcon>
      )
    default:
      return (
        <AuthIcon>
          <CircleHelp />
        </AuthIcon>
      )
  }
}

export function AuthProviderButtons({
  providers,
  onSelect,
  listStrategy,
  className = '',
  indicator,
}: {
  readonly providers: readonly LumenAuthProviderChoice[]
  readonly onSelect: (provider: LumenAuthProviderChoice) => void
  readonly listStrategy?: LumenAuthListStrategy | undefined
  readonly className?: string | undefined
  readonly indicator?: 'lamp' | 'none' | undefined
}) {
  const uniqueProviders = uniqueLumenAuthItems(providers)
  return (
    <div
      className={`hbar-app-ui-auth-provider-buttons ${className}`}
      data-hbar-app-ui-list-strategy={listStrategy?.kind}
    >
      {uniqueProviders.map((provider) => (
        <AuthButton key={provider.id} type="button" indicator={indicator} onClick={() => onSelect(provider)}>
          <AuthProviderIcon kind={provider.icon} />
          {provider.label}
        </AuthButton>
      ))}
    </div>
  )
}

export function AuthAvatar({
  initials,
  label,
  large = false,
}: {
  readonly initials: string
  readonly label?: string | undefined
  readonly large?: boolean | undefined
}) {
  return (
    <span className={`hbar-app-ui-auth-avatar ${large ? 'is-large' : ''}`} aria-label={label}>
      {initials}
    </span>
  )
}

export function AuthStatus({
  label,
  tone = 'neutral',
}: {
  readonly label: string
  readonly tone?: 'neutral' | 'positive' | 'warning' | 'danger' | undefined
}) {
  const tones = {
    neutral: 'neutral',
    positive: 'success',
    warning: 'warning',
    danger: 'danger',
  } as const
  return <LumenStatus className="hbar-app-ui-auth-status" value={label} tone={tones[tone]} />
}

export function AuthMetaRows({
  rows,
}: {
  readonly rows: readonly { readonly label: string; readonly value: string }[]
}) {
  return (
    <dl className="hbar-app-ui-auth-meta-rows">
      {rows.map((row) => (
        <div key={`${row.label}-${row.value}`}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function AuthArrow({ back = false }: { readonly back?: boolean | undefined }) {
  return <AuthIcon>{back ? <ArrowLeft /> : <ArrowRight />}</AuthIcon>
}

export function AuthLeadingIcon({
  kind,
}: {
  readonly kind: 'laptop' | 'phone' | 'key' | 'monitor' | 'wifi' | 'upload' | 'qr' | 'pointer'
}) {
  switch (kind) {
    case 'phone':
      return (
        <AuthIcon>
          <Smartphone />
        </AuthIcon>
      )
    case 'key':
      return (
        <AuthIcon>
          <KeyRound />
        </AuthIcon>
      )
    case 'monitor':
      return (
        <AuthIcon>
          <Monitor />
        </AuthIcon>
      )
    case 'wifi':
      return (
        <AuthIcon>
          <Wifi />
        </AuthIcon>
      )
    case 'upload':
      return (
        <AuthIcon>
          <Upload />
        </AuthIcon>
      )
    case 'qr':
      return (
        <AuthIcon>
          <QrCode />
        </AuthIcon>
      )
    case 'pointer':
      return (
        <AuthIcon>
          <MousePointer2 />
        </AuthIcon>
      )
    case 'laptop':
      return (
        <AuthIcon>
          <Laptop />
        </AuthIcon>
      )
  }
}

export function AuthCheck() {
  return (
    <AuthIcon>
      <Check />
    </AuthIcon>
  )
}

export function AuthLinkIcon() {
  return (
    <AuthIcon>
      <Link2 />
    </AuthIcon>
  )
}

export function AuthMore() {
  return (
    <AuthIcon>
      <MoreHorizontal />
    </AuthIcon>
  )
}

export function AuthChevron() {
  return (
    <AuthIcon>
      <ChevronRight />
    </AuthIcon>
  )
}
