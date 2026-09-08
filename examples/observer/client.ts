import type { ClientPlugin } from '../../packages/ui-sdk/src/index'

export default {
  apply(api) {
    const { createElement: h, useState } = api.react
    api.registerPanel({
      id: 'interactive',
      title: 'Observer counter',
      placement: 'right',
      component() {
        const [count, setCount] = useState(0)
        return h(
          'div',
          {},
          h('h2', {}, String(api.config.greeting)),
          h(
            'button',
            { className: 'button', 'aria-label': 'Increment counter', onClick: () => setCount(count + 1) },
            '+',
          ),
          h('output', { style: { padding: '12px' } }, count),
        )
      },
    })
    api.registerRenderer('observer', ({ source }) => h('pre', { 'data-observer-renderer': true }, source.toUpperCase()))
  },
} satisfies ClientPlugin
