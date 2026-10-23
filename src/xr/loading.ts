import { DefaultLoadingManager } from 'three'
import { create } from 'zustand'

/**
 * Loading progress for the current scene: textures/models (three's DefaultLoadingManager) plus manual
 * tasks we register (site content, terrain height data, the first terrain mesh, shader warm-up).
 */
interface LoadingState {
  label: string
  active: boolean
  progress: number
  tasks: Record<string, boolean>
  managerTotal: number
  managerLoaded: number
  /** something went wrong (or is very slow): shown as a card with Retry instead of an empty scene */
  problem: Problem | null
  /** bumped by Retry: scenes remount and loaders try again */
  retry: number
  offline: boolean
}
export type Problem = { kind: 'offline' | 'failed' | 'slow'; what: string }
export const useLoading = create<LoadingState>(() => ({
  label: '',
  active: false,
  progress: 1,
  tasks: {},
  managerTotal: 0,
  managerLoaded: 0,
  problem: null,
  retry: 0,
  offline: typeof navigator !== 'undefined' && navigator.onLine === false,
}))
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useLoading.setState({ offline: false }))
  window.addEventListener('offline', () => useLoading.setState({ offline: true }))
}

function recompute() {
  const s = useLoading.getState()
  const taskIds = Object.keys(s.tasks)
  const total = taskIds.length + s.managerTotal
  const done = taskIds.filter((k) => s.tasks[k]).length + s.managerLoaded
  const progress = total === 0 ? 1 : done / total
  const problem = progress >= 1 && s.problem?.kind === 'slow' ? null : s.problem
  useLoading.setState({ progress, problem, active: progress < 1 && !problem })
}

// loaders start during React render (suspense), so store updates are deferred out of it
const later = (f: () => void) => queueMicrotask(f)

DefaultLoadingManager.onStart = (_url, loaded, total) => later(() => {
  useLoading.setState({ managerLoaded: loaded, managerTotal: total })
  recompute()
})
DefaultLoadingManager.onProgress = (_url, loaded, total) => later(() => {
  useLoading.setState({ managerLoaded: loaded, managerTotal: total })
  recompute()
})
DefaultLoadingManager.onLoad = () => {
  const s = useLoading.getState()
  useLoading.setState({ managerLoaded: s.managerTotal })
  recompute()
}
DefaultLoadingManager.onError = () => {
  const s = useLoading.getState()
  useLoading.setState({ managerLoaded: Math.min(s.managerTotal, s.managerLoaded + 1) })
  recompute()
}

/** Start tracking a new scene ("Preparing Victoria Crater…"). */
export function beginScene(label: string) {
  useLoading.setState({ label, tasks: {}, managerTotal: 0, managerLoaded: 0, active: true, progress: 0, problem: null })
}
export function beginTask(id: string) {
  const s = useLoading.getState()
  if (id in s.tasks) return
  useLoading.setState({ tasks: { ...s.tasks, [id]: false } })
  recompute()
}
export function endTask(id: string) {
  const s = useLoading.getState()
  useLoading.setState({ tasks: { ...s.tasks, [id]: true } })
  recompute()
}

/** Show a clear problem card (offline / failed / slow) instead of leaving an empty scene. */
export function reportProblem(kind: Problem['kind'], what?: string) {
  const s = useLoading.getState()
  if (s.problem && s.problem.kind !== 'slow') return
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  useLoading.setState({ problem: { kind: offline ? 'offline' : kind, what: what ?? s.label }, active: false })
}
/** Try the current scene again: remounts it so every loader retries. */
export function retryScene() {
  const s = useLoading.getState()
  useLoading.setState({ problem: null, retry: s.retry + 1 })
  beginScene(s.label)
  beginTask('scene')
}

// Debug handle in dev builds: window.__loading
if (import.meta.env.DEV) (window as unknown as { __loading: unknown }).__loading = { useLoading, reportProblem, retryScene }
