import {Heart, Menu, Search, ShoppingBag, UserRound} from 'lucide-react'
import type {HbarAppUiNavbarCommerceContent} from './NavbarContent'
import {uniqueHbarAppUiNavbarItems} from './NavbarContent'
import {NavbarFrame, NavbarIconOnly, reportNavbarAction, type NavbarSurfaceProps} from './NavbarPrimitives'

export function CommerceNavbar({spec, onAction, content}: NavbarSurfaceProps & {readonly content: HbarAppUiNavbarCommerceContent}) {
    const products = uniqueHbarAppUiNavbarItems(content.products)
    return <NavbarFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-commerce">
        <header><p>{content.announcement}</p><div><NavbarIconOnly className="hbar-app-ui-navbar-commerce-menu" label={content.labels.menu} icon={Menu} tier="sm" onClick={() => reportNavbarAction(onAction, spec, 'menu')}/><strong>{content.brand}</strong><nav aria-label={content.brand}>{content.navItems.map((item, index) => <button type="button" key={`${index}-${item}`} onClick={() => reportNavbarAction(onAction, spec, 'navigate', item)}>{item}</button>)}</nav><span className="hbar-app-ui-navbar-commerce-actions"><NavbarIconOnly label={content.labels.search} icon={Search} tier="sm" onClick={() => reportNavbarAction(onAction, spec, 'search')}/><NavbarIconOnly label={content.labels.account} icon={UserRound} tier="sm" onClick={() => reportNavbarAction(onAction, spec, 'account')}/><span><NavbarIconOnly label={content.labels.wishlist} icon={Heart} tier="sm" onClick={() => reportNavbarAction(onAction, spec, 'wishlist')}/><i>{content.cartCount}</i></span><span><NavbarIconOnly label={content.labels.cart} icon={ShoppingBag} tier="sm" onClick={() => reportNavbarAction(onAction, spec, 'cart')}/><i>{content.cartCount}</i></span></span></div></header>
        <main data-hbar-app-ui-list-strategy={content.productStrategy.kind} data-hbar-app-ui-expected-maximum={content.productStrategy.expectedMaximum}>{products.map((product) => <article key={product.id}><i aria-hidden="true"/><button type="button" onClick={() => reportNavbarAction(onAction, spec, 'open', product.id)}><strong>{product.name}</strong><small>{product.price}</small></button></article>)}</main>
    </NavbarFrame>
}
