import { getSpecies } from '../shared/bruchindb-api.js';

// Get species ID from URL
const params = new URLSearchParams(window.location.search);
const speciesId = params.get('id');

// DOM references
const titleEl = document.querySelector('.species-title');
const subtitleEl = document.querySelector('.species-subtitle');

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function loadSpecies() {
  if (!speciesId) {
    titleEl.textContent = 'No species selected';
    subtitleEl.textContent = 'Go back and click a species card.';
    return;
  }

  // Try cache first
  const cached = sessionStorage.getItem('species:' + speciesId);
  if (cached) {
    try {
      const species = JSON.parse(cached);
      renderSpecies(species);
      return;
    } catch {}
  }

  titleEl.textContent = 'Loading...';
  subtitleEl.textContent = '';

  try {
    const species = await getSpecies(speciesId);
    if (species) {
      sessionStorage.setItem('species:' + speciesId, JSON.stringify(species));
    }
    if (!species) {
      titleEl.textContent = 'Species not found';
      subtitleEl.textContent = `ID: ${speciesId}`;
      return;
    }
    renderSpecies(species);
  } catch (err) {
    console.error('Failed to load species:', err);
    titleEl.textContent = 'Error loading species';
    subtitleEl.textContent = err.message;
  }
}

function renderSpecies(s) {
  // Hero
  titleEl.innerHTML = `<em>${escapeHtml(s.Full_name)}</em>`;
  if (s.Author) {
    titleEl.innerHTML += ` ${escapeHtml(s.Author)}${s.Year ? `, ${escapeHtml(s.Year)}` : ''}`;
  }
  const counts = [];
  if (s.specimens.length) counts.push(`${s.specimens.length} specimens`);
  if (s.events.length) counts.push(`${s.events.length} events`);
  if (s.images.length) counts.push(`${s.images.length} images`);
  subtitleEl.textContent = counts.join(' · ') || 'No records';

  renderTaxonomy(s);
  renderImages(s);
  renderSpecimens(s);
  renderEvents(s);
  renderHosts(s);
  renderMap(s);
}

function renderTaxonomy(s) {
  const grid = document.querySelector('#taxon .info-grid');
  if (!grid) return;
  grid.innerHTML = `
    <div class="info-item"><div class="info-label">Kingdom</div><div class="info-value">Animalia</div></div>
    <div class="info-item"><div class="info-label">Phylum</div><div class="info-value">Arthropoda</div></div>
    <div class="info-item"><div class="info-label">Class</div><div class="info-value">Insecta</div></div>
    <div class="info-item"><div class="info-label">Order</div><div class="info-value">Coleoptera</div></div>
    <div class="info-item"><div class="info-label">Family</div><div class="info-value">Chrysomelidae</div></div>
    <div class="info-item"><div class="info-label">Subfamily</div><div class="info-value">Bruchinae</div></div>
    <div class="info-item"><div class="info-label">Genus</div><div class="info-value"><em>${escapeHtml(s.Genus)}</em></div></div>
    <div class="info-item"><div class="info-label">Species</div><div class="info-value"><em>${escapeHtml(s.Species)}</em></div></div>
    ${s.Author ? `<div class="info-item"><div class="info-label">Author</div><div class="info-value">${escapeHtml(s.Author)}</div></div>` : ''}
    ${s.Year ? `<div class="info-item"><div class="info-label">Year</div><div class="info-value">${escapeHtml(s.Year)}</div></div>` : ''}
  `;
}

function renderImages(s) {
  const container = document.querySelector('#images .image-grid');
  if (!container) return;
  if (!s.images.length) {
    container.innerHTML = `<p class="empty">No images available for this species.</p>`;
    return;
  }
  container.innerHTML = s.images.map((img) => `
    <figure class="image-tile">
      <img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.category)}" onerror="this.src='./seed_beetle_logo_transparent.png'" />
      <figcaption>${escapeHtml(img.category)}</figcaption>
    </figure>
  `).join('');
}

function renderSpecimens(s) {
  const tbody = document.querySelector('#specimens .data-table tbody');
  if (!tbody) return;
  if (!s.specimens.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">No specimens recorded.</td></tr>`;
    return;
  }
  tbody.innerHTML = s.specimens.map((sp) => `
    <tr>
      <td>${escapeHtml(sp.id)}</td>
      <td>${escapeHtml(sp.stage_lot)}</td>
      <td></td>
      <td>${escapeHtml(sp.medium)}</td>
      <td></td>
      <td>${escapeHtml(sp.locality_with_date)}</td>
    </tr>
  `).join('');
}

function renderEvents(s) {
  const tbody = document.querySelector('#events .data-table tbody');
  if (!tbody) return;
  if (!s.events.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">No collection events recorded.</td></tr>`;
    return;
  }
  tbody.innerHTML = s.events.map((e) => `
    <tr>
      <td>${escapeHtml(e.country)}</td>
      <td>${escapeHtml(e.province)}</td>
      <td>${escapeHtml(e.locality)}</td>
      <td>${escapeHtml(e.elevation)}</td>
      <td>${escapeHtml(e.coordinates)}</td>
      <td>${escapeHtml(e.date)}</td>
      <td>${escapeHtml(e.collector)}</td>
    </tr>
  `).join('');
}

function renderHosts(s) {
  // No host plant section in current HTML — skip silently
}

let mapInstance = null;

function parseDMS(coordString) {
  // Parse strings like "10°12'N, 85°12'W" → { lat: 10.2, lng: -85.2 }
  if (!coordString) return null;
  const match = coordString.match(/(\d+)°(\d+)?'?([NS]),\s*(\d+)°(\d+)?'?([EW])/);
  if (!match) return null;
  const [, latDeg, latMin, latDir, lngDeg, lngMin, lngDir] = match;
  let lat = parseInt(latDeg, 10) + (parseInt(latMin || 0, 10) / 60);
  let lng = parseInt(lngDeg, 10) + (parseInt(lngMin || 0, 10) / 60);
  if (latDir === 'S') lat = -lat;
  if (lngDir === 'W') lng = -lng;
  return { lat, lng };
}

function renderMap(s) {
  const mapContainer = document.getElementById('species-map');
  const emptyMsg = document.getElementById('map-empty');
  if (!mapContainer) return;

  const points = (s.geolib || [])
    .map((g) => {
      const parsed = parseDMS(g.coordinates);
      if (!parsed) return null;
      return {
        ...parsed,
        name: [g.country, g.province, g.locality].filter(Boolean).join(', '),
      };
    })
    .filter(Boolean);

  if (points.length === 0) {
    mapContainer.style.display = 'none';
    emptyMsg.style.display = 'block';
    return;
  }

  mapContainer.style.display = 'block';
  emptyMsg.style.display = 'none';

  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }

  mapInstance = new maplibregl.Map({
    container: 'species-map',
    style: 'https://demotiles.maplibre.org/style.json',
    center: [points[0].lng, points[0].lat],
    zoom: 3,
  });

  mapInstance.on('load', async () => {
    // Load a custom red teardrop pin
    const pinSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
      <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 30 18 30s18-16.5 18-30C36 8.06 27.94 0 18 0z" fill="#d9534f" stroke="#fff" stroke-width="2"/>
      <circle cx="18" cy="18" r="7" fill="#fff"/>
    </svg>`;
    const pinImg = new Image(36, 48);
    pinImg.onload = () => {
      if (!mapInstance.hasImage('pin')) mapInstance.addImage('pin', pinImg);
      addLayers();
    };
    pinImg.src = 'data:image/svg+xml;base64,' + btoa(pinSvg);

    function addLayers() {
      const geojson = {
        type: 'FeatureCollection',
        features: points.map((p) => ({
          type: 'Feature',
          properties: { name: p.name },
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        })),
      };

      mapInstance.addSource('localities', {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterMaxZoom: 6,
        clusterRadius: 40,
      });

      // Cluster bubbles (red circles)
      mapInstance.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'localities',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#d9534f',
          'circle-radius': [
            'step', ['get', 'point_count'],
            18, 5,
            24, 15,
            30,
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });

      // Cluster count labels
      mapInstance.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'localities',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Noto Sans Regular'],
          'text-size': 14,
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#fff' },
      });

      // Individual unclustered pins
      mapInstance.addLayer({
        id: 'unclustered-point',
        type: 'symbol',
        source: 'localities',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': 'pin',
          'icon-size': 1,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
        },
      });

      // Click handlers
      mapInstance.on('click', 'clusters', (e) => {
        const features = mapInstance.queryRenderedFeatures(e.point, { layers: ['clusters'] });
        const clusterId = features[0].properties.cluster_id;
        mapInstance.getSource('localities').getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          mapInstance.easeTo({ center: features[0].geometry.coordinates, zoom });
        });
      });

      mapInstance.on('click', 'unclustered-point', (e) => {
        const coords = e.features[0].geometry.coordinates.slice();
        const name = e.features[0].properties.name;
        new maplibregl.Popup().setLngLat(coords).setText(name).addTo(mapInstance);
      });

      mapInstance.on('mouseenter', 'clusters', () => mapInstance.getCanvas().style.cursor = 'pointer');
      mapInstance.on('mouseleave', 'clusters', () => mapInstance.getCanvas().style.cursor = '');
      mapInstance.on('mouseenter', 'unclustered-point', () => mapInstance.getCanvas().style.cursor = 'pointer');
      mapInstance.on('mouseleave', 'unclustered-point', () => mapInstance.getCanvas().style.cursor = '');

      if (points.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        for (const p of points) bounds.extend([p.lng, p.lat]);
        mapInstance.fitBounds(bounds, { padding: 50, maxZoom: 6 });
      }
    }
  });
}

// Tab switcher (kept from your existing code)
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.remove("is-active");
      b.setAttribute("aria-selected", "false");
    });
    btn.classList.add("is-active");
    btn.setAttribute("aria-selected", "true");
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.remove("is-active");
    });
    document.getElementById(target).classList.add("is-active");
    // Map needs a resize when its container becomes visible
    if (target === 'map' && mapInstance) {
      setTimeout(() => mapInstance.resize(), 50);
    }
  });
});

loadSpecies();