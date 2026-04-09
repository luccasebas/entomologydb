// TDD-style test for the bounding-box feature.
// Checking whether the helper function makes the right polygon shape.

import { polygonFromCorners } from './boundingbox-utils.js';

describe('polygonFromCorners', () => {
  // test checks if the function makes the correct rectangle when given two opposite corner points
  it('creates a closed rectangle from two opposite map corners', () => {
    const firstCorner = { lng: -70, lat: 18 };
    const secondCorner = { lng: -120, lat: -5 };

    // call the function and save the result
    const polygon = polygonFromCorners(firstCorner, secondCorner);

    // check if the returned polygon matches the exact shape we expect
    expect(polygon).toEqual({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-120, -5],
          [-70, -5],
          [-70, 18],
          [-120, 18],
          [-120, -5],
        ]],
      },
    });
  });

  it('returns the first point again at the end so the polygon is closed', () => {
    // A polygon should end where it started, otherwise the shape is incomplete.
    const polygon = polygonFromCorners(
      { lng: 10, lat: 20 },
      { lng: 30, lat: 40 },
    );

    // get the list of points from the polygon
    const ring = polygon.geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);   // these should be the same if the polygon is closed correctly
  });
});
