import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import type { ResultMapViewport } from '../types/result-map'
import { MAP_HEIGHT, MAP_WIDTH, panResultViewport } from '../service/result-map-geometry'

export function useResultMapCamera(
  viewport: ResultMapViewport,
  onChange: (viewport: ResultMapViewport) => void,
) {
  const drag = useRef<{
    x: number
    y: number
    viewport: ResultMapViewport
    pointerId: number
  } | null>(null)
  const zoom = (delta: number) =>
    onChange({ ...viewport, zoom: Math.max(0, Math.min(22, viewport.zoom + delta)) })
  const pan = (dx: number, dy: number) => onChange(panResultViewport(viewport, dx, dy))
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const offsets: Record<string, [number, number]> = {
      ArrowLeft: [40, 0],
      ArrowRight: [-40, 0],
      ArrowUp: [0, 40],
      ArrowDown: [0, -40],
    }
    const offset = offsets[event.key]
    if (offset) {
      event.preventDefault()
      pan(...offset)
    } else if (['+', '=', '-'].includes(event.key)) {
      event.preventDefault()
      zoom(event.key === '-' ? -0.5 : 0.5)
    }
  }
  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, viewport, pointerId: event.pointerId }
  }
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    const box = event.currentTarget.getBoundingClientRect()
    if (!box.width || !box.height) return
    onChange(
      panResultViewport(
        drag.current.viewport,
        ((event.clientX - drag.current.x) * MAP_WIDTH) / box.width,
        ((event.clientY - drag.current.y) * MAP_HEIGHT) / box.height,
      ),
    )
  }
  const endDrag = () => {
    drag.current = null
  }
  return {
    zoom,
    pan,
    onKeyDown,
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onLostPointerCapture: endDrag,
  }
}
