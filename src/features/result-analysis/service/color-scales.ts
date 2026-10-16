/**
 * Variable-specific color scale configurations for meteorological data visualization.
 *
 * Color schemes follow meteorological conventions:
 * - Temperature: Blue (cold) → White → Red (hot)
 * - Pressure: Purple → White → Orange
 * - Precipitation: White → Blue → Deep Blue
 */

export type Variable = 'temperature' | 'pressure' | 'precipitation' | 'wind'

export interface ColorScale {
  type: 'sequential' | 'diverging'
  colors: string[]
  description: string
}

/**
 * Get the color scale configuration for a specific variable's absolute field.
 * Absolute fields show the actual measured/modeled values.
 */
export function getAbsoluteColorScale(variable: Variable): ColorScale {
  switch (variable) {
    case 'temperature':
      return {
        type: 'diverging',
        colors: ['#2563eb', '#93c5fd', '#ffffff', '#fca5a5', '#dc2626'],
        description: 'Blue (cold) → White → Red (hot)',
      }
    case 'pressure':
      return {
        type: 'sequential',
        colors: ['#9333ea', '#c084fc', '#ffffff', '#fb923c', '#ea580c'],
        description: 'Purple → White → Orange',
      }
    case 'precipitation':
      return {
        type: 'sequential',
        colors: ['#ffffff', '#7dd3fc', '#0ea5e9', '#0369a1', '#0c4a6e'],
        description: 'White → Blue → Deep Blue',
      }
    case 'wind':
      return {
        type: 'sequential',
        colors: ['#ffffff', '#86efac', '#22c55e', '#15803d', '#14532d'],
        description: 'White → Green → Dark Green',
      }
  }
}

/**
 * Get the diverging color scale for difference maps (downscaled - original).
 * Always uses a symmetric scale centered at zero.
 */
export function getDifferenceColorScale(): ColorScale {
  return {
    type: 'diverging',
    colors: ['#0c4a6e', '#0ea5e9', '#e0f2fe', '#ffffff', '#fef2f2', '#f87171', '#991b1b'],
    description: 'Blue (negative) → White (zero) → Red (positive)',
  }
}

/**
 * Get the unit string for a variable.
 */
export function getVariableUnit(variable: Variable): string {
  switch (variable) {
    case 'temperature':
      return '°C'
    case 'pressure':
      return 'hPa'
    case 'precipitation':
      return 'mm'
    case 'wind':
      return 'm/s'
  }
}

/**
 * Get the display label for a variable.
 */
export function getVariableLabel(variable: Variable): string {
  switch (variable) {
    case 'temperature':
      return 'Temperature'
    case 'pressure':
      return 'Pressure (MSL)'
    case 'precipitation':
      return 'Precipitation (TP)'
    case 'wind':
      return 'Wind Speed'
  }
}
