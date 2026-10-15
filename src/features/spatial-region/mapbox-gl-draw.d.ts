declare module '@mapbox/mapbox-gl-draw' {
  import type { IControl, Map as MapboxMap, ControlPosition } from 'mapbox-gl'

  interface MapboxDrawOptions {
    displayControlsDefault?: boolean
    controls?: {
      point?: boolean
      line_string?: boolean
      polygon?: boolean
      trash?: boolean
      combine_features?: boolean
      uncombine_features?: boolean
    }
    modes?: Record<string, any>
    defaultMode?: string
    userProperties?: boolean
  }

  export default class MapboxDraw implements IControl {
    static modes: Record<string, any>

    constructor(options?: MapboxDrawOptions)
    onAdd(map: MapboxMap): HTMLElement
    onRemove(map: MapboxMap): void
    getDefaultPosition?(): ControlPosition
    changeMode(mode: string, options?: Record<string, unknown>): void
    getAll(): GeoJSON.FeatureCollection
    deleteAll(): void
  }
}
