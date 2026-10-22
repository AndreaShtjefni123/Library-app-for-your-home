import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { BURN_FRAGMENT, BURN_VERTEX } from './burnShader'

export const WEBGL_BURN_MS = 2800
// The canvas is bigger than the cover so flames can rise above it: extra width on each side,
// room above for flames, a little below.
const PAD_X = 0.15
const PAD_TOP = 0.45
const PAD_BOTTOM = 0.05

export type BurnTexture = ImageBitmap | HTMLCanvasElement

interface BurnCanvasProps {
  /** The cover element being burnt (hidden once the first frame is drawn). */
  coverEl: HTMLElement
  /** Loads the cover picture to burn. */
  loadTexture: () => Promise<BurnTexture>
  onDone: () => void
  /** WebGL unavailable or something failed: use the simpler CSS fire instead. */
  onFallback: () => void
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader error')
  return shader
}

function program(gl: WebGLRenderingContext): WebGLProgram {
  const p = gl.createProgram()!
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, BURN_VERTEX))
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, BURN_FRAGMENT))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link error')
  return p
}

/** Realistic burning-paper fire over a cover, drawn on the graphics card. */
export function BurnCanvas({ coverEl, loadTexture, onDone, onFallback }: BurnCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const rect = useRef(coverEl.getBoundingClientRect()).current
  const width = rect.width * (1 + 2 * PAD_X)
  const height = rect.height * (1 + PAD_TOP + PAD_BOTTOM)
  const callbacks = useRef({ onDone, onFallback })
  callbacks.current = { onDone, onFallback }

  useEffect(() => {
    let raf = 0
    let stopped = false
    const canvas = ref.current!
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false })
    const fail = (): void => {
      if (stopped) return
      stopped = true
      coverEl.style.visibility = ''
      callbacks.current.onFallback()
    }
    if (!gl) {
      fail()
      return
    }

    ;(async () => {
      let img: BurnTexture
      let prog: WebGLProgram
      try {
        img = await loadTexture()
        if (stopped) return
        prog = program(gl)
      } catch {
        fail()
        return
      }
      gl.useProgram(prog)
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
      const pos = gl.getAttribLocation(prog, 'aPos')
      gl.enableVertexAttribArray(pos)
      gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)

      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)

      const u = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(prog, name)
      // Crop like CSS object-fit: cover.
      const imageAspect = img.width / img.height
      const boxAspect = rect.width / rect.height
      const sx = imageAspect > boxAspect ? boxAspect / imageAspect : 1
      const sy = imageAspect > boxAspect ? 1 : imageAspect / boxAspect
      gl.uniform4f(u('uTexXf'), sx, sy, (1 - sx) / 2, (1 - sy) / 2)
      gl.uniform4f(u('uCover'), PAD_X / (1 + 2 * PAD_X), PAD_BOTTOM / (1 + PAD_TOP + PAD_BOTTOM), 1 / (1 + 2 * PAD_X), 1 / (1 + PAD_TOP + PAD_BOTTOM))
      gl.uniform2f(u('uRes'), canvas.width, canvas.height)
      gl.uniform1f(u('uSeed'), Math.random() * 100)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)

      const start = performance.now()
      let first = true
      const frame = (now: number): void => {
        if (stopped) return
        const t = Math.min((now - start) / WEBGL_BURN_MS, 1)
        const progress = t * t * (3 - 2 * t)
        const fire = Math.min(t / 0.08, 1) * (1 - Math.max(0, (t - 0.85) / 0.15))
        gl.uniform1f(u('uProgress'), progress)
        gl.uniform1f(u('uTime'), (now - start) / 1000)
        gl.uniform1f(u('uFire'), fire)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        if (first) {
          // From now on the canvas draws the cover; hide the real one underneath.
          coverEl.style.visibility = 'hidden'
          first = false
        }
        if (t < 1) raf = requestAnimationFrame(frame)
        else {
          stopped = true
          callbacks.current.onDone()
        }
      }
      raf = requestAnimationFrame(frame)
    })()

    canvas.addEventListener('webglcontextlost', fail, { once: true })
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
    // Runs once per burn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return createPortal(
    <canvas
      ref={ref}
      aria-hidden="true"
      data-testid="burn-canvas"
      style={{
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: 45,
        left: rect.left - rect.width * PAD_X,
        top: rect.top - rect.height * PAD_TOP,
        width,
        height
      }}
    />,
    document.body
  )
}
