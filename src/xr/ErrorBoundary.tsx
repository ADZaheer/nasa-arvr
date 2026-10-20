import { Component, type ReactNode } from 'react'

/** Renders `fallback` if a child throws (e.g. a texture or model fails to load). */
export class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: unknown) {
    console.warn('[xr] asset failed to load, using placeholder', err)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
