import { useXRApp } from './store'
import type { GuideRequest } from './types'

/** Fired on window when the user presses "Ask the guide". detail: GuideRequest. The AI guide (other team) listens for this. */
export const ASK_GUIDE_EVENT = 'cosmic:ask-guide'
/** Fired on window when the user presses "Back to source image". detail: { body, hotspotId, observation }. Stub for the web viewer. */
export const BACK_TO_SOURCE_EVENT = 'cosmic:back-to-source'

export function askGuide(req: GuideRequest) {
  useXRApp.getState().setLastGuideRequest(req)
  window.dispatchEvent(new CustomEvent<GuideRequest>(ASK_GUIDE_EVENT, { detail: req }))
  useXRApp.getState().showToast('Question sent to the guide')
}

export function backToSource(body: string, hotspotId: string) {
  const { observation } = useXRApp.getState()
  window.dispatchEvent(new CustomEvent(BACK_TO_SOURCE_EVENT, { detail: { body, hotspotId, observation } }))
  useXRApp.getState().showToast('Back to source image: not connected yet')
}

export function onAskGuide(handler: (req: GuideRequest) => void): () => void {
  const fn = (e: Event) => handler((e as CustomEvent<GuideRequest>).detail)
  window.addEventListener(ASK_GUIDE_EVENT, fn)
  return () => window.removeEventListener(ASK_GUIDE_EVENT, fn)
}
