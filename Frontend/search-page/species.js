import { getSpecies } from '../shared/bruchindb-api.js';
import { CONFIG } from '../shared/config.js';

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
  const breadcrumbSpecies = document.getElementById('breadcrumb-species');
  if (breadcrumbSpecies) breadcrumbSpecies.textContent = s.Full_name;
  const breadcrumbNav = document.querySelector('.breadcrumbs');
  if (breadcrumbNav) breadcrumbNav.style.visibility = 'visible';

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

let lightboxImages = [];
let lightboxIndex = 0;

function renderImages(s) {
  const container = document.querySelector('#images .image-grid');
  if (!container) return;
  if (!s.images.length) {
    container.innerHTML = `<p class="empty">No images available for this species.</p>`;
    lightboxImages = [];
    return;
  }
  const proxyBase = CONFIG.fileMakerUrl + '/image/' + encodeURIComponent(s.Species_ID);
  lightboxImages = s.images.map((img, idx) => ({
    url: `${proxyBase}/${idx}`,
    category: img.category,
    caption: img.caption,
    source: img.source,
    copyright: img.copyright,
  }));
  container.innerHTML = lightboxImages.map((img, idx) => `
    <figure class="image-tile" data-img-index="${idx}">
      <img src="${img.url}" alt="${escapeHtml(img.category)}" loading="lazy" onerror="this.src='./seed_beetle_logo_transparent.png'" />
      <figcaption>
        ${escapeHtml(img.category)}
        ${img.copyright ? `<div class="image-credit">© ${escapeHtml(img.copyright)}</div>` : ''}
        ${img.source ? `<div class="image-source">${escapeHtml(img.source)}</div>` : ''}
      </figcaption>
    </figure>
  `).join('');

  // Wire up click handlers
  container.querySelectorAll('.image-tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      const idx = parseInt(tile.dataset.imgIndex, 10);
      openLightbox(idx);
    });
  });
}

function openLightbox(index) {
  if (!lightboxImages.length) return;
  lightboxIndex = index;
  renderLightbox();
}

function closeLightbox() {
  const overlay = document.querySelector('.lightbox-overlay');
  if (overlay) overlay.remove();
}

function renderLightbox() {
  closeLightbox();
  const img = lightboxImages[lightboxIndex];
  if (!img) return;

  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.innerHTML = `
    <div class="lightbox-content">
      <div class="lightbox-counter">${lightboxIndex + 1} / ${lightboxImages.length}</div>
      <button class="lightbox-close" aria-label="Close">×</button>
      ${lightboxImages.length > 1 ? `
        <button class="lightbox-nav lightbox-prev" aria-label="Previous">‹</button>
        <button class="lightbox-nav lightbox-next" aria-label="Next">›</button>
      ` : ''}
      <div class="lightbox-img-wrap">
        <img class="lightbox-img" src="${img.url}" alt="${escapeHtml(img.category)}" draggable="false" />
      </div>
      <div class="lightbox-caption">
        <div class="lightbox-caption-title">${escapeHtml(img.category)}</div>
        <div class="lightbox-caption-meta">
          ${img.caption ? escapeHtml(img.caption) : ''}
          ${img.copyright ? ` · © ${escapeHtml(img.copyright)}` : ''}
        </div>
      </div>
    </div>
  `;

  overlay.addEventListener('click', closeLightbox);
  overlay.querySelector('.lightbox-caption').addEventListener('click', (e) => e.stopPropagation());

  overlay.querySelector('.lightbox-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeLightbox();
  });

  const prevBtn = overlay.querySelector('.lightbox-prev');
  const nextBtn = overlay.querySelector('.lightbox-next');
  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
      renderLightbox();
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      lightboxIndex = (lightboxIndex + 1) % lightboxImages.length;
      renderLightbox();
    });
  }

  // Pan and zoom
  const imgWrap = overlay.querySelector('.lightbox-img-wrap');
  const lightboxImg = overlay.querySelector('.lightbox-img');
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  function applyTransform() {
    lightboxImg.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    lightboxImg.style.cursor = scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in';
  }

  // Prevent clicks on the image itself from closing the overlay
  imgWrap.addEventListener('click', (e) => e.stopPropagation());

  // Scroll wheel to zoom
  imgWrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.002;
    const newScale = Math.max(1, Math.min(5, scale + delta * scale));
    if (newScale === 1) {
      panX = 0;
      panY = 0;
    }
    scale = newScale;
    applyTransform();
  }, { passive: false });

  // Double click to toggle zoom
  lightboxImg.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (scale === 1) {
      scale = 2.5;
    } else {
      scale = 1;
      panX = 0;
      panY = 0;
    }
    applyTransform();
  });

  // Drag to pan
  lightboxImg.addEventListener('mousedown', (e) => {
    if (scale <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    dragStartX = e.clientX - panX;
    dragStartY = e.clientY - panY;
    applyTransform();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    panX = e.clientX - dragStartX;
    panY = e.clientY - dragStartY;
    applyTransform();
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      applyTransform();
    }
  });

  applyTransform();
  document.body.appendChild(overlay);
}

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (!document.querySelector('.lightbox-overlay')) return;
  if (e.key === 'Escape') closeLightbox();
  else if (e.key === 'ArrowLeft' && lightboxImages.length > 1) {
    lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
    renderLightbox();
  } else if (e.key === 'ArrowRight' && lightboxImages.length > 1) {
    lightboxIndex = (lightboxIndex + 1) % lightboxImages.length;
    renderLightbox();
  }
});

function renderSpecimens(s) {
  const tbody = document.querySelector('#specimens .data-table tbody');
  if (!tbody) return;
  if (!s.specimens.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty">No specimens recorded.</td></tr>`;
    return;
  }
  tbody.innerHTML = s.specimens.map((sp) => `
    <tr class="clickable-row" data-href="./specimen.html?id=${encodeURIComponent(sp.id)}">
      <td>${escapeHtml(sp.stage_lot)}</td>
      <td>${escapeHtml(sp.medium)}</td>
      <td>${escapeHtml(sp.locality_with_date)}</td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.clickable-row').forEach((row) => {
    row.addEventListener('click', () => {
      window.location.href = row.dataset.href;
    });
  });
}

function renderEvents(s) {
  const tbody = document.querySelector('#events .data-table tbody');
  if (!tbody) return;
  if (!s.events.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">No collection events recorded.</td></tr>`;
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
    </tr>
  `).join('');
}

function renderHosts(s) {
  // No host plant section in current HTML — skip silently
}

let mapInstance = null;

function parseDMS(coordString) {
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

  // Build rich location data by joining geolib + events + specimens
  const locationMap = {};

  // Start with geolib (has coordinates)
  for (const g of (s.geolib || [])) {
    const parsed = parseDMS(g.coordinates);
    if (!parsed) continue;
    const key = [g.country, g.province, g.locality].filter(Boolean).join(', ');
    if (!locationMap[key]) {
      locationMap[key] = {
        ...parsed,
        name: key,
        country: g.country,
        province: g.province,
        locality: g.locality,
        coordinates: g.coordinates,
        events: [],
        specimenCount: 0,
      };
    }
  }

  // Attach events to locations by matching locality name
  for (const e of (s.events || [])) {
    const key = [e.country, e.province, e.locality].filter(Boolean).join(', ');
    if (locationMap[key]) {
      locationMap[key].events.push({
        date: e.date,
        collector: e.collector,
        elevation: e.elevation,
      });
    }
  }

  // Count specimens per locality
  for (const sp of (s.specimens || [])) {
    const locStr = sp.locality_with_date || '';
    for (const key of Object.keys(locationMap)) {
      if (locStr.includes(locationMap[key].locality || '___NOMATCH___')) {
        locationMap[key].specimenCount++;
        break;
      }
    }
  }

  const points = Object.values(locationMap);

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

  mapInstance.on('load', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: points.map((p) => ({
        type: 'Feature',
        properties: {
          name: p.name,
          country: p.country,
          province: p.province,
          locality: p.locality,
          coordinates: p.coordinates,
          eventCount: p.events.length,
          specimenCount: p.specimenCount,
          events: JSON.stringify(p.events),
        },
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

    // Cluster bubbles
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

    // Individual pins
    mapInstance.addLayer({
      id: 'unclustered-point',
      type: 'circle',
      source: 'localities',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': '#d9534f',
        'circle-radius': 8,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
      },
    });

    // Click cluster to zoom and fit all children
    mapInstance.on('click', 'clusters', (e) => {
      const features = mapInstance.queryRenderedFeatures(e.point, { layers: ['clusters'] });
      const clusterId = features[0].properties.cluster_id;
      const source = mapInstance.getSource('localities');
      source.getClusterLeaves(clusterId, 100, 0, (err, leaves) => {
        if (err || !leaves || leaves.length === 0) {
          source.getClusterExpansionZoom(clusterId, (err2, zoom) => {
            if (err2) return;
            mapInstance.easeTo({ center: features[0].geometry.coordinates, zoom });
          });
          return;
        }
        const bounds = new maplibregl.LngLatBounds();
        for (const leaf of leaves) {
          bounds.extend(leaf.geometry.coordinates);
        }
        mapInstance.fitBounds(bounds, { padding: 60, maxZoom: 12 });
      });
    });

    // Click individual marker to show rich popup
    mapInstance.on('click', 'unclustered-point', (e) => {
      const props = e.features[0].properties;
      const coords = e.features[0].geometry.coordinates.slice();
      let events = [];
      try { events = JSON.parse(props.events); } catch {}

      let popupHtml = `
        <div class="map-popup">
          <div class="popup-header">
            <strong>${escapeHtml(props.name)}</strong>
          </div>
          <div class="popup-stats">
            ${props.coordinates ? `<div class="popup-coords">${escapeHtml(props.coordinates)}</div>` : ''}
            <div>${props.eventCount} collection event${props.eventCount !== 1 ? 's' : ''} · ${props.specimenCount} specimen${props.specimenCount !== 1 ? 's' : ''}</div>
          </div>
      `;

      if (events.length > 0) {
        popupHtml += `<div class="popup-events">`;
        for (const ev of events.slice(0, 5)) {
          popupHtml += `
            <div class="popup-event-row">
              <span class="popup-event-date">${escapeHtml(ev.date || 'No date')}</span>
              <span class="popup-event-collector">${escapeHtml(ev.collector || '')}</span>
              ${ev.elevation ? `<span class="popup-event-elev">${escapeHtml(ev.elevation)}</span>` : ''}
            </div>
          `;
        }
        if (events.length > 5) {
          popupHtml += `<div class="popup-event-more">+ ${events.length - 5} more events</div>`;
        }
        popupHtml += `</div>`;
      }

      popupHtml += `</div>`;

      new maplibregl.Popup({ maxWidth: '320px' })
        .setLngLat(coords)
        .setHTML(popupHtml)
        .addTo(mapInstance);
    });

    // Cursor changes
    mapInstance.on('mouseenter', 'clusters', () => mapInstance.getCanvas().style.cursor = 'pointer');
    mapInstance.on('mouseleave', 'clusters', () => mapInstance.getCanvas().style.cursor = '');
    mapInstance.on('mouseenter', 'unclustered-point', () => mapInstance.getCanvas().style.cursor = 'pointer');
    mapInstance.on('mouseleave', 'unclustered-point', () => mapInstance.getCanvas().style.cursor = '');

    // Fit bounds
    if (points.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      for (const p of points) bounds.extend([p.lng, p.lat]);
      mapInstance.fitBounds(bounds, { padding: 50, maxZoom: 6 });
    }
  });
}

function switchTab(tabName, pushState = true) {
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.remove("is-active");
    b.setAttribute("aria-selected", "false");
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.remove("is-active");
  });
  const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  const panel = document.getElementById(tabName);
  if (btn) {
    btn.classList.add("is-active");
    btn.setAttribute("aria-selected", "true");
  }
  if (panel) panel.classList.add("is-active");
  if (tabName === 'map' && mapInstance) {
    setTimeout(() => mapInstance.resize(), 50);
  }
  if (pushState) {
    const url = new URL(window.location);
    url.searchParams.set('tab', tabName);
    history.replaceState(null, '', url);
    sessionStorage.setItem('lastSpeciesTab:' + speciesId, tabName);
  }
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab);
  });
});

// Restore tab from URL on load
const initialTab = new URLSearchParams(window.location.search).get('tab');
if (initialTab) {
  switchTab(initialTab, false);
}

// View toggle: tabbed vs full page
const viewToggle = document.getElementById('viewToggle');
let showAll = false;

if (viewToggle) {
  viewToggle.addEventListener('click', () => {
    showAll = !showAll;
    viewToggle.textContent = showAll ? 'Show tabs' : 'Show all sections';

    if (showAll) {
      document.querySelector('.tabs').style.display = 'none';
      document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.add('show-all');
      });
      if (mapInstance) setTimeout(() => mapInstance.resize(), 200);
    } else {
      document.querySelector('.tabs').style.display = '';
      document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.remove('show-all');
      });
      const currentTab = new URLSearchParams(window.location.search).get('tab') || 'taxon';
      switchTab(currentTab, false);
    }
  });
}

loadSpecies();