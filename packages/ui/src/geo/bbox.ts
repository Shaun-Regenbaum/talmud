/**
 * Point-in-bbox for GeoMap. Pure so the pan/zoom filter can be tested
 * without mounting the Solid map.
 *
 * The live view (`activeBbox`) and the original `props.bbox` diverge after
 * pan/zoom — filtering against the original hid markers that had entered
 * the viewport and kept ones that had left.
 */

export interface GeoBBox {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
}

export function inBBox(lng: number, lat: number, b: GeoBBox): boolean {
  return lng >= b.lonMin && lng <= b.lonMax && lat >= b.latMin && lat <= b.latMax;
}
