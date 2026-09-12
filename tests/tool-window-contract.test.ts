import { expect, test } from 'bun:test'
import { toolWindowContributionSchema, toolWindowDescriptorSchema } from '@hbar/contracts'

test('tool window descriptors normalize defaults and preserve allowed docks', () => {
  const descriptor = toolWindowDescriptorSchema.parse({ id: 'observer', title: 'Observer' })
  expect(descriptor.defaultDock).toBe('right')
  expect(descriptor.scope).toBe('global')
  expect(descriptor.canPopout).toBe(true)
  expect(descriptor.allowedDocks).toBeUndefined()
})

test('tool window descriptors reject an invalid default dock and duplicate targets', () => {
  expect(() => toolWindowDescriptorSchema.parse({
    id: 'observer',
    title: 'Observer',
    defaultDock: 'left',
    allowedDocks: ['right'],
  })).toThrow()
  expect(() => toolWindowDescriptorSchema.parse({
    id: 'observer',
    title: 'Observer',
    allowedDocks: ['right', 'right'],
  })).toThrow()
})

test('static contributions require content and cannot expose window without popout', () => {
  expect(() => toolWindowContributionSchema.parse({
    id: 'observer',
    title: 'Observer',
    kind: 'markdown',
    content: 'ok',
    allowedDocks: ['right', 'window'],
    canPopout: false,
  })).toThrow()
})

test('legacy static placement is normalized to the canonical default dock', () => {
  const contribution = toolWindowContributionSchema.parse({
    id: 'observer',
    title: 'Observer',
    placement: 'bottom',
    kind: 'markdown',
    content: 'ok',
  })
  expect(contribution.defaultDock).toBe('bottom')
  expect('placement' in contribution).toBe(false)
})
