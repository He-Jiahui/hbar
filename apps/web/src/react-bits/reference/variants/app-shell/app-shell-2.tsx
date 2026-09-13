import type { ReferenceFixtureProps } from '../../reference-types'
import { Building2, ChevronsUpDown, Menu, Package, Palette, Receipt, Route, Truck } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './app-shell-2.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/app-shell/app-shell-2. */
export default function AppShell2(props: ReferenceFixtureProps) {
  const [active, setActive] = useState('All shipments')
  const shipments = [
    ['Halvorsen Cold Chain Logistics AB', 'KF-40218 · Newark → Montréal', '14 Mar', 'In transit', 'neutral'],
    ['Brightwater Foods', 'KF-40211 · Savannah → Atlanta', '13 Mar', 'Delivered', 'neutral'],
    ['Ardent Medical Supply', 'KF-40207 · Houston → El Paso', '14 Mar', 'Delayed', 'warning'],
    ['Corriveau Frères Distribution', 'KF-40233 · Detroit → Windsor', '15 Mar', 'Customs hold', 'warning'],
    ['Pinewood Building Products', 'KF-40199 · Portland → Boise', '12 Mar', 'Delivered', 'neutral'],
    ['Northgate Appliance', 'KF-40241 · Chicago → Omaha', '-', 'Awaiting pickup', 'neutral'],
    ['Lakeshore Beverage Co.', 'KF-40188 · Milwaukee → Fargo', '16 Mar', 'In transit', 'neutral'],
    ['Sable & Finch Furnishings', 'KF-40250 · Charlotte → Richmond', '15 Mar', 'Failed delivery', 'danger'],
    ['Tamarack Paper Mills', 'KF-40176 · Duluth → Sioux Falls', '13 Mar', 'Delivered', 'neutral'],
    ['Ridgeline Auto Parts', 'KF-40262 · Reno → Sacramento', '16 Mar', 'In transit', 'neutral'],
    ['Meridian Home Goods', 'KF-40255 · Tampa → Mobile', '17 Mar', 'Awaiting pickup', 'neutral'],
  ] as const
  const shipmentNav = [
    ['All shipments', '312'],
    ['In transit', '48'],
    ['Awaiting pickup', '12'],
    ['Delayed', '5'],
    ['Delivered', ''],
    ['Cancelled', ''],
  ] as const
  const savedViews = [
    'Northeast lane',
    'Reefer loads',
    'High-value cargo',
    'Missing paperwork',
    'Customs hold',
    'Weekend departures',
  ] as const
  const reference = ['Service map', 'Rate table', 'Documents', 'Exception log', 'Carrier directory', 'Archive'] as const
  return (
    <section
      className="rb-public-app-shell-2"
      onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}
    >
      <aside className="rb-shell-2-aside">
        <nav className="rb-shell-2-rail" aria-label="Areas">
          <button type="button" className="selected" aria-label="Shipments">
            <Package size={16} />
          </button>
          <button type="button" aria-label="Dispatch">
            <Route size={16} />
          </button>
          <button type="button" aria-label="Fleet">
            <Truck size={16} />
          </button>
          <button type="button" aria-label="Customers">
            <Building2 size={16} />
          </button>
          <button type="button" aria-label="Billing">
            <Receipt size={16} />
          </button>
          <button type="button" className="rb-shell-2-user" aria-label="Account">
            MK
          </button>
        </nav>
        <div className="rb-shell-2-workspace">
          <button type="button" className="rb-shell-2-workspace-switch">
            <span>K</span>
            <strong>
              Kestrel Freight<small>24 members</small>
            </strong>
            <ChevronsUpDown size={16} />
          </button>
          <div className="rb-shell-2-nav">
            <div>
              <p>SHIPMENTS</p>
              <ul>
                {shipmentNav.map(([label, count]) => (
                  <li key={label}>
                    <button
                      type="button"
                      className={active === label ? 'selected' : ''}
                      onClick={() => setActive(label)}
                    >
                      <span>{label}</span>
                      {count && <small>{count}</small>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p>SAVED VIEWS</p>
              <ul>
                {savedViews.map((label) => (
                  <li key={label}>
                    <button type="button" onClick={() => setActive(label)}>
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p>REFERENCE</p>
              <ul>
                {reference.map((label) => (
                  <li key={label}>
                    <button type="button">{label}</button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </aside>
      <main className="rb-shell-2-main">
        <header>
          <button type="button" className="rb-shell-2-menu" aria-label="Open navigation">
            <Menu size={16} />
          </button>
          <h1>Shipments</h1>
          <button type="button" className="rb-shell-2-new">
            New shipment
          </button>
        </header>
        <div className="rb-shell-2-content">
          <section className="rb-shell-2-list">
            <div className="rb-shell-2-list-head">
              <h2>{active === 'All shipments' ? 'All shipments' : active}</h2>
              <span>312</span>
            </div>
            <ul>
              {shipments.map(([name, route, date, status, tone]) => (
                <li key={name}>
                  <button type="button">
                    <span className="rb-shell-2-shipment-copy">
                      <strong>{name}</strong>
                      <small>{route}</small>
                    </span>
                    <span className="rb-shell-2-shipment-status">
                      <strong>{date}</strong>
                      <small className={tone}>
                        <i />
                        {status}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
      <button type="button" className="rb-shell-2-theme">
        <Palette size={16} />
        <span>Theme</span>
      </button>
    </section>
  )
}
