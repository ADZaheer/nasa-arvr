import type { Camera, WebGLRenderer } from 'three'

/**
 * The camera the user actually sees through. In a WebXR session that is the XR camera, which
 * <XROrigin> re-parents (so its world matrix includes where the player stands and how they turned);
 * R3F's default camera only gets the local head pose.
 */
export function viewCamera(gl: WebGLRenderer, camera: Camera): Camera {
  return gl.xr.isPresenting ? gl.xr.getCamera() : camera
}
