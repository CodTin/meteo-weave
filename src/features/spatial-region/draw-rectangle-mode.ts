import MapboxDraw from '@mapbox/mapbox-gl-draw'

// Custom rectangle drawing mode for Mapbox GL Draw
// Allows users to draw a rectangle by clicking and dragging
const DrawRectangle: any = {
  ...MapboxDraw.modes.draw_polygon,

  onSetup(_opts: any) {
    const polygon = this.newFeature({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[]],
      },
    })

    this.addFeature(polygon)

    this.clearSelectedFeatures()
    this.updateUIClasses({ mouse: 'add' })
    this.activateUIButton('polygon')
    this.setActionableState({
      trash: true,
    })

    return {
      polygon,
      currentVertexPosition: 0,
    }
  },

  onMouseDown(state: any, e: any) {
    const startPoint = [e.lngLat.lng, e.lngLat.lat]
    state.startPoint = startPoint
    state.polygon.updateCoordinate('0.0', startPoint[0], startPoint[1])
    state.polygon.updateCoordinate('0.1', startPoint[0], startPoint[1])
    state.polygon.updateCoordinate('0.2', startPoint[0], startPoint[1])
    state.polygon.updateCoordinate('0.3', startPoint[0], startPoint[1])
    state.polygon.updateCoordinate('0.4', startPoint[0], startPoint[1])
  },

  onDrag(state: any, e: any) {
    if (!state.startPoint) return

    const endPoint = [e.lngLat.lng, e.lngLat.lat]
    const startPoint = state.startPoint

    // Create rectangle coordinates
    state.polygon.updateCoordinate('0.0', startPoint[0], startPoint[1])
    state.polygon.updateCoordinate('0.1', endPoint[0], startPoint[1])
    state.polygon.updateCoordinate('0.2', endPoint[0], endPoint[1])
    state.polygon.updateCoordinate('0.3', startPoint[0], endPoint[1])
    state.polygon.updateCoordinate('0.4', startPoint[0], startPoint[1])
  },

  onMouseUp(state: any, e: any) {
    if (!state.startPoint) return

    const endPoint = [e.lngLat.lng, e.lngLat.lat]
    const startPoint = state.startPoint

    // Only create rectangle if there's actual movement
    const hasMovement =
      Math.abs(endPoint[0] - startPoint[0]) > 0.0001 ||
      Math.abs(endPoint[1] - startPoint[1]) > 0.0001

    if (hasMovement) {
      // Finalize the rectangle
      this.map.fire('draw.create', {
        features: [state.polygon.toGeoJSON()],
      })
    }

    // Clean up
    this.deleteFeature([state.polygon.id], { silent: true })
    this.changeMode('simple_select')
  },

  toDisplayFeatures(_state: any, geojson: any, display: any) {
    display(geojson)
  },

  onStop(state: any) {
    this.updateUIClasses({ mouse: 'none' })
    this.activateUIButton()

    // Clean up if there's a leftover polygon
    if (state.polygon) {
      this.deleteFeature([state.polygon.id], { silent: true })
    }
  },

  onTrash(state: any) {
    this.deleteFeature([state.polygon.id], { silent: true })
    this.changeMode('simple_select')
  },

  onKeyUp(state: any, e: any) {
    if (e.keyCode === 27) {
      // Escape key
      this.deleteFeature([state.polygon.id], { silent: true })
      this.changeMode('simple_select')
    }
  },
}

export default DrawRectangle
