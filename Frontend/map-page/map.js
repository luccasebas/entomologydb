let bboxMode = false;
let firstCorner = null;
let bboxBtnEl = null;

const BBOX_SOURCE_ID = "user-bbox";
const BBOX_FILL_ID = "user-bbox-fill";
const BBOX_LINE_ID = "user-bbox-line";
const PANEL_WIDTH = 300;
const DEFAULT_PADDING = 160;

const map = new maplibregl.Map({
  container: "map",
  style: "./style.json",
  center: [-117.16, 32.71],
  zoom: 10
});

function fitBoundsWithPanel(bounds) {
  const panelOpen = document.querySelector(".page-shell")?.classList.contains("panel-open");

  map.fitBounds(bounds, {
    padding: {
      top: DEFAULT_PADDING,
      right: DEFAULT_PADDING,
      bottom: DEFAULT_PADDING,
      left: panelOpen ? PANEL_WIDTH + DEFAULT_PADDING : DEFAULT_PADDING
    }
  });
}

function ensureBboxLayers() {
  if (map.getSource(BBOX_SOURCE_ID)) return;

  map.addSource(BBOX_SOURCE_ID, {
    type: "geojson",
    data: {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[]]
      }
    }
  });

  map.addLayer({
    id: BBOX_FILL_ID,
    type: "fill",
    source: BBOX_SOURCE_ID,
    paint: {
      "fill-color": "#ff0000",
      "fill-opacity": 0.15
    }
  });

  map.addLayer({
    id: BBOX_LINE_ID,
    type: "line",
    source: BBOX_SOURCE_ID,
    paint: {
      "line-color": "#ff0000",
      "line-width": 2,
      "line-dasharray": [2, 2]
    }
  });
}

function clearBbox() {
  const src = map.getSource(BBOX_SOURCE_ID);
  if (!src) return;

  src.setData({
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [[]]
    }
  });
}

function polygonFromCorners(a, b) {
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
        [west, south]
      ]]
    }
  };
}

function setBboxPreview(a, b) {
  const src = map.getSource(BBOX_SOURCE_ID);
  if (!src) return;
  src.setData(polygonFromCorners(a, b));
}

function setBboxMode(on) {
  bboxMode = on;
  map.getCanvas().style.cursor = on ? "crosshair" : "";

  if (bboxBtnEl) {
    bboxBtnEl.classList.toggle("active", on);
  }

  if (!on) {
    firstCorner = null;
    map.dragPan.enable();
    map.doubleClickZoom.enable();
  } else {
    map.dragPan.disable();
    map.doubleClickZoom.disable();
  }
}

const nav = new maplibregl.NavigationControl({ visualizePitch: true });
map.addControl(nav, "top-right");

class BBoxControl {
  onAdd(mapInstance) {
    this.map = mapInstance;

    this.container = document.createElement("div");
    this.container.className = "maplibregl-ctrl maplibregl-ctrl-group bbox-ctrl";

    const bboxBtn = document.createElement("button");
    bboxBtn.type = "button";
    bboxBtn.className = "bbox-btn";
    bboxBtn.title = "Bounding box";
    bboxBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect
          x="5"
          y="6"
          width="14"
          height="12"
          rx="2"
          ry="2"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-dasharray="3 2"
        />
      </svg>
    `;

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "bbox-btn";
    clearBtn.title = "Clear bounding box";
    clearBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M6 6l12 12M18 6L6 18"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      </svg>
    `;

    bboxBtn.addEventListener("mousedown", (e) => e.stopPropagation());
    clearBtn.addEventListener("mousedown", (e) => e.stopPropagation());

    bboxBtnEl = bboxBtn;

    bboxBtn.addEventListener("click", (e) => {
      e.preventDefault();
      setBboxMode(!bboxMode);
    });

    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      clearBbox();
      setBboxMode(false);
    });

    this.container.appendChild(bboxBtn);
    this.container.appendChild(clearBtn);

    return this.container;
  }

  onRemove() {
    this.container.parentNode.removeChild(this.container);
    this.map = undefined;
  }
}

map.addControl(new BBoxControl(), "top-right");

map.on("load", () => {
  ensureBboxLayers();

  const navContainer = nav._container;

  if (!navContainer.querySelector(".maplibregl-ctrl-world")) {
    const worldBtn = document.createElement("button");
    worldBtn.type = "button";
    worldBtn.className = "maplibregl-ctrl-icon maplibregl-ctrl-world";
    worldBtn.title = "Zoom to world";
    worldBtn.innerHTML = `<img src="./assets/zoom-world.png" alt="Zoom to world">`;

    worldBtn.addEventListener("mousedown", (e) => e.stopPropagation());
    worldBtn.addEventListener("click", (e) => {
      e.preventDefault();
      setBboxMode(false);
      fitBoundsWithPanel([[-180, -85], [180, 85]]);
    });

    navContainer.appendChild(worldBtn);
  }
});

map.on("mousemove", (e) => {
  if (!bboxMode) return;
  if (!firstCorner) return;
  setBboxPreview(firstCorner, e.lngLat);
});

map.on("click", (e) => {
  if (!bboxMode) return;

  if (!firstCorner) {
    firstCorner = e.lngLat;
    setBboxPreview(firstCorner, firstCorner);
    return;
  }

  const secondCorner = e.lngLat;
  setBboxPreview(firstCorner, secondCorner);

  const west = Math.min(firstCorner.lng, secondCorner.lng);
  const east = Math.max(firstCorner.lng, secondCorner.lng);
  const south = Math.min(firstCorner.lat, secondCorner.lat);
  const north = Math.max(firstCorner.lat, secondCorner.lat);

  fitBoundsWithPanel([[west, south], [east, north]]);
  setBboxMode(false);
});