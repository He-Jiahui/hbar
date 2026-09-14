import {useState} from 'react'
import {
    ArrowLeft,
    Check,
    ChevronRight,
    Eye,
    EyeOff,
    KeyRound,
    Mail,
    Monitor,
    Plus,
    ShieldCheck,
    Smartphone
} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiIconButton,
    HbarAppUiMetricStrip,
    HbarAppUiProgress,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiTabs,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type AuthProps = HbarAppUiVariantProps

function SignInCard({spec, onAction}: AuthProps) {
    const [show, setShow] = useState(false);
    const [remember, setRemember] = useState(true);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-variant-1">
        <div className="hbar-app-ui-auth-card">
            <div className="hbar-app-ui-auth-mark"><KeyRound size={20}/></div>
            <h2>Sign in to hbar</h2><p>Continue to your local workspace.</p><label>Email<input type="email"
                                                                                               placeholder="you@workspace.test"/></label><label>Password
            <div className="hbar-app-ui-input-icon"><input type={show ? 'text' : 'password'}
                                                           placeholder="Enter password"/><HbarAppUiIconButton
                label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((value) => !value)}>{show ?
                <EyeOff size={13}/> : <Eye size={13}/>}</HbarAppUiIconButton></div>
        </label><label><input type="checkbox" checked={remember} onChange={() => setRemember((value) => !value)}/>Keep
            me signed in</label><HbarAppUiButton tone="accent"
                                                 onClick={() => onAction?.({variantId: spec.id, actionId: 'sign-in'})}>Sign
            in <ChevronRight size={13}/></HbarAppUiButton>
            <div className="hbar-app-ui-provider-row"><HbarAppUiButton onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'provider',
                value: 'Google'
            })}>Google</HbarAppUiButton><HbarAppUiButton onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'provider',
                value: 'GitHub'
            })}>GitHub</HbarAppUiButton><HbarAppUiButton onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'provider',
                value: 'SSO'
            })}>SSO</HbarAppUiButton></div>
        </div>
    </ActionSurfaceFrame>
}

function ProviderFirst({spec, onAction}: AuthProps) {
    const [provider, setProvider] = useState('Email');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-variant-2"><HbarAppUiToolbar
        title="Choose how to sign in" detail="Provider-first flow"/><HbarAppUiTabs label="Sign-in provider"
                                                                                   value={provider} options={[{
        id: 'Email',
        label: 'Email'
    }, {id: 'SSO', label: 'Company SSO'}]} onChange={setProvider}/>{provider === 'SSO' ?
        <label>Company domain<input placeholder="acme.com"/></label> :
        <label>Email address<input type="email" placeholder="you@workspace.test"/></label>}<HbarAppUiButton
        tone="accent" onClick={() => onAction?.({
        variantId: spec.id,
        actionId: 'continue',
        value: provider
    })}>Continue</HbarAppUiButton></ActionSurfaceFrame>
}

function QuoteSignIn({spec, onAction}: AuthProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-variant-3">
        <div className="hbar-app-ui-split-auth">
            <div className="hbar-app-ui-auth-card"><h2>Welcome back</h2><label>Email<input
                placeholder="you@workspace.test"/></label><HbarAppUiButton tone="accent" onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'continue'
            })}>Continue</HbarAppUiButton></div>
            <HbarAppUiSpotlight><p>“Our team finds the right run context in seconds.”</p>
                <div className="hbar-app-ui-avatar-stack"><span>A</span><span>M</span><span>J</span></div>
                <HbarAppUiMetricStrip
                    metrics={[{label: 'Teams', value: '2.4k'}, {label: 'Runs', value: '1.8m'}]}/></HbarAppUiSpotlight>
        </div>
    </ActionSurfaceFrame>
}

function TwoStep({spec, onAction}: AuthProps) {
    const [email, setEmail] = useState('');
    const [step, setStep] = useState(1);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-variant-4"><HbarAppUiToolbar
        title="Sign in" detail={`Step ${step} of 2`}/>{step === 1 ? <><label>Email<input value={email}
                                                                                         onChange={(event) => setEmail(event.target.value)}
                                                                                         placeholder="you@workspace.test"/></label><HbarAppUiButton
        tone="accent" disabled={!email.includes('@')} onClick={() => {
        setStep(2);
        onAction?.({variantId: spec.id, actionId: 'continue', value: email})
    }}>Continue</HbarAppUiButton></> : <><HbarAppUiSpotlight><span
        className="hbar-app-ui-avatar">{email[0]?.toUpperCase() ?? 'U'}</span><strong>{email}</strong><small>Matched
        account</small></HbarAppUiSpotlight><label>Password<input type="password" placeholder="Enter password"/></label><HbarAppUiButton
        tone="accent" onClick={() => onAction?.({variantId: spec.id, actionId: 'sign-in'})}>Sign in</HbarAppUiButton>
        <button type="button" onClick={() => setStep(1)}><ArrowLeft size={13}/>Use another email</button>
    </>}</ActionSurfaceFrame>
}

function MagicLink({spec, onAction}: AuthProps) {
    const [sent, setSent] = useState(true);
    const [seconds, setSeconds] = useState(42);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-auth-variant-5"><HbarAppUiSpotlight><Mail size={22}/><strong>Check
        your inbox</strong><p>We sent a magic link to <b>you@workspace.test</b>.</p><HbarAppUiStatus
        value={sent ? `Resend in ${seconds}s` : 'Ready to resend'} tone="neutral"/><HbarAppUiButton disabled={sent}
                                                                                                    onClick={() => {
                                                                                                        setSent(true);
                                                                                                        setSeconds(42);
                                                                                                        onAction?.({
                                                                                                            variantId: spec.id,
                                                                                                            actionId: 'resend'
                                                                                                        })
                                                                                                    }}>Resend
        link</HbarAppUiButton>
        <button type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'back'})}>Back to sign in
        </button>
    </HbarAppUiSpotlight></ActionSurfaceFrame>
}

function CodeEntry({spec, onAction}: AuthProps) {
    const [code, setCode] = useState('');
    const verified = code.length === 6;
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-variant-6"><HbarAppUiToolbar
        title="Enter verification code" detail="Paste support · auto verify"/>
        <div className="hbar-app-ui-code-inputs">{Array.from({length: 6}, (_, index) => <input key={index}
                                                                                               value={code[index] ?? ''}
                                                                                               maxLength={1}
                                                                                               inputMode="numeric"
                                                                                               aria-label={`Digit ${index + 1}`}
                                                                                               onChange={(event) => setCode((current) => `${current.slice(0, index)}${event.target.value}${current.slice(index + 1)}`)}/>)}</div>
        <HbarAppUiStatus value={verified ? 'Verified' : 'Code sent to your email'}
                         tone={verified ? 'positive' : 'neutral'}/><HbarAppUiButton tone="accent" disabled={!verified}
                                                                                    onClick={() => onAction?.({
                                                                                        variantId: spec.id,
                                                                                        actionId: 'verify',
                                                                                        value: code
                                                                                    })}>Verify</HbarAppUiButton>
        <button type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'recovery'})}>Use a recovery
            code
        </button>
    </ActionSurfaceFrame>
}

function SignUp({spec, onAction}: AuthProps) {
    const [password, setPassword] = useState('');
    const strength = Math.min(100, password.length * 14);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-variant-7"><HbarAppUiToolbar
        title="Create your account" detail="Password requirements update live"/><label>Name<input
        placeholder="Avery Chen"/></label><label>Email<input type="email"
                                                             placeholder="you@workspace.test"/></label><label>Password<input
        type="password" value={password} onChange={(event) => setPassword(event.target.value)}
        placeholder="At least 8 characters"/></label><HbarAppUiProgress value={strength} label="Password strength"
                                                                        tone={strength > 70 ? 'positive' : 'warning'}/>
        <div className="hbar-app-ui-password-requirements"><span
            className={password.length >= 8 ? 'is-valid' : ''}><Check size={12}/>8 characters</span><span
            className={/[A-Z]/.test(password) ? 'is-valid' : ''}><Check size={12}/>Uppercase letter</span><span
            className={/\d/.test(password) ? 'is-valid' : ''}><Check size={12}/>Number</span><span
            className={/[^A-Za-z0-9]/.test(password) ? 'is-valid' : ''}><Check size={12}/>Symbol</span></div>
        <HbarAppUiButton tone="accent" disabled={strength < 70}
                         onClick={() => onAction?.({variantId: spec.id, actionId: 'create'})}>Create
            account</HbarAppUiButton></ActionSurfaceFrame>
}

function EnterpriseSso({spec, onAction}: AuthProps) {
    const [domain, setDomain] = useState('');
    const provider = domain.endsWith('acme.com') ? 'Acme Identity' : domain ? 'Provider not detected' : 'Type your company email';
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-variant-8"><HbarAppUiToolbar
        title="Enterprise SSO" detail="Provider detection follows your domain"/><label>Work email<input value={domain}
                                                                                                        onChange={(event) => setDomain(event.target.value)}
                                                                                                        placeholder="name@acme.com"/></label><HbarAppUiSpotlight><ShieldCheck
        size={15}/><strong>{provider}</strong><small>{domain.endsWith('acme.com') ? 'Continue with your company identity provider.' : 'We will detect the correct provider as you type.'}</small></HbarAppUiSpotlight><HbarAppUiButton
        tone="accent" disabled={!domain.includes('@')}
        onClick={() => onAction?.({variantId: spec.id, actionId: 'continue', value: provider})}>Continue with
        SSO</HbarAppUiButton></ActionSurfaceFrame>
}

function Passkey({spec, onAction}: AuthProps) {
    const [device, setDevice] = useState('MacBook Pro');
    const [waiting, setWaiting] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-variant-9"><HbarAppUiToolbar
        title="Sign in with a passkey" detail="Choose a device or use a fallback"/><label>Device<select value={device}
                                                                                                        onChange={(event) => setDevice(event.target.value)}>
        <option>MacBook Pro</option>
        <option>iPhone</option>
        <option>Security key</option>
    </select></label><HbarAppUiButton tone="accent" onClick={() => {
        setWaiting(true);
        onAction?.({variantId: spec.id, actionId: 'passkey', value: device})
    }}>{waiting ? 'Waiting for device…' : 'Use passkey'}</HbarAppUiButton><HbarAppUiStatus
        value={waiting ? 'Approve on your device' : 'Ready'} tone={waiting ? 'warning' : 'positive'}/>
        <div className="hbar-app-ui-auth-fallbacks">
            <button type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'password'})}>Use password
            </button>
            <button type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'magic-link'})}>Email me a
                link
            </button>
        </div>
    </ActionSurfaceFrame>
}

function AccountChooser({spec, onAction}: AuthProps) {
    const [chosen, setChosen] = useState('Avery Chen');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-variant-10"><HbarAppUiToolbar
        title="Choose an account" detail="Remembered profiles and sessions"/>
        <div className="hbar-app-ui-account-list">{['Avery Chen', 'Mina Patel'].map((name) => <button type="button"
                                                                                                      className={chosen === name ? 'is-selected' : ''}
                                                                                                      key={name}
                                                                                                      onClick={() => setChosen(name)}>
            <span
                className="hbar-app-ui-avatar">{name[0]}</span><span><strong>{name}</strong><small>{name === 'Avery Chen' ? 'Active 2m ago' : 'Signed out'}</small></span><HbarAppUiStatus
            value={name === chosen ? 'Selected' : 'Available'} tone={name === chosen ? 'positive' : 'neutral'}/>
        </button>)}
            <button type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'add-account'})}><Plus
                size={14}/>Add another account
            </button>
        </div>
        <HbarAppUiButton tone="accent"
                         onClick={() => onAction?.({variantId: spec.id, actionId: 'continue', value: chosen})}>Continue
            as {chosen}</HbarAppUiButton></ActionSurfaceFrame>
}

function WorkspacePicker({spec, onAction}: AuthProps) {
    const [query, setQuery] = useState('');
    const spaces = ['Project Atlas', 'Project Nova', 'Personal workspace'];
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-variant-11"><HbarAppUiToolbar
        title="Choose a workspace" detail="Invitations and search"/>
        <div className="hbar-app-ui-inline-search"><SearchIcon/><input value={query}
                                                                       onChange={(event) => setQuery(event.target.value)}
                                                                       placeholder="Search workspaces"/></div>
        <div
            className="hbar-app-ui-workspace-picker">{spaces.filter((space) => space.toLowerCase().includes(query.toLowerCase())).map((space) =>
            <button type="button" key={space}
                    onClick={() => onAction?.({variantId: spec.id, actionId: 'choose', value: space})}>
                <span><strong>{space}</strong><small>{space === 'Personal workspace' ? 'Private' : 'Invited by Mina'}</small></span><ChevronRight
                size={13}/></button>)}</div>
        <HbarAppUiButton tone="accent" onClick={() => onAction?.({variantId: spec.id, actionId: 'create'})}>Create
            workspace</HbarAppUiButton></ActionSurfaceFrame>
}

function SearchIcon() {
    return <span className="hbar-app-ui-search-glyph">⌕</span>
}

function Invitation({spec, onAction}: AuthProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-variant-12">
        <div className="hbar-app-ui-invitation-split"><HbarAppUiSpotlight><span
            className="hbar-app-ui-avatar hbar-app-ui-avatar-large">M</span><strong>Mina invited you</strong><p>Join
            Project Atlas and collaborate on workspace runs.</p>
            <div className="hbar-app-ui-avatar-stack"><span>A</span><span>M</span><span>J</span><span>+4</span></div>
        </HbarAppUiSpotlight>
            <main><HbarAppUiToolbar title="Accept invitation" detail="Shared projects and member access"/>
                <ul>
                    <li>Project Atlas · 18 active runs</li>
                    <li>Design systems · 4 members</li>
                    <li>Operations · 12 open requests</li>
                </ul>
                <HbarAppUiButton tone="accent" onClick={() => onAction?.({variantId: spec.id, actionId: 'accept'})}>Accept
                    invitation</HbarAppUiButton></main>
        </div>
    </ActionSurfaceFrame>
}

function PasswordReset({spec, onAction}: AuthProps) {
    const [password, setPassword] = useState('');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-variant-13"><HbarAppUiToolbar
        title="Reset password" detail="Sessions affected by this change"/><label>New password<input type="password"
                                                                                                    value={password}
                                                                                                    onChange={(event) => setPassword(event.target.value)}/></label><label>Confirm
        password<input type="password"/></label><HbarAppUiStatus
        value={password.length >= 8 ? 'Passwords match' : 'Use at least 8 characters'}
        tone={password.length >= 8 ? 'positive' : 'warning'}/><HbarAppUiSpotlight><strong>Sessions that will
        end</strong><span><Monitor size={13}/>Chrome · Windows · now</span><span><Smartphone size={13}/>iPhone · yesterday</span></HbarAppUiSpotlight><HbarAppUiButton
        tone="accent" disabled={password.length < 8}
        onClick={() => onAction?.({variantId: spec.id, actionId: 'reset'})}>Reset
        password</HbarAppUiButton></ActionSurfaceFrame>
}

function SignInApproval({spec, onAction}: AuthProps) {
    const [decision, setDecision] = useState<'pending' | 'approved' | 'blocked'>('pending');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-variant-14"><HbarAppUiToolbar
        title="Sign-in approval" detail="Review this request before allowing it"/><HbarAppUiSpotlight><ShieldCheck
        size={19}/>
        <div><strong>New sign-in from Chrome</strong><small>Shenzhen · Windows · just now</small></div>
        <HbarAppUiStatus value={decision === 'pending' ? 'Pending' : decision}
                         tone={decision === 'approved' ? 'positive' : decision === 'blocked' ? 'danger' : 'warning'}/></HbarAppUiSpotlight>
        <div className="hbar-app-ui-auth-decision"><HbarAppUiButton tone="accent" disabled={decision !== 'pending'}
                                                                    onClick={() => {
                                                                        setDecision('approved');
                                                                        onAction?.({
                                                                            variantId: spec.id,
                                                                            actionId: 'approve'
                                                                        })
                                                                    }}><Check
            size={13}/>Approve</HbarAppUiButton><HbarAppUiButton tone="danger" disabled={decision !== 'pending'}
                                                                 onClick={() => {
                                                                     setDecision('blocked');
                                                                     onAction?.({variantId: spec.id, actionId: 'block'})
                                                                 }}>Block</HbarAppUiButton></div>
        <p>Recent activity · password changed 2d ago · MFA enabled</p></ActionSurfaceFrame>
}

export function Authentication({spec, onAction}: AuthProps) {
    switch (spec.variant) {
        case 1:
            return <SignInCard spec={spec} onAction={onAction}/>;
        case 2:
            return <ProviderFirst spec={spec} onAction={onAction}/>;
        case 3:
            return <QuoteSignIn spec={spec} onAction={onAction}/>;
        case 4:
            return <TwoStep spec={spec} onAction={onAction}/>;
        case 5:
            return <MagicLink spec={spec} onAction={onAction}/>;
        case 6:
            return <CodeEntry spec={spec} onAction={onAction}/>;
        case 7:
            return <SignUp spec={spec} onAction={onAction}/>;
        case 8:
            return <EnterpriseSso spec={spec} onAction={onAction}/>;
        case 9:
            return <Passkey spec={spec} onAction={onAction}/>;
        case 10:
            return <AccountChooser spec={spec} onAction={onAction}/>;
        case 11:
            return <WorkspacePicker spec={spec} onAction={onAction}/>;
        case 12:
            return <Invitation spec={spec} onAction={onAction}/>;
        case 13:
            return <PasswordReset spec={spec} onAction={onAction}/>;
        case 14:
            return <SignInApproval spec={spec} onAction={onAction}/>;
        default:
            return <SignInCard spec={spec} onAction={onAction}/>
    }
}
