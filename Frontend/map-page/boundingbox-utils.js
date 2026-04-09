// Small helper for the bounding-box feature.
// I pulled this out into its own file so the logic is easy to test by itself.

export function polygonFromCorners(a, b) {
  const west = Math.min(a.lng, b.lng);
  const east = Math.max(a.lng, b.lng);
  const south = Math.min(a.lat, b.lat);
  const north = Math.max(a.lat, b.lat);

  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [[
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ]],
    },
  };
}
