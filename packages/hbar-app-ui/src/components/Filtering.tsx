import {useState} from 'react'
import {Filter, Minus, Plus, Search, SlidersHorizontal, Star, X} from 'lucide-react'
import {HbarAppUiButton, HbarAppUiSpotlight, HbarAppUiStatus, HbarAppUiTabs, HbarAppUiToolbar} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type FilteringProps = HbarAppUiVariantProps

function ProductRail({spec, onAction}: FilteringProps) {
    const [price, setPrice] = useState(60);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-filter-variant-1"><HbarAppUiToolbar title="Product filters"
                                                                                          detail="Derived counts and swatches"/><HbarAppUiButton
        onClick={() => setPrice(60)}>Clear</HbarAppUiButton>
        <aside className="hbar-app-ui-filter-rail">
            <strong>Category</strong>{['All products', 'Workspace', 'Automation', 'Reports'].map((item, index) => <label
            key={item}><input type="checkbox"
                              defaultChecked={index === 0}/>{item}<small>{42 - index * 8}</small></label>)}<strong>Price</strong><input
            type="range" min="10" max="100" value={price}
            onChange={(event) => setPrice(Number(event.target.value))}/><span>Up to ${price}</span><strong>Finish</strong>
            <div className="hbar-app-ui-swatch-row"><i className="is-blue"/><i className="is-purple"/><i
                className="is-green"/><i className="is-orange"/></div>
        </aside>
    </ActionSurfaceFrame>
}

function FilterDrawer({spec, onAction}: FilteringProps) {
    const [open, setOpen] = useState(true);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-filter-variant-2"><HbarAppUiToolbar title="Filter drawer"
                                                                                          detail="Scrollable body · sticky result count"/><HbarAppUiButton
        onClick={() => setOpen((value) => !value)}><SlidersHorizontal
        size={13}/>{open ? 'Hide filters' : 'Show filters'}</HbarAppUiButton>{open &&
        <div className="hbar-app-ui-filter-drawer"><label>Search<input placeholder="Filter records"/></label><label>Status<select>
            <option>All statuses</option>
            <option>Running</option>
            <option>Blocked</option>
        </select></label><label>Owner<select>
            <option>Everyone</option>
            <option>My team</option>
        </select></label><HbarAppUiButton tone="accent" onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'filter',
            value: 'apply'
        })}>Apply filters</HbarAppUiButton></div>}
        <div className="hbar-app-ui-sticky-count">128 results <button type="button" onClick={() => onAction?.({
            variantId: spec.id,
            actionId: 'reset'
        })}>Reset</button></div>
    </ActionSurfaceFrame>
}

function QueryBuilder({spec, onAction}: FilteringProps) {
    const [rules, setRules] = useState([{field: 'Status', operator: 'is', value: 'Running'}]);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-filter-variant-3"><HbarAppUiToolbar title="Query builder"
                                                                                          detail="Editable chips drive the result table"/><HbarAppUiButton
        onClick={() => setRules((current) => [...current, {field: 'Owner', operator: 'is', value: 'My team'}])}><Plus
        size={13}/>Add rule</HbarAppUiButton>
        <div className="hbar-app-ui-query-chips">{rules.map((rule, index) => <span
            key={`${rule.field}-${index}`}><strong>{rule.field}</strong> {rule.operator} <b>{rule.value}</b><button
            type="button"
            onClick={() => setRules((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={11}/></button></span>)}</div>
        <div className="hbar-app-ui-query-results">{['Workspace sync', 'Agent queue', 'Review gate'].map((row) =>
            <HbarAppUiSpotlight key={row}><strong>{row}</strong><HbarAppUiStatus value="Running" tone="warning"/><small>Matched
                by current query</small></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function LogExplorer({spec, onAction}: FilteringProps) {
    const [level, setLevel] = useState('INFO');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-filter-variant-4"><HbarAppUiToolbar title="Log explorer"
                                                                                          detail="Severity · service · volume"/>
        <div className="hbar-app-ui-chip-row">{['DEBUG', 'INFO', 'WARN', 'ERROR'].map((item) => <HbarAppUiButton
            className={level === item ? 'is-selected' : ''} key={item} onClick={() => {
            setLevel(item);
            onAction?.({variantId: spec.id, actionId: 'filter', value: item})
        }}><Filter size={12}/>{item}</HbarAppUiButton>)}</div>
        <select aria-label="Service">
            <option>All services</option>
            <option>API gateway</option>
            <option>Worker pool</option>
        </select>
        <div className="hbar-app-ui-volume-histogram">{Array.from({length: 18}, (_, index) => <i
            style={{height: `${12 + ((index * 13) % 42)}px`}} key={index}/>)}</div>
        <div className="hbar-app-ui-log-lines"><code>10:24:18 {level} request
            completed</code><code>10:24:19 {level} worker acknowledged</code><code>10:24:20 {level} projection
            updated</code></div>
    </ActionSurfaceFrame>
}

function PropertySearch({spec, onAction}: FilteringProps) {
    const [beds, setBeds] = useState(2);
    const [baths, setBaths] = useState(1);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-filter-variant-5"><HbarAppUiToolbar title="Property search"
                                                                                          detail="Beds, baths, price and amenities"/><HbarAppUiButton
        tone="accent"
        onClick={() => onAction?.({variantId: spec.id, actionId: 'search', value: `${beds}:${baths}`})}><Search
        size={13}/>Search homes</HbarAppUiButton>
        <div className="hbar-app-ui-stepper-filters"><label>Bedrooms
            <div>
                <button type="button" onClick={() => setBeds(Math.max(0, beds - 1))}><Minus size={12}/></button>
                <b>{beds}</b>
                <button type="button" onClick={() => setBeds(beds + 1)}><Plus size={12}/></button>
            </div>
        </label><label>Bathrooms
            <div>
                <button type="button" onClick={() => setBaths(Math.max(0, baths - 1))}><Minus size={12}/></button>
                <b>{baths}</b>
                <button type="button" onClick={() => setBaths(baths + 1)}><Plus size={12}/></button>
            </div>
        </label></div>
        <label>Price range<input type="range" min="100" max="1000" defaultValue="640"/></label>
        <div className="hbar-app-ui-amenities"><span>Pet friendly</span><span>Parking</span><span>Workspace</span></div>
    </ActionSurfaceFrame>
}

function CandidateSearch({spec, onAction}: FilteringProps) {
    const [skills, setSkills] = useState<string[]>(['TypeScript']);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-filter-variant-6"><HbarAppUiToolbar title="Candidate search"
                                                                                          detail="Skill tokens · pay range · seniority"/>
        <div className="hbar-app-ui-token-input">{skills.map((skill) => <span key={skill}>{skill}
            <button type="button" onClick={() => setSkills((current) => current.filter((item) => item !== skill))}><X
                size={11}/></button></span>)}<input placeholder="Add skill" onKeyDown={(event) => {
            if (event.key === 'Enter' && event.currentTarget.value.trim()) {
                setSkills((current) => [...current, event.currentTarget.value.trim()]);
                event.currentTarget.value = '';
                onAction?.({variantId: spec.id, actionId: 'skill'})
            }
        }}/></div>
        <select aria-label="Seniority">
            <option>Any level</option>
            <option>Senior</option>
            <option>Staff</option>
        </select>
        <div className="hbar-app-ui-candidate-results">{['Avery Chen', 'Mina Patel', 'Jon Bell'].map((name, index) =>
            <HbarAppUiSpotlight key={name}><span className="hbar-app-ui-avatar">{name[0]}</span>
                <div><strong>{name}</strong><small>{index + 4} years · ${120 + index * 20}k</small></div>
                <HbarAppUiStatus value="Strong match" tone="positive"/></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function FacetBar({spec, onAction}: FilteringProps) {
    const [facet, setFacet] = useState('All')
    const assets = ['hero.png', 'notes.md', 'app.tsx', 'diagram.svg', 'report.csv', 'logo.png']
    const visibleAssets = assets.filter((item) => facet === 'All' || (facet === 'Images' && (item.endsWith('.png') || item.endsWith('.svg'))) || (facet === 'Code' && item.endsWith('.tsx')) || (facet === 'Documents' && (item.endsWith('.md') || item.endsWith('.csv'))))
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-filter-variant-7"><HbarAppUiToolbar title="Asset facets"
                                                                                          detail="Horizontal filters over a mixed grid"/>
        <div className="hbar-app-ui-facet-bar">{['All', 'Images', 'Documents', 'Code'].map((item) => <button
            type="button" className={facet === item ? 'is-selected' : ''} key={item}
            onClick={() => setFacet(item)}>{item}</button>)}</div>
        <div className="hbar-app-ui-mixed-asset-grid">{visibleAssets.map((asset) => <HbarAppUiSpotlight
            key={asset}><FileIcon name={asset}/><strong>{asset}</strong><small>Updated
            today</small></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function FileIcon({name}: { readonly name: string }) {
    return <span className="hbar-app-ui-file-icon">{name.split('.').pop()?.toUpperCase()}</span>
}

function FlightFilters({spec, onAction}: FilteringProps) {
    const [time, setTime] = useState('Any');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-filter-variant-8"><HbarAppUiToolbar title="Flight filters"
                                                                                          detail="Time and duration ranges"/><HbarAppUiTabs
        label="Departure" value={time}
        options={[{id: 'Any', label: 'Any time'}, {id: 'Morning', label: 'Morning'}, {id: 'Evening', label: 'Evening'}]}
        onChange={(value) => {
            setTime(value);
            onAction?.({variantId: spec.id, actionId: 'tabs', value})
        }}/>
        <div
            className="hbar-app-ui-flight-results">{['HB 201 · 08:30', 'HB 412 · 12:10', 'HB 803 · 19:45'].map((flight, index) =>
            <HbarAppUiSpotlight
                key={flight}><strong>{flight}</strong><small>{2 + index}h {index ? 'direct' : '1 stop'}</small><b>${128 + index * 42}</b><HbarAppUiButton
                onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'select',
                    value: flight
                })}>Select</HbarAppUiButton></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function CuisineFilters({spec, onAction}: FilteringProps) {
    const [rating, setRating] = useState(4);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-filter-variant-9"><HbarAppUiToolbar title="Cuisine search"
                                                                                          detail="Pills, ratings, price and diet"/>
        <div className="hbar-app-ui-cuisine-pills">{['All', 'Japanese', 'Italian', 'Mexican', 'Vegan'].map((item) =>
            <button type="button" key={item} onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'filter',
                value: item
            })}>{item}</button>)}</div>
        <div className="hbar-app-ui-rating-filter"><strong>Rating</strong>{[1, 2, 3, 4, 5].map((value) => <button
            type="button" className={value <= rating ? 'is-selected' : ''} key={value} onClick={() => setRating(value)}>
            <Star size={13}/></button>)}<span>{rating}+ stars</span></div>
        <div className="hbar-app-ui-price-level"><span>$</span><span>$$</span><span>$$$</span><span>$$$$</span></div>
    </ActionSurfaceFrame>
}

export function Filtering({spec, onAction}: FilteringProps) {
    switch (spec.variant) {
        case 1:
            return <ProductRail spec={spec} onAction={onAction}/>;
        case 2:
            return <FilterDrawer spec={spec} onAction={onAction}/>;
        case 3:
            return <QueryBuilder spec={spec} onAction={onAction}/>;
        case 4:
            return <LogExplorer spec={spec} onAction={onAction}/>;
        case 5:
            return <PropertySearch spec={spec} onAction={onAction}/>;
        case 6:
            return <CandidateSearch spec={spec} onAction={onAction}/>;
        case 7:
            return <FacetBar spec={spec} onAction={onAction}/>;
        case 8:
            return <FlightFilters spec={spec} onAction={onAction}/>;
        case 9:
            return <CuisineFilters spec={spec} onAction={onAction}/>;
        default:
            return <ProductRail spec={spec} onAction={onAction}/>
    }
}
