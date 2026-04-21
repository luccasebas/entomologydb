import { getSpecimen } from '../shared/bruchindb-api.js';
import { CONFIG } from '../shared/config.js';

// Get specimen ID from URL
const params = new URLSearchParams(window.location.search);
const specimenId = params.get('id');
const from = params.get('from');
const breadcrumbEnabled = from === 'species' || sessionStorage.getItem('breadcrumbActive') === 'true';
const breadcrumbEl = document.getElementById('breadcrumb');
const breadcrumbSpeciesLink = document.getElementById('breadcrumb-species-link');
const breadcrumbCurrentEl = document.getElementById('breadcrumb-current');

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

function renderSpecimenBreadcrumb(sp) {
  if (!breadcrumbSpeciesLink || !breadcrumbCurrentEl) return;
  breadcrumbSpeciesLink.href = `./species.html?id=${encodeURIComponent(sp.Species_ID)}&from=species`;
  breadcrumbSpeciesLink.textContent = sp.species_full_name || 'Species';
  breadcrumbCurrentEl.textContent = sp.Specimen_ID;
  showBreadcrumb();
}

async function loadSpecimen() {
  if (!specimenId) {
    titleEl.textContent = 'No specimen selected';
    subtitleEl.textContent = 'Go back and click a specimen ID.';
    return;
  }

  // Try cache first
  const cached = sessionStorage.getItem('specimen:' + specimenId);
  if (cached) {
    try {
      const specimen = JSON.parse(cached);
      renderSpecimen(specimen);
      return;
    } catch {}
  }

  titleEl.textContent = 'Loading...';
  subtitleEl.textContent = '';

  try {
    const specimen = await getSpecimen(specimenId);
    if (specimen) {
      sessionStorage.setItem('specimen:' + specimenId, JSON.stringify(specimen));
    }
    if (!specimen) {
      titleEl.textContent = 'Specimen not found';
      subtitleEl.textContent = `ID: ${specimenId}`;
      return;
    }
    if (breadcrumbEnabled && from === 'species') {
      sessionStorage.setItem('breadcrumbActive', 'true');
    }
    renderSpecimen(specimen);
    if (breadcrumbEnabled) {
      renderSpecimenBreadcrumb(specimen);
    }
  } catch (err) {
    console.error('Failed to load specimen:', err);
    titleEl.textContent = 'Error loading specimen';
    subtitleEl.textContent = err.message;
  }
}

function renderSpecimen(sp) {
  // Hero
  titleEl.innerHTML = `${escapeHtml(sp.Specimen_ID)}`;
  subtitleEl.textContent = sp.species_full_name || 'Unknown species';

  renderSpecimenInfo(sp);
  renderImages(sp);
  renderCollectionEvent(sp);
  renderHostPlant(sp);
}

function renderSpecimenInfo(sp) {
  const grid = document.querySelector('#specimen-info .info-grid');
  if (!grid) return;

  const items = [
    { label: 'Specimen ID', value: sp.Specimen_ID },
    { label: 'Species', value: sp.species_full_name },
    { label: 'Sex', value: sp.sex },
    { label: 'Stage', value: sp.stage },
    { label: 'Collecting Method', value: sp.collecting_method },
    { label: 'Determined By', value: sp.determined_by },
    { label: 'Medium', value: sp.medium },
    { label: 'Stored', value: sp.stored },
    { label: 'Tape', value: sp.Tape },
    { label: 'Notes', value: sp.notes },
  ];

  grid.innerHTML = items
    .filter((item) => item.value) // Only show fields with values
    .map(
      (item) => `
    <div class="info-item">
      <div class="info-label">${escapeHtml(item.label)}</div>
      <div class="info-value">${escapeHtml(item.value)}</div>
    </div>
  `
    )
    .join('');
}

let lightboxImages = [];
let lightboxIndex = 0;

function renderImages(sp) {
  const container = document.querySelector('#images .image-grid');
  if (!container) return;
  if (!sp.images.length) {
    container.innerHTML = `<p class="empty">No images available for this specimen.</p>`;
    lightboxImages = [];
    return;
  }
  const proxyBase = CONFIG.fileMakerUrl + '/image/' + encodeURIComponent(sp.Specimen_ID);
  lightboxImages = sp.images.map((img, idx) => ({
    url: `${proxyBase}/${idx}`,
    category: img.category,
    caption: img.caption,
    source: img.source,
    copyright: img.copyright,
  }));
  container.innerHTML = lightboxImages
    .map(
      (img, idx) => `
    <figure class="image-tile" data-img-index="${idx}">
      <img src="${img.url}" alt="${escapeHtml(img.category)}" loading="lazy" onerror="this.src='./seed_beetle_logo_transparent.png'" />
      <figcaption>
        ${escapeHtml(img.category)}
        ${img.copyright ? `<div class="image-credit">© ${escapeHtml(img.copyright)}</div>` : ''}
        ${img.source ? `<div class="image-source">${escapeHtml(img.source)}</div>` : ''}
      </figcaption>
    </figure>
  `
    )
    .join('');

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
      ${
        lightboxImages.length > 1
          ? `
        <button class="lightbox-nav lightbox-prev" aria-label="Previous">‹</button>
        <button class="lightbox-nav lightbox-next" aria-label="Next">›</button>
      `
          : ''
      }
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
  imgWrap.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.002;
      const newScale = Math.max(1, Math.min(5, scale + delta * scale));
      if (newScale === 1) {
        panX = 0;
        panY = 0;
      }
      scale = newScale;
      applyTransform();
    },
    { passive: false }
  );

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

function renderCollectionEvent(sp) {
  const grid = document.querySelector('#collection-event .info-grid');
  if (!grid) return;

  const items = [
    { label: 'Country', value: sp.event_country },
    { label: 'Province', value: sp.event_province },
    { label: 'County', value: sp.event_county },
    { label: 'Locality', value: sp.event_locality },
    { label: 'Date', value: sp.event_date },
    { label: 'Collector', value: sp.event_collector },
  ];

  grid.innerHTML = items
    .filter((item) => item.value) // Only show fields with values
    .map(
      (item) => `
    <div class="info-item">
      <div class="info-label">${escapeHtml(item.label)}</div>
      <div class="info-value">${escapeHtml(item.value)}</div>
    </div>
  `
    )
    .join('');
}

function renderHostPlant(sp) {
  const grid = document.querySelector('#host .info-grid');
  if (!grid) return;

  const items = [
    { label: 'Host Species', value: sp.host_species_name },
    { label: 'Host Family', value: sp.host_species_family },
    { label: 'Citation', value: sp.citation },
  ];

  grid.innerHTML = items
    .filter((item) => item.value) // Only show fields with values
    .map(
      (item) => `
    <div class="info-item">
      <div class="info-label">${escapeHtml(item.label)}</div>
      <div class="info-value">${escapeHtml(item.value)}</div>
    </div>
  `
    )
    .join('');
}

// Tab switcher
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.remove('is-active');
      b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('is-active');
    btn.setAttribute('aria-selected', 'true');
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.remove('is-active');
    });
    document.getElementById(target).classList.add('is-active');
  });
});

loadSpecimen();
