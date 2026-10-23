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
}
export const useLoading = create<LoadingState>(() => ({ label: '', active: false, progress: 1, tasks: {}, managerTotal: 0, managerLoaded: 0 }))

function recompute() {
  const s = useLoading.getState()
  const taskIds = Object.keys(s.tasks)
  const total = taskIds.length + s.managerTotal
  const done = taskIds.filter((k) => s.tasks[k]).length + s.managerLoaded
  const progress = total === 0 ? 1 : done / total
  useLoading.setState({ progress, active: progress < 1 })
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
  useLoading.setState({ label, tasks: {}, managerTotal: 0, managerLoaded: 0, active: true, progress: 0 })
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
