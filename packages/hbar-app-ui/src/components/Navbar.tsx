import type {HbarAppUiVariantProps} from '../types'
import {ActivityNavbar} from './navbar/ActivityNavbar'
import {AnalyticsNavbar} from './navbar/AnalyticsNavbar'
import {ArticleNavbar} from './navbar/ArticleNavbar'
import {CommerceNavbar} from './navbar/CommerceNavbar'
import {
    HbarAppUiNavbarProvider,
    useHbarAppUiNavbarContent,
    type HbarAppUiNavbarContent,
} from './navbar/NavbarContent'
import {DeploymentNavbar} from './navbar/DeploymentNavbar'
import {DocsNavbar} from './navbar/DocsNavbar'
import {DocumentNavbar} from './navbar/DocumentNavbar'
import {FilterNavbar} from './navbar/FilterNavbar'
import {LandingNavbar} from './navbar/LandingNavbar'
import {NavbarFrame} from './navbar/NavbarPrimitives'
import {PortfolioNavbar} from './navbar/PortfolioNavbar'
import {ProjectBoardNavbar} from './navbar/ProjectBoardNavbar'
import {TaskListNavbar} from './navbar/TaskListNavbar'
import './navbar/NavbarSurface.css'

export type HbarAppUiNavbarProps = HbarAppUiVariantProps & {
    /** Direct injection for a single mount; a provider supports catalog mounts. */
    readonly navbarContent?: HbarAppUiNavbarContent | undefined
}

export {HbarAppUiNavbarProvider}
export type {
    HbarAppUiNavbarActionLabelSet,
    HbarAppUiNavbarActivityContent,
    HbarAppUiNavbarActivityItem,
    HbarAppUiNavbarAnalyticsContent,
    HbarAppUiNavbarArticleContent,
    HbarAppUiNavbarCommerceContent,
    HbarAppUiNavbarContent,
    HbarAppUiNavbarDeploymentContent,
    HbarAppUiNavbarDeploymentStat,
    HbarAppUiNavbarDocumentContent,
    HbarAppUiNavbarDocsContent,
    HbarAppUiNavbarFilterContent,
    HbarAppUiNavbarFilterItem,
    HbarAppUiNavbarLandingContent,
    HbarAppUiNavbarListStrategy,
    HbarAppUiNavbarMetric,
    HbarAppUiNavbarPortfolioContent,
    HbarAppUiNavbarProduct,
    HbarAppUiNavbarProjectBoardContent,
    HbarAppUiNavbarProjectColumn,
    HbarAppUiNavbarProviderProps,
    HbarAppUiNavbarTaskListContent,
    HbarAppUiNavbarTaskRow,
} from './navbar/NavbarContent'
export {selectHbarAppUiNavbarItem, uniqueHbarAppUiNavbarItems} from './navbar/NavbarContent'

function emptyNavbarSurface({spec, onAction}: HbarAppUiVariantProps) {
    return <NavbarFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-empty">{null}</NavbarFrame>
}

/** Category dispatcher; each navbar pattern owns an independent TSX surface. */
export function Navbar({spec, onAction, navbarContent}: HbarAppUiNavbarProps) {
    const providerContent = useHbarAppUiNavbarContent()
    const content = navbarContent ?? providerContent

    switch (spec.variant) {
        case 1:
            return content?.projectBoard ? <ProjectBoardNavbar spec={spec} onAction={onAction} content={content.projectBoard}/>
                : emptyNavbarSurface({spec, onAction})
        case 2:
            return content?.taskList ? <TaskListNavbar spec={spec} onAction={onAction} content={content.taskList}/>
                : emptyNavbarSurface({spec, onAction})
        case 3:
            return content?.deployment ? <DeploymentNavbar spec={spec} onAction={onAction} content={content.deployment}/>
                : emptyNavbarSurface({spec, onAction})
        case 4:
            return content?.landingPrimary ? <LandingNavbar spec={spec} onAction={onAction} content={content.landingPrimary}/>
                : emptyNavbarSurface({spec, onAction})
        case 5:
            return content?.landingSecondary ? <LandingNavbar spec={spec} onAction={onAction} content={content.landingSecondary}/>
                : emptyNavbarSurface({spec, onAction})
        case 6:
            return content?.activity ? <ActivityNavbar spec={spec} onAction={onAction} content={content.activity}/>
                : emptyNavbarSurface({spec, onAction})
        case 7:
            return content?.analytics ? <AnalyticsNavbar spec={spec} onAction={onAction} content={content.analytics}/>
                : emptyNavbarSurface({spec, onAction})
        case 8:
            return content?.filterList ? <FilterNavbar spec={spec} onAction={onAction} content={content.filterList}/>
                : emptyNavbarSurface({spec, onAction})
        case 9:
            return content?.commerce ? <CommerceNavbar spec={spec} onAction={onAction} content={content.commerce}/>
                : emptyNavbarSurface({spec, onAction})
        case 10:
            return content?.docs ? <DocsNavbar spec={spec} onAction={onAction} content={content.docs}/>
                : emptyNavbarSurface({spec, onAction})
        case 11:
            return content?.document ? <DocumentNavbar spec={spec} onAction={onAction} content={content.document}/>
                : emptyNavbarSurface({spec, onAction})
        case 12:
            return content?.landingCentered ? <LandingNavbar spec={spec} onAction={onAction} content={content.landingCentered} centered/>
                : emptyNavbarSurface({spec, onAction})
        case 13:
            return content?.portfolio ? <PortfolioNavbar spec={spec} onAction={onAction} content={content.portfolio}/>
                : emptyNavbarSurface({spec, onAction})
        case 14:
            return content?.article ? <ArticleNavbar spec={spec} onAction={onAction} content={content.article}/>
                : emptyNavbarSurface({spec, onAction})
        default:
            return emptyNavbarSurface({spec, onAction})
    }
}
