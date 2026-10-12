import { LumenButton } from '../primitives'
import { Heart, Menu, Search, ShoppingBag, UserRound, ChevronDown, Minus, Plus } from './glyphs'
import { type LumenNavbarCommerceContent, uniqueLumenNavbarItems } from './content'
import { NavbarPopup } from './menu'
import { NavbarNavigationOwner } from './navigation'
import {
  NavbarGlyph,
  NavbarFrame,
  NavbarIconOnly,
  type NavbarSurfaceProps,
  reportNavbarAction,
  NavbarButton,
} from './primitives'
import * as React from 'react'
import { LumenInput } from '../forms'
import { LumenDrawer, LumenPopover } from '../ui-controls'

function CommerceNavbarLegacy({
  spec,
  onAction,
  content,
}: NavbarSurfaceProps & {
  readonly content: LumenNavbarCommerceContent
}) {
  const products = uniqueLumenNavbarItems(content.products)
  return (
    <NavbarNavigationOwner
      navigation={content.navigation}
      items={content.navItems.map((label) => ({ id: label, label }))}
      menus={content.dropdowns}
      onChoose={(id, menuId) =>
        reportNavbarAction(
          onAction,
          spec,
          menuId ? 'navigate-menu' : 'navigate',
          menuId ? JSON.stringify([menuId, id]) : id,
        )
      }
    >
      {({ open, toggle }) => (
        <NavbarFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-commerce">
          <header>
            <p>{content.announcement}</p>
            <div>
              <NavbarIconOnly
                className="hbar-app-ui-navbar-commerce-menu"
                label={open && content.navigation ? content.navigation.close : content.labels.menu}
                data-navbar-navigation-trigger="true"
                aria-expanded={content.navigation ? open : undefined}
                icon={Menu}
                tier="sm"
                onClick={() => (content.navigation ? toggle() : reportNavbarAction(onAction, spec, 'menu'))}
              />
              <strong>{content.brand}</strong>
              <nav aria-label={content.brand}>
                {content.navItems.map((item, index) => {
                  const dropdown = content.dropdowns?.find((entry) => entry.label === item)
                  return dropdown ? (
                    <NavbarPopup
                      {...dropdown}
                      key={dropdown.id}
                      onChoose={(id) =>
                        reportNavbarAction(onAction, spec, 'navigate-menu', JSON.stringify([dropdown.id, id]))
                      }
                    >
                      <span>{item}</span>
                      <NavbarGlyph icon={ChevronDown} tier="xs" />
                    </NavbarPopup>
                  ) : (
                    <LumenButton
                      type="button"
                      key={`${index}-${item}`}
                      onClick={() => reportNavbarAction(onAction, spec, 'navigate', item)}
                    >
                      {item}
                    </LumenButton>
                  )
                })}
              </nav>
              <span className="hbar-app-ui-navbar-commerce-actions">
                <NavbarIconOnly
                  label={content.labels.search}
                  icon={Search}
                  tier="sm"
                  onClick={() => reportNavbarAction(onAction, spec, 'search')}
                />
                <NavbarIconOnly
                  label={content.labels.account}
                  icon={UserRound}
                  tier="sm"
                  onClick={() => reportNavbarAction(onAction, spec, 'account')}
                />
                <span>
                  <NavbarIconOnly
                    label={content.labels.wishlist}
                    icon={Heart}
                    tier="sm"
                    onClick={() => reportNavbarAction(onAction, spec, 'wishlist')}
                  />
                  <i className="hbar-app-ui-navbar-wishlist-marker" aria-hidden="true" />
                </span>
                <span>
                  <NavbarIconOnly
                    label={content.labels.cart}
                    icon={ShoppingBag}
                    tier="sm"
                    onClick={() => reportNavbarAction(onAction, spec, 'cart')}
                  />
                  <i>
                    {content.cartCount ??
                      content.labels.itemCount?.(
                        content.cartItems?.reduce((count, item) => count + item.initialQuantity, 0) ?? 0,
                      )}
                  </i>
                </span>
              </span>
            </div>
          </header>
          <main
            data-hbar-app-ui-list-strategy={content.productStrategy.kind}
            data-hbar-app-ui-expected-maximum={content.productStrategy.expectedMaximum}
          >
            {products.map((product) => (
              <article key={product.id}>
                <i aria-hidden="true" />
                <LumenButton type="button" onClick={() => reportNavbarAction(onAction, spec, 'open', product.id)}>
                  <strong>{product.name}</strong>
                  <small>{product.price}</small>
                </LumenButton>
              </article>
            ))}
          </main>
        </NavbarFrame>
      )}
    </NavbarNavigationOwner>
  )
}
;('use client')

type CommerceSurface = 'search' | 'wishlist' | 'cart' | null

function CommerceNavbarWorkflow({
  spec,
  onAction,
  content,
}: NavbarSurfaceProps & {
  readonly content: CommerceNavbarWorkflowContent
}) {
  const products = uniqueLumenNavbarItems(content.products)
  const cartItems = uniqueLumenNavbarItems(content.cartItems)
  const [activePanelId, setActivePanelId] = React.useState<string | null>(null)
  const [openSurface, setOpenSurface] = React.useState<CommerceSurface>(null)
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [quantities, setQuantities] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(cartItems.map((item) => [item.id, item.initialQuantity])),
  )
  const activePanel = content.megaPanels.find((panel) => panel.id === activePanelId)
  const wishlistProducts = products.filter((product) => content.wishlistIds.includes(product.id))
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const searchResults = products.filter(
    (product) => !normalizedQuery || product.name.toLocaleLowerCase().includes(normalizedQuery),
  )
  const activeCartItems = cartItems.filter((item) => (quantities[item.id] ?? 0) > 0)
  const cartCount = activeCartItems.reduce((total, item) => total + (quantities[item.id] ?? 0), 0)
  const subtotal = activeCartItems.reduce((total, item) => total + item.unitPrice * (quantities[item.id] ?? 0), 0)
  const toggleSurface = (surface: Exclude<CommerceSurface, null>) => {
    setOpenSurface((current) => (current === surface ? null : surface))
    setActivePanelId(null)
  }
  const updateQuantity = (id: string, change: number) => {
    setQuantities((current) => ({
      ...current,
      [id]: Math.max(0, (current[id] ?? 0) + change),
    }))
    reportNavbarAction(onAction, spec, 'cart-quantity', id)
  }
  const chooseCategory = (id: string) => {
    reportNavbarAction(onAction, spec, 'navigate', id)
    setActivePanelId(null)
    setMobileOpen(false)
  }
  return (
    <NavbarFrame spec={spec} className="hbar-app-ui-navbar-commerce">
      <header>
        <p>{content.announcement}</p>
        <div>
          <NavbarIconOnly
            className="hbar-app-ui-navbar-commerce-menu"
            label={content.labels.menu}
            icon={Menu}
            tier="sm"
            aria-expanded={mobileOpen}
            onClick={() => {
              setMobileOpen(true)
              setOpenSurface(null)
              setActivePanelId(null)
              reportNavbarAction(onAction, spec, 'menu')
            }}
          />
          <strong>{content.brand}</strong>
          <nav aria-label={content.brand}>
            {content.navItems.map((item, index) => {
              const panel = content.megaPanels.find((candidate) => candidate.trigger === item)
              return (
                <LumenButton
                  type="button"
                  variant="text"
                  key={`${index}-${item}`}
                  aria-expanded={panel ? activePanelId === panel.id : undefined}
                  onClick={() => {
                    if (panel) {
                      setActivePanelId((current) => (current === panel.id ? null : panel.id))
                      setOpenSurface(null)
                    } else {
                      chooseCategory(item)
                    }
                  }}
                >
                  {item}
                  {panel ? <NavbarGlyph icon={ChevronDown} tier="xs" /> : null}
                </LumenButton>
              )
            })}
          </nav>
          <span className="hbar-app-ui-navbar-commerce-actions">
            <NavbarIconOnly
              label={content.labels.search}
              icon={Search}
              tier="sm"
              aria-expanded={openSurface === 'search'}
              onClick={() => {
                toggleSurface('search')
                reportNavbarAction(onAction, spec, 'search')
              }}
            />
            <NavbarIconOnly
              label={content.labels.account}
              icon={UserRound}
              tier="sm"
              onClick={() => reportNavbarAction(onAction, spec, 'account')}
            />
            <span>
              <NavbarIconOnly
                label={content.labels.wishlist}
                icon={Heart}
                tier="sm"
                aria-expanded={openSurface === 'wishlist'}
                onClick={() => {
                  toggleSurface('wishlist')
                  reportNavbarAction(onAction, spec, 'wishlist')
                }}
              />
              <i>{wishlistProducts.length}</i>
            </span>
            <span>
              <NavbarIconOnly
                label={content.labels.cart}
                title={content.labels.itemCount(cartCount)}
                icon={ShoppingBag}
                tier="sm"
                aria-expanded={openSurface === 'cart'}
                onClick={() => {
                  toggleSurface('cart')
                  reportNavbarAction(onAction, spec, 'cart')
                }}
              />
              <i>{cartCount}</i>
            </span>
          </span>
        </div>
        <LumenPopover
          open={Boolean(activePanel)}
          label={content.labels.megaMenu}
          className="hbar-app-ui-navbar-commerce-mega"
        >
          {activePanel?.groups.map((group) => (
            <section key={group.id}>
              <p>{group.title}</p>
              {group.items.map((item) => (
                <NavbarButton key={item.id} onClick={() => chooseCategory(item.id)}>
                  {item.label}
                </NavbarButton>
              ))}
            </section>
          ))}
        </LumenPopover>
        <LumenPopover
          open={openSurface === 'search'}
          label={content.labels.searchTitle}
          className="hbar-app-ui-navbar-commerce-search"
        >
          <LumenInput
            type="search"
            value={searchQuery}
            aria-label={content.labels.search}
            placeholder={content.labels.searchPlaceholder}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
          />
          <div>
            {searchResults.length ? (
              searchResults.map((product) => (
                <NavbarButton
                  key={product.id}
                  onClick={() => {
                    reportNavbarAction(onAction, spec, 'open', product.id)
                    setOpenSurface(null)
                  }}
                >
                  <span>{product.name}</span>
                  <small>{product.price}</small>
                </NavbarButton>
              ))
            ) : (
              <p>{content.labels.noSearchResults}</p>
            )}
          </div>
        </LumenPopover>
        <LumenPopover
          open={openSurface === 'wishlist'}
          label={content.labels.wishlistTitle}
          className="hbar-app-ui-navbar-commerce-wishlist"
        >
          {wishlistProducts.length ? (
            wishlistProducts.map((product) => (
              <NavbarButton key={product.id} onClick={() => chooseCategory(product.id)}>
                <span>{product.name}</span>
                <small>{product.price}</small>
              </NavbarButton>
            ))
          ) : (
            <p>{content.labels.wishlistEmpty}</p>
          )}
        </LumenPopover>
        <LumenPopover
          open={openSurface === 'cart'}
          label={content.labels.cartTitle}
          className="hbar-app-ui-navbar-commerce-cart"
        >
          {activeCartItems.length ? (
            <React.Fragment>
              <ol>
                {activeCartItems.map((item) => (
                  <li key={item.id}>
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.price}</small>
                    </span>
                    <div>
                      <NavbarIconOnly
                        label={content.labels.decreaseQuantity(item.name)}
                        icon={Minus}
                        tier="xs"
                        onClick={() => updateQuantity(item.id, -1)}
                      />
                      <output>{quantities[item.id] ?? 0}</output>
                      <NavbarIconOnly
                        label={content.labels.increaseQuantity(item.name)}
                        icon={Plus}
                        tier="xs"
                        onClick={() => updateQuantity(item.id, 1)}
                      />
                    </div>
                  </li>
                ))}
              </ol>
              <footer>
                <span>
                  {content.labels.subtotal}
                  <strong>{content.formatPrice(subtotal)}</strong>
                </span>
                <LumenButton variant="solid" onClick={() => reportNavbarAction(onAction, spec, 'checkout')}>
                  {content.labels.checkout}
                </LumenButton>
              </footer>
            </React.Fragment>
          ) : (
            <p>{content.labels.emptyCart}</p>
          )}
        </LumenPopover>
      </header>
      <LumenDrawer
        open={mobileOpen}
        title={content.labels.mobileMenuTitle}
        closeLabel={content.labels.closeMenu}
        onClose={() => setMobileOpen(false)}
        className="hbar-app-ui-navbar-commerce-drawer"
      >
        <nav aria-label={content.labels.mobileMenuTitle}>
          {content.navItems.map((item, index) => (
            <NavbarButton key={`${index}-${item}`} onClick={() => chooseCategory(item)}>
              {item}
            </NavbarButton>
          ))}
          {content.megaPanels
            .flatMap((panel) => panel.groups)
            .map((group) => (
              <section key={group.id}>
                <p>{group.title}</p>
                {group.items.map((item) => (
                  <NavbarButton key={item.id} onClick={() => chooseCategory(item.id)}>
                    {item.label}
                  </NavbarButton>
                ))}
              </section>
            ))}
        </nav>
      </LumenDrawer>
      <main
        data-hbar-app-ui-list-strategy={content.productStrategy.kind}
        data-hbar-app-ui-expected-maximum={content.productStrategy.expectedMaximum}
      >
        {products.map((product) => (
          <article key={product.id}>
            <i aria-hidden="true" />
            <LumenButton
              type="button"
              variant="text"
              onClick={() => reportNavbarAction(onAction, spec, 'open', product.id)}
            >
              <strong>{product.name}</strong>
              <small>{product.price}</small>
            </LumenButton>
          </article>
        ))}
      </main>
    </NavbarFrame>
  )
}
export function CommerceNavbar(props: NavbarSurfaceProps & { readonly content: LumenNavbarCommerceContent }) {
  return hasCommerceWorkflow(props.content) ? (
    <CommerceNavbarWorkflow {...props} content={props.content} />
  ) : (
    <CommerceNavbarLegacy {...props} />
  )
}

interface CommerceNavbarWorkflowContent extends LumenNavbarCommerceContent {
  readonly megaPanels: NonNullable<LumenNavbarCommerceContent['megaPanels']>
  readonly wishlistIds: NonNullable<LumenNavbarCommerceContent['wishlistIds']>
  readonly cartItems: NonNullable<LumenNavbarCommerceContent['cartItems']>
  readonly formatPrice: NonNullable<LumenNavbarCommerceContent['formatPrice']>
  readonly labels: LumenNavbarCommerceContent['labels'] & {
    readonly megaMenu: NonNullable<LumenNavbarCommerceContent['labels']['megaMenu']>
    readonly searchTitle: NonNullable<LumenNavbarCommerceContent['labels']['searchTitle']>
    readonly searchPlaceholder: NonNullable<LumenNavbarCommerceContent['labels']['searchPlaceholder']>
    readonly noSearchResults: NonNullable<LumenNavbarCommerceContent['labels']['noSearchResults']>
    readonly wishlistTitle: NonNullable<LumenNavbarCommerceContent['labels']['wishlistTitle']>
    readonly wishlistEmpty: NonNullable<LumenNavbarCommerceContent['labels']['wishlistEmpty']>
    readonly cartTitle: NonNullable<LumenNavbarCommerceContent['labels']['cartTitle']>
    readonly emptyCart: NonNullable<LumenNavbarCommerceContent['labels']['emptyCart']>
    readonly subtotal: NonNullable<LumenNavbarCommerceContent['labels']['subtotal']>
    readonly checkout: NonNullable<LumenNavbarCommerceContent['labels']['checkout']>
    readonly closeMenu: NonNullable<LumenNavbarCommerceContent['labels']['closeMenu']>
    readonly mobileMenuTitle: NonNullable<LumenNavbarCommerceContent['labels']['mobileMenuTitle']>
    readonly decreaseQuantity: NonNullable<LumenNavbarCommerceContent['labels']['decreaseQuantity']>
    readonly increaseQuantity: NonNullable<LumenNavbarCommerceContent['labels']['increaseQuantity']>
    readonly itemCount: NonNullable<LumenNavbarCommerceContent['labels']['itemCount']>
  }
}

function hasCommerceWorkflow(content: LumenNavbarCommerceContent): content is CommerceNavbarWorkflowContent {
  return (
    content.labels.megaMenu !== undefined &&
    content.labels.searchTitle !== undefined &&
    content.labels.searchPlaceholder !== undefined &&
    content.labels.noSearchResults !== undefined &&
    content.labels.wishlistTitle !== undefined &&
    content.labels.wishlistEmpty !== undefined &&
    content.labels.cartTitle !== undefined &&
    content.labels.emptyCart !== undefined &&
    content.labels.subtotal !== undefined &&
    content.labels.checkout !== undefined &&
    content.labels.closeMenu !== undefined &&
    content.labels.mobileMenuTitle !== undefined &&
    content.labels.decreaseQuantity !== undefined &&
    content.labels.increaseQuantity !== undefined &&
    content.labels.itemCount !== undefined &&
    content.megaPanels !== undefined &&
    content.wishlistIds !== undefined &&
    content.cartItems !== undefined &&
    content.formatPrice !== undefined
  )
}
