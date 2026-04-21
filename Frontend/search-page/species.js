import { getSpecies } from '../shared/bruchindb-api.js';
import { CONFIG } from '../shared/config.js';

// Get species ID from URL
const params = new URLSearchParams(window.location.search);
const speciesId = params.get('id');
const from = params.get('from');
const breadcrumbEnabled = from === 'search' || from === 'species' || sessionStorage.getItem('breadcrumbActive') === 'true';
const breadcrumbEl = document.getElementById('breadcrumb');
const breadcrumbCurrentEl = document.getElementById('breadcrumb-current');
let currentSpeciesData = null;

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

function showBreadcrumb() {
  if (!breadcrumbEl) return;
  breadcrumbEl.hidden = false;
}

function renderSpeciesBreadcrumb(s) {
  if (!breadcrumbCurrentEl) return;
  breadcrumbCurrentEl.textContent = s.Full_name;
  showBreadcrumb();
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
    if (breadcrumbEnabled && (from === 'search' || from === 'species')) {
      sessionStorage.setItem('breadcrumbActive', 'true');
    }
    renderSpecies(species);
  } catch (err) {
    console.error('Failed to load species:', err);
    titleEl.textContent = 'Error loading species';
    subtitleEl.textContent = err.message;
  }
}

function renderSpecies(s) {
  currentSpeciesData = s;
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
  if (breadcrumbEnabled) {
    renderSpeciesBreadcrumb(s);
  }
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

  if (tabbedView) {
    renderImagesGrouped(container);
  } else {
    renderImagesHero(container);
  }
}

function renderImagesHero(container) {
  container.innerHTML = `
    <div class="image-hero" data-img-index="0">
      <img src="${lightboxImages[0].url}" alt="${escapeHtml(lightboxImages[0].category)}" loading="lazy" onerror="this.src='./seed_beetle_logo_transparent.png'" />
      <div class="image-hero-caption">${escapeHtml(lightboxImages[0].category)}</div>
    </div>
    ${lightboxImages.length > 1 ? `
      <div class="image-thumbstrip">
        ${lightboxImages.map((img, idx) => `
          <div class="image-thumb ${idx === 0 ? 'is-active' : ''}" data-img-index="${idx}">
            <img src="${img.url}" alt="${escapeHtml(img.category)}" loading="lazy" onerror="this.src='./seed_beetle_logo_transparent.png'" />
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;

  container.querySelectorAll('.image-thumb').forEach((thumb) => {
    thumb.addEventListener('click', () => {
      const idx = parseInt(thumb.dataset.imgIndex, 10);
      const hero = container.querySelector('.image-hero');
      const heroImg = hero.querySelector('img');
      const heroCaption = hero.querySelector('.image-hero-caption');
      hero.dataset.imgIndex = idx;
      heroImg.src = lightboxImages[idx].url;
      heroCaption.textContent = lightboxImages[idx].category;
      container.querySelectorAll('.image-thumb').forEach((t) => t.classList.remove('is-active'));
      thumb.classList.add('is-active');
    });
  });

  container.querySelector('.image-hero').addEventListener('click', () => {
    const idx = parseInt(container.querySelector('.image-hero').dataset.imgIndex, 10);
    openLightbox(idx);
  });
}

function renderImagesGrouped(container) {
  const selectedAngles = new Set();

  const getAngle = (category) => {
    const parts = category.split(':');
    return parts.length > 1 ? parts.slice(1).join(':').trim() : category.trim();
  };

  const angles = [...new Set(lightboxImages.map((img) => getAngle(img.category)))].sort();

  function render() {
    container.innerHTML = `
      <div class="image-angle-controls">
        <select id="angle-select">
          <option value="">Add view filter...</option>
          ${angles.map((a) => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('')}
        </select>
        <div id="angle-chips" class="chip-list"></div>
      </div>
      <div class="image-filtered-grid">
        ${lightboxImages.map((img, idx) => `
          <figure class="image-tile" data-img-index="${idx}" data-angle="${escapeHtml(getAngle(img.category))}">
            <img src="${img.url}" alt="${escapeHtml(img.category)}" loading="lazy" onerror="this.src='./seed_beetle_logo_transparent.png'" />
            <figcaption>${escapeHtml(getAngle(img.category))}</figcaption>
          </figure>
        `).join('')}
      </div>
    `;

    const select = document.getElementById('angle-select');
    select.addEventListener('change', () => {
      if (!select.value) return;
      selectedAngles.add(select.value);
      select.value = '';
      updateOptions();
      renderChips();
      applyFilter();
    });

    container.querySelectorAll('.image-tile').forEach((tile) => {
      tile.addEventListener('click', () => {
        openLightbox(parseInt(tile.dataset.imgIndex, 10));
      });
    });

    renderChips();
  }

  function updateOptions() {
    const select = document.getElementById('angle-select');
    if (!select) return;
    const options = select.querySelectorAll('option');
    options.forEach((opt) => {
      if (opt.value) {
        opt.disabled = selectedAngles.has(opt.value);
      }
    });
  }

  function renderChips() {
    const chipsContainer = document.getElementById('angle-chips');
    if (!chipsContainer) return;
    if (selectedAngles.size === 0) {
      chipsContainer.innerHTML = '';
      return;
    }
    chipsContainer.innerHTML = [...selectedAngles].map((angle) => `
      <span class="chip">${escapeHtml(angle)}
        <button type="button" class="chip-x" data-angle="${escapeHtml(angle)}">×</button>
      </span>
    `).join('');
    chipsContainer.querySelectorAll('.chip-x').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedAngles.delete(btn.dataset.angle);
        updateOptions();
        renderChips();
        applyFilter();
      });
    });
  }

  function applyFilter() {
    container.querySelectorAll('.image-tile').forEach((tile) => {
      if (selectedAngles.size === 0 || selectedAngles.has(tile.dataset.angle)) {
        tile.style.display = '';
      } else {
        tile.style.display = 'none';
      }
    });
  }

  render();
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
  const container = document.getElementById('specimen-list');
  if (!container) return;
  if (!s.specimens.length) {
    container.innerHTML = `<p class="empty">No specimens recorded.</p>`;
    return;
  }

  // Add a count header
  container.innerHTML = `
    <div class="specimen-count">${s.specimens.length} specimen${s.specimens.length !== 1 ? 's' : ''} recorded</div>
  ` + s.specimens.map((sp) => {
    // Locality_with_date is the most meaningful field we have
    const loc = sp.locality_with_date || 'Unknown locality';
    // Stored (museum) is secondary info
    const museum = sp.stored || '';

    return `
      <div class="specimen-row" data-href="./specimen.html?id=${encodeURIComponent(sp.id)}">
        <div class="specimen-row-left">
          <div class="specimen-row-main">${escapeHtml(loc)}</div>
          ${museum ? `<div class="specimen-row-sub">${escapeHtml(museum)}</div>` : ''}
        </div>
        <span class="specimen-row-arrow">›</span>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.specimen-row').forEach((row) => {
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

      const localityName = props.locality || '';
      const matchingSpecimens = (currentSpeciesData?.specimens || []).filter((sp) =>
        sp.locality_with_date && localityName && sp.locality_with_date.includes(localityName)
      );

      const popupHtml = `
        <div class="map-popup">
          <div class="popup-header">
            <strong>${escapeHtml(props.name)}</strong>
          </div>
          <div class="popup-stats">
            ${props.coordinates ? `<div class="popup-coords">${escapeHtml(props.coordinates)}</div>` : ''}
            <div>${props.eventCount} event${props.eventCount !== 1 ? 's' : ''} · ${matchingSpecimens.length} specimen${matchingSpecimens.length !== 1 ? 's' : ''}</div>
          </div>
          ${matchingSpecimens.length > 0 ? `
            <div class="popup-specimens">
              <div class="popup-specimens-header">${matchingSpecimens.length} specimen${matchingSpecimens.length !== 1 ? 's' : ''}</div>
              ${matchingSpecimens.map((sp) => `
                <a class="popup-specimen-row" href="./specimen.html?id=${encodeURIComponent(sp.id)}">
                  ${escapeHtml(sp.locality_with_date || 'Specimen')}
                  <span class="popup-specimen-arrow">›</span>
                </a>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;

      const popup = new maplibregl.Popup({ maxWidth: '280px' })
        .setLngLat(coords)
        .setHTML(popupHtml)
        .addTo(mapInstance);

      // Center the map on the clicked marker
      mapInstance.flyTo({
        center: coords,
        duration: 300,
      });

      setTimeout(() => {
        const popupEl = popup.getElement();
        if (popupEl) {
          const popupRect = popupEl.getBoundingClientRect();
          const mapRect = mapInstance.getContainer().getBoundingClientRect();
          
          let offsetX = 0;
          let offsetY = 0;
          const padding = 20;

          if (popupRect.top < mapRect.top + padding) {
            offsetY = mapRect.top - popupRect.top + padding;
          }
          if (popupRect.bottom > mapRect.bottom - padding) {
            offsetY = mapRect.bottom - popupRect.bottom - padding;
          }
          if (popupRect.left < mapRect.left + padding) {
            offsetX = mapRect.left - popupRect.left + padding;
          }
          if (popupRect.right > mapRect.right - padding) {
            offsetX = mapRect.right - popupRect.right - padding;
          }

          if (offsetX !== 0 || offsetY !== 0) {
            mapInstance.panBy([-offsetX, -offsetY], { duration: 300 });
          }
        }
      }, 50);
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

// View toggle: columns vs tabs
const viewToggle = document.getElementById('viewToggle');
let tabbedView = sessionStorage.getItem('speciesViewMode') === 'tabbed';

function applyViewMode() {
  const columns = document.querySelector('.species-columns');
  const eventsSection = document.getElementById('events');
  const tabsNav = document.querySelector('.species-tabs');

  if (tabbedView) {
    // Switch to single column, tabbed
    if (columns) {
      columns.style.display = 'block';
      columns.classList.add('tabbed-mode');
    }
    if (tabsNav) tabsNav.style.display = '';

    // Hide everything, show only active tab
    const allPanels = document.querySelectorAll('.panel-card[id]');
    allPanels.forEach((panel) => {
      panel.style.display = 'none';
    });

    const currentTab = new URLSearchParams(window.location.search).get('tab') || 'taxon';
    const activePanel = document.getElementById(currentTab);
    if (activePanel) activePanel.style.display = '';

    // Update tab buttons
    document.querySelectorAll('.species-tabs .tab-btn').forEach((b) => {
      b.classList.remove('is-active');
      b.setAttribute('aria-selected', 'false');
    });
    const activeBtn = document.querySelector(`.species-tabs .tab-btn[data-tab="${currentTab}"]`);
    if (activeBtn) {
      activeBtn.classList.add('is-active');
      activeBtn.setAttribute('aria-selected', 'true');
    }

    // Hide column wrappers but keep panels accessible
    document.querySelector('.species-col-left')?.style.setProperty('display', 'contents');
    document.querySelector('.species-col-right')?.style.setProperty('display', 'contents');

    if (currentSpeciesData) renderImages(currentSpeciesData);
    if (viewToggle) viewToggle.textContent = 'Switch to overview';
    if (currentTab === 'map-panel' && mapInstance) setTimeout(() => mapInstance.resize(), 100);
  } else {
    // Switch to two-column overview
    if (columns) {
      columns.style.display = '';
      columns.classList.remove('tabbed-mode');
    }
    if (tabsNav) tabsNav.style.display = 'none';

    // Show everything
    document.querySelectorAll('.panel-card[id]').forEach((panel) => {
      panel.style.display = '';
    });

    // Restore column wrappers
    document.querySelector('.species-col-left')?.style.setProperty('display', '');
    document.querySelector('.species-col-right')?.style.setProperty('display', '');

    // Show events
    if (eventsSection) eventsSection.style.display = '';

    if (currentSpeciesData) renderImages(currentSpeciesData);
    if (viewToggle) viewToggle.textContent = 'Switch to tabbed view';
    if (mapInstance) setTimeout(() => mapInstance.resize(), 100);
  }
}

if (viewToggle) {
  viewToggle.addEventListener('click', () => {
    tabbedView = !tabbedView;
    sessionStorage.setItem('speciesViewMode', tabbedView ? 'tabbed' : 'columns');
    applyViewMode();
  });
}

// Tab click handlers (work in tabbed mode)
document.querySelectorAll('.species-tabs .tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!tabbedView) return;
    const target = btn.dataset.tab;

    // Update buttons
    document.querySelectorAll('.species-tabs .tab-btn').forEach((b) => {
      b.classList.remove('is-active');
      b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('is-active');
    btn.setAttribute('aria-selected', 'true');

    // Hide all panels, show target
    document.querySelectorAll('.panel-card[id]').forEach((panel) => {
      panel.style.display = 'none';
    });
    const panel = document.getElementById(target);
    if (panel) panel.style.display = '';

    if (target === 'map-panel' && mapInstance) {
      setTimeout(() => mapInstance.resize(), 50);
    }

    const url = new URL(window.location);
    url.searchParams.set('tab', target);
    history.replaceState(null, '', url);
    sessionStorage.setItem('lastSpeciesTab:' + speciesId, target);
  });
});

// Apply saved view mode
applyViewMode();

loadSpecies();