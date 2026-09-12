import { Component, type ReactNode } from 'react'

export default class RendererBoundary extends Component<
  { children: ReactNode; source: string; fallback?: ReactNode },
  { error: boolean }
> {
  state = { error: false }

  static getDerivedStateFromError() {
    return { error: true }
  }

  render() {
    return this.state.error ? (this.props.fallback ?? <pre>{this.props.source}</pre>) : this.props.children
  }
}
