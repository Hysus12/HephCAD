import { useEffect, useRef } from 'react'
import { documentController, services } from '../app/services.ts'
import { Viewport } from '../viewport/Viewport.ts'

export function ViewportCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const viewport = new Viewport(container)
    viewport.extrudeCommitHandler = (draft) => documentController.apply(draft)
    services.viewport = viewport
    return () => {
      if (services.viewport === viewport) services.viewport = null
      viewport.dispose()
    }
  }, [])

  return <div ref={containerRef} className="viewport-canvas" />
}
