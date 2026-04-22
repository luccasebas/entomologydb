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
let selectedLocality = null;

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

let specimenPage = 1;
const specimenFilterMedium = new Set();
const specimenFilterStored = new Set();
const specimenFilterCountry = new Set();
let specimenFilterHasImage = false;
let specimenFilterYearMin = '';
let specimenFilterYearMax = '';
const SPECIMENS_PER_PAGE = 10;

function renderSpecimens(s) {
  const container = document.getElementById('specimen-list');
  if (!container) return;

  const specimens = s.fullSpecimens || s.specimens || [];

  if (!specimens.length) {
    container.innerHTML = `<div class="empty-state"><p>No specimens recorded</p><p class="empty-hint">Specimen records will appear here as they are documented.</p></div>`;
    return;
  }

  // Collect unique values for dropdowns
  const mediums = [...new Set(specimens.map((sp) => sp.medium).filter(Boolean))].sort();
  const museums = [...new Set(specimens.map((sp) => sp.stored).filter(Boolean))].sort();
  const countries = [...new Set(specimens.map((sp) => {
    const loc = sp.locality_with_date || '';
    return loc.split(':')[0]?.trim() || null;
  }).filter(Boolean))].sort();

  // Extract years from locality_with_date for date filter
  const years = [...new Set(specimens.map((sp) => {
    const loc = sp.locality_with_date || '';
    const yearMatch = loc.match(/(\d{4})\s*$/);
    return yearMatch ? yearMatch[1] : null;
  }).filter(Boolean))].sort().reverse();

  // Apply all filters
  const filtered = specimens.filter((sp) => {
    if (specimenFilterMedium.size > 0 && !specimenFilterMedium.has(sp.medium)) return false;
    if (specimenFilterStored.size > 0 && !specimenFilterStored.has(sp.stored)) return false;
    if (specimenFilterCountry.size > 0) {
      const loc = sp.locality_with_date || '';
      const country = loc.split(':')[0]?.trim() || '';
      if (!specimenFilterCountry.has(country)) return false;
    }
    if (specimenFilterYearMin || specimenFilterYearMax) {
      const loc = sp.locality_with_date || '';
      const yearMatch = loc.match(/(\d{4})\s*$/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : 0;
      if (!year) return false;
      if (specimenFilterYearMin && year < parseInt(specimenFilterYearMin, 10)) return false;
      if (specimenFilterYearMax && year > parseInt(specimenFilterYearMax, 10)) return false;
    }
    if (selectedLocality) {
      const loc = sp.locality_with_date || '';
      if (selectedLocality instanceof Set) {
        let match = false;
        for (const name of selectedLocality) {
          if (loc.includes(name)) { match = true; break; }
        }
        if (!match) return false;
      } else {
        if (!loc.includes(selectedLocality)) return false;
      }
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / SPECIMENS_PER_PAGE);
  if (specimenPage > totalPages) specimenPage = Math.max(1, totalPages);
  const start = (specimenPage - 1) * SPECIMENS_PER_PAGE;
  const pageItems = filtered.slice(start, start + SPECIMENS_PER_PAGE);

  // Build active filter chips
  const allChips = [
    ...[...specimenFilterCountry].map((v) => ({ type: 'country', value: v })),
    ...[...specimenFilterMedium].map((v) => ({ type: 'medium', value: v })),
    ...[...specimenFilterStored].map((v) => ({ type: 'stored', value: v })),
  ];

  container.innerHTML = `
    <div class="specimen-controls">
      <select class="specimen-dropdown" id="filter-country">
        <option value="">+ Country</option>
        ${countries.filter((c) => !specimenFilterCountry.has(c)).map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
      </select>
      <select class="specimen-dropdown" id="filter-medium">
        <option value="">+ Type</option>
        ${mediums.filter((m) => !specimenFilterMedium.has(m)).map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('')}
      </select>
      <select class="specimen-dropdown" id="filter-stored">
        <option value="">+ Collection</option>
        ${museums.filter((m) => !specimenFilterStored.has(m)).map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('')}
      </select>
      ${years.length > 1 ? `
        <div class="year-range">
          <input type="number" class="year-input" id="year-min" placeholder="${years[years.length-1]}" min="${years[years.length-1]}" max="${years[0]}" value="${specimenFilterYearMin || ''}" />
          <span>-</span>
          <input type="number" class="year-input" id="year-max" placeholder="${years[0]}" min="${years[years.length-1]}" max="${years[0]}" value="${specimenFilterYearMax || ''}" />
        </div>
      ` : ''}
      <label class="specimen-toggle">
        <input type="checkbox" id="filter-has-image" ${specimenFilterHasImage ? 'checked' : ''} />
        <span>Has image</span>
      </label>
      <span class="specimen-count-label">${filtered.length} of ${specimens.length}</span>
      ${selectedLocality ? `<button class="clear-map-filter" id="clearMapFilter">Clear map filter ×</button>` : ''}
    </div>
    ${allChips.length > 0 || selectedLocality ? `
      <div class="specimen-chips">
        ${allChips.map((chip) => `
          <span class="chip">${escapeHtml(chip.value)}
            <button type="button" class="chip-x" data-type="${chip.type}" data-value="${escapeHtml(chip.value)}">×</button>
          </span>
        `).join('')}
        ${selectedLocality ? `<span class="chip map-chip">Map filter<button type="button" class="chip-x" id="clearMapChip">×</button></span>` : ''}
      </div>
    ` : ''}
    ${pageItems.map((sp) => {
      const loc = sp.locality_with_date || 'Unknown locality';
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
    }).join('')}
    ${totalPages > 1 ? `
      <div class="specimen-pagination">
        <button class="spec-page-btn" data-dir="prev" ${specimenPage === 1 ? 'disabled' : ''}>← Prev</button>
        <span class="spec-page-info">${specimenPage} / ${totalPages}</span>
        <button class="spec-page-btn" data-dir="next" ${specimenPage === totalPages ? 'disabled' : ''}>Next →</button>
      </div>
    ` : ''}
  `;

  // Wire up dropdowns (multi-select: selecting adds a chip, resets dropdown)
  const countrySelect = container.querySelector('#filter-country');
  const mediumSelect = container.querySelector('#filter-medium');
  const storedSelect = container.querySelector('#filter-stored');

  if (countrySelect) {
    countrySelect.addEventListener('change', () => {
      if (countrySelect.value) {
        specimenFilterCountry.add(countrySelect.value);
        specimenPage = 1;
        renderSpecimens(currentSpeciesData);
      }
    });
  }
  if (mediumSelect) {
    mediumSelect.addEventListener('change', () => {
      if (mediumSelect.value) {
        specimenFilterMedium.add(mediumSelect.value);
        specimenPage = 1;
        renderSpecimens(currentSpeciesData);
      }
    });
  }
  if (storedSelect) {
    storedSelect.addEventListener('change', () => {
      if (storedSelect.value) {
        specimenFilterStored.add(storedSelect.value);
        specimenPage = 1;
        renderSpecimens(currentSpeciesData);
      }
    });
  }
  const yearMin = container.querySelector('#year-min');
  const yearMax = container.querySelector('#year-max');
  if (yearMin) {
    yearMin.addEventListener('change', () => {
      specimenFilterYearMin = yearMin.value;
      specimenPage = 1;
      renderSpecimens(currentSpeciesData);
    });
  }
  if (yearMax) {
    yearMax.addEventListener('change', () => {
      specimenFilterYearMax = yearMax.value;
      specimenPage = 1;
      renderSpecimens(currentSpeciesData);
    });
  }

  const hasImageCheck = container.querySelector('#filter-has-image');
  if (hasImageCheck) {
    hasImageCheck.addEventListener('change', () => {
      specimenFilterHasImage = hasImageCheck.checked;
      specimenPage = 1;
      renderSpecimens(currentSpeciesData);
    });
  }

  // Wire up chip removal
  container.querySelectorAll('.chip-x').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const value = btn.dataset.value;
      if (type === 'country') specimenFilterCountry.delete(value);
      if (type === 'medium') specimenFilterMedium.delete(value);
      if (type === 'stored') specimenFilterStored.delete(value);
      specimenPage = 1;
      renderSpecimens(currentSpeciesData);
    });
  });

  // Wire up map filter chip removal
  const clearMapChip = container.querySelector('#clearMapChip');
  if (clearMapChip) {
    clearMapChip.addEventListener('click', () => {
      selectedLocality = null;
      specimenPage = 1;
      renderSpecimens(currentSpeciesData);
    });
  }

  // Wire up row clicks
  container.querySelectorAll('.specimen-row').forEach((row) => {
    row.addEventListener('click', () => {
      window.location.href = row.dataset.href;
    });
  });

  // Wire up pagination
  container.querySelectorAll('.spec-page-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.dir === 'prev' && specimenPage > 1) specimenPage--;
      if (btn.dataset.dir === 'next' && specimenPage < totalPages) specimenPage++;
      renderSpecimens(currentSpeciesData);
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
  const container = document.getElementById('hosts');
  if (!container) return;
  if (!s.hosts || !s.hosts.length) {
    container.style.display = 'none';
    return;
  }
  container.style.display = '';
  const grid = container.querySelector('.info-grid');
  if (!grid) return;
  grid.innerHTML = s.hosts.map((h) => `
    <div class="info-item">
      <div class="info-label">${escapeHtml(h.tribe || 'Host Plant')}</div>
      <div class="info-value"><em>${escapeHtml(h.name)}</em></div>
    </div>
  `).join('');
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

    // Store initial bounds for reset
    let initialBounds = null;
    if (points.length > 1) {
      initialBounds = new maplibregl.LngLatBounds();
      for (const p of points) initialBounds.extend([p.lng, p.lat]);
    }

    // Bounding box state
    let bboxMode = false;
    let bboxFirstCorner = null;

    // Add controls to map container
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'map-custom-controls';
    controlsDiv.innerHTML = `
      <button type="button" class="map-ctrl-btn" id="bbox-btn" title="Draw bounding box">
        <svg viewBox="0 0 24 24" width="20" height="20"><rect x="5" y="6" width="14" height="12" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"/></svg>
      </button>
      <button type="button" class="map-ctrl-btn" id="reset-btn" title="Reset view">
        <svg viewBox="0 0 24 24" width="20" height="20" style="transform: scaleX(-1)"><path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 8 8h-2a6 6 0 1 1-1.76-4.24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="17 3 21 7 17 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    `;
    mapInstance.getContainer().appendChild(controlsDiv);

    // Bounding box source/layers
    mapInstance.addSource('bbox', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[]] } },
    });
    mapInstance.addLayer({
      id: 'bbox-fill',
      type: 'fill',
      source: 'bbox',
      paint: { 'fill-color': '#76b476', 'fill-opacity': 0.15 },
    });
    mapInstance.addLayer({
      id: 'bbox-outline',
      type: 'line',
      source: 'bbox',
      paint: { 'line-color': '#76b476', 'line-width': 2, 'line-dasharray': [2, 2] },
    });

    function clearBbox() {
      mapInstance.getSource('bbox').setData({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[]] },
      });
      bboxFirstCorner = null;
    }

    function setBboxPreview(a, b) {
      const w = Math.min(a.lng, b.lng);
      const e = Math.max(a.lng, b.lng);
      const s = Math.min(a.lat, b.lat);
      const n = Math.max(a.lat, b.lat);
      mapInstance.getSource('bbox').setData({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[w,s],[e,s],[e,n],[w,n],[w,s]]],
        },
      });
    }

    // Reset button
    document.getElementById('reset-btn').addEventListener('click', () => {
      if (initialBounds) {
        mapInstance.fitBounds(initialBounds, { padding: 50, maxZoom: 6, duration: 500 });
      }
      selectedLocality = null;
      specimenPage = 1;
      clearBbox();
      renderSpecimens(currentSpeciesData);
    });

    // Bbox toggle
    document.getElementById('bbox-btn').addEventListener('click', () => {
      bboxMode = !bboxMode;
      document.getElementById('bbox-btn').classList.toggle('active', bboxMode);
      mapInstance.getCanvas().style.cursor = bboxMode ? 'crosshair' : '';
      if (!bboxMode) {
        bboxFirstCorner = null;
      }
    });

    // Live preview while moving mouse after first click
    mapInstance.on('mousemove', (e) => {
      if (!bboxMode || !bboxFirstCorner) return;
      setBboxPreview(bboxFirstCorner, e.lngLat);
    });

    // Main click handler
    mapInstance.on('click', (e) => {
      // Bounding box mode: two-click draw
      if (bboxMode) {
        if (!bboxFirstCorner) {
          bboxFirstCorner = e.lngLat;
          setBboxPreview(bboxFirstCorner, bboxFirstCorner);
          return;
        }
        // Second click: complete the box
        const secondCorner = e.lngLat;
        setBboxPreview(bboxFirstCorner, secondCorner);

        const minLng = Math.min(bboxFirstCorner.lng, secondCorner.lng);
        const maxLng = Math.max(bboxFirstCorner.lng, secondCorner.lng);
        const minLat = Math.min(bboxFirstCorner.lat, secondCorner.lat);
        const maxLat = Math.max(bboxFirstCorner.lat, secondCorner.lat);

        // Filter specimens by points inside the box
        const insideLocalities = new Set();
        for (const p of points) {
          if (p.lng >= minLng && p.lng <= maxLng && p.lat >= minLat && p.lat <= maxLat) {
            if (p.locality) insideLocalities.add(p.locality);
          }
        }
        selectedLocality = insideLocalities.size > 0 ? insideLocalities : null;
        specimenPage = 1;
        renderSpecimens(currentSpeciesData);

        // Turn off bbox mode
        bboxMode = false;
        bboxFirstCorner = null;
        document.getElementById('bbox-btn').classList.remove('active');
        mapInstance.getCanvas().style.cursor = '';
        return;
      }

      // Not in bbox mode: check if clicked a feature
      const clusterFeatures = mapInstance.queryRenderedFeatures(e.point, { layers: ['clusters'] });
      if (clusterFeatures.length > 0) {
        const currentZoom = mapInstance.getZoom();
        mapInstance.flyTo({
          center: clusterFeatures[0].geometry.coordinates,
          zoom: currentZoom + 3,
          duration: 500,
        });
        return;
      }

      const pointFeatures = mapInstance.queryRenderedFeatures(e.point, { layers: ['unclustered-point'] });
      if (pointFeatures.length > 0) {
        const props = pointFeatures[0].properties;
        const coords = pointFeatures[0].geometry.coordinates.slice();
        selectedLocality = props.locality || null;
        specimenPage = 1;
        renderSpecimens(currentSpeciesData);
        mapInstance.flyTo({ center: coords, duration: 300 });
        new maplibregl.Popup({ maxWidth: '240px', closeButton: true })
          .setLngLat(coords)
          .setHTML(`
            <div class="map-popup">
              <div class="popup-header"><strong>${escapeHtml(props.name)}</strong></div>
              <div class="popup-stats">
                ${props.coordinates ? `<div class="popup-coords">${escapeHtml(props.coordinates)}</div>` : ''}
              </div>
            </div>
          `)
          .addTo(mapInstance);
        return;
      }

      // Clicked empty space: clear filter
      if (selectedLocality) {
        selectedLocality = null;
        specimenPage = 1;
        clearBbox();
        renderSpecimens(currentSpeciesData);
      }
    });

    // Cursor changes
    mapInstance.on('mouseenter', 'clusters', () => { if (!bboxMode) mapInstance.getCanvas().style.cursor = 'pointer'; });
    mapInstance.on('mouseleave', 'clusters', () => { if (!bboxMode) mapInstance.getCanvas().style.cursor = ''; });
    mapInstance.on('mouseenter', 'unclustered-point', () => { if (!bboxMode) mapInstance.getCanvas().style.cursor = 'pointer'; });
    mapInstance.on('mouseleave', 'unclustered-point', () => { if (!bboxMode) mapInstance.getCanvas().style.cursor = ''; });

    // Initial fit
    if (initialBounds) {
      mapInstance.fitBounds(initialBounds, { padding: 50, maxZoom: 6 });
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