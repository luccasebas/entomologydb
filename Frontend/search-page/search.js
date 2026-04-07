// Search page logic
// Hooks up the filter sidebar to the BruchinDB API and renders results.
// Reads URL params (localityId, bounds) to apply filters from the map page.

import {
  searchSpecies,
  getLocality,
  TRIBES,
} from '../shared/bruchindb-api.js';


// ============================================================
// ELEMENT REFERENCES
// ============================================================

const cardsGrid = document.querySelector('.cards-grid');
const searchBtn = document.getElementById('searchBtn');
const resetBtn = document.getElementById('resetBtn');
const resultsCount = document.getElementById('resultsCount');
const filterBanner = document.getElementById('filterBanner');

const sciNameInput = document.getElementById('sci-name-search');
const sciNameSuggestions = document.getElementById('sci-name-suggestions');
const selectedChipsContainer = document.getElementById('selectedChips');
const countryInput = document.getElementById('filter-country');
const provinceInput = document.getElementById('province-input');
const localityInput = document.getElementById('locality-input');
const tribeSelect = document.getElementById('filter-tribe');
const imagesOnlyCheckbox = document.getElementById('filter-images-only');


// ============================================================
// READ URL PARAMS
// These come from the map page when the user clicks a marker
// or accepts a bounding box prompt.
// ============================================================

const urlParams = new URLSearchParams(window.location.search);

const initialFilters = {};
let bannerText = '';
let allSpeciesCache = [];
let selectedSpeciesIds = new Set();
const PAGE_SIZE = 50;
let currentPage = 1;
let lastResults = [];

searchSpecies({}).then((all) => { allSpeciesCache = all; });

// Location autocomplete state
let locationsData = null;
const selectedCountries = new Set();
const selectedProvinces = new Set();
const selectedLocalities = new Set();

const countrySuggestions = document.getElementById('country-suggestions');
const countryChips = document.getElementById('country-chips');
const provinceSuggestions = document.getElementById('province-suggestions');
const provinceChips = document.getElementById('province-chips');
const localitySuggestions = document.getElementById('locality-suggestions');
const localityChips = document.getElementById('locality-chips');

async function loadLocations() {
  if (locationsData) return locationsData;
  try {
    const res = await fetch('../shared/locations.json');
    locationsData = await res.json();
    return locationsData;
  } catch (err) {
    console.error('Failed to load locations:', err);
    return null;
  }
}

function setupAutocomplete(input, suggestionsEl, chipsEl, getOptions, selectedSet, onChange) {
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    if (!query) {
      suggestionsEl.innerHTML = '';
      suggestionsEl.style.display = 'none';
      return;
    }
    const options = getOptions().filter(
      (opt) => opt.toLowerCase().includes(query) && !selectedSet.has(opt)
    );
    if (options.length === 0) {
      suggestionsEl.style.display = 'none';
      return;
    }
    suggestionsEl.innerHTML = options.slice(0, 10).map(
      (opt) => `<div class="autocomplete-item">${escapeHtml(opt)}</div>`
    ).join('');
    suggestionsEl.style.display = 'block';
    suggestionsEl.querySelectorAll('.autocomplete-item').forEach((item, idx) => {
      item.addEventListener('click', () => {
        selectedSet.add(options[idx]);
        input.value = '';
        suggestionsEl.innerHTML = '';
        suggestionsEl.style.display = 'none';
        renderChipList(chipsEl, selectedSet, onChange);
        if (onChange) onChange();
      });
    });
  });
  input.addEventListener('blur', () => {
    setTimeout(() => suggestionsEl.style.display = 'none', 200);
  });
}

function renderChipList(container, selectedSet, onChange) {
  container.innerHTML = [...selectedSet].map(
    (item) => `<span class="chip">${escapeHtml(item)} <button type="button" class="chip-remove" data-value="${escapeHtml(item)}">×</button></span>`
  ).join('');
  container.querySelectorAll('.chip-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedSet.delete(btn.dataset.value);
      renderChipList(container, selectedSet, onChange);
      if (onChange) onChange();
    });
  });
}

(async () => {
  const locs = await loadLocations();
  if (!locs) return;

  setupAutocomplete(
    countryInput, countrySuggestions, countryChips,
    () => locs.countries, selectedCountries
  );
  setupAutocomplete(
    provinceInput, provinceSuggestions, provinceChips,
    () => {
      // Suggest provinces from selected countries (or all if none selected)
      const set = new Set();
      if (selectedCountries.size > 0) {
        for (const c of selectedCountries) {
          (locs.provincesByCountry[c] || []).forEach((p) => set.add(p));
        }
      } else {
        Object.values(locs.provincesByCountry).flat().forEach((p) => set.add(p));
      }
      return [...set].sort();
    },
    selectedProvinces
  );
  setupAutocomplete(
    localityInput, localitySuggestions, localityChips,
    () => {
      // Suggest localities filtered by selected country+province if set
      const set = new Set();
      if (selectedCountries.size > 0 && selectedProvinces.size > 0) {
        for (const c of selectedCountries) {
          for (const p of selectedProvinces) {
            (locs.localitiesByProvince[`${c}|${p}`] || []).forEach((l) => set.add(l));
          }
        }
      } else {
        Object.values(locs.localitiesByProvince).flat().forEach((l) => set.add(l));
      }
      return [...set].sort();
    },
    selectedLocalities
  );
})();

function renderSuggestions(query) {
  if (!query) { sciNameSuggestions.innerHTML = ''; return; }
  const q = query.toLowerCase();
  const matches = allSpeciesCache
    .filter((s) => !selectedSpeciesIds.has(s.Species_ID))
    .filter((s) => s.Full_name.toLowerCase().includes(q) || s.Genus.toLowerCase().includes(q))
    .slice(0, 8);
  sciNameSuggestions.innerHTML = matches.map((s) =>
    `<div class="suggestion-item" data-id="${s.Species_ID}"><em>${escapeHtml(s.Genus)} ${escapeHtml(s.Species)}</em></div>`
  ).join('');
  sciNameSuggestions.querySelectorAll('.suggestion-item').forEach((el) => {
    el.addEventListener('click', () => {
      selectedSpeciesIds.add(el.dataset.id);
      sciNameInput.value = '';
      sciNameSuggestions.innerHTML = '';
      renderChips();
      runSearch();
    });
  });
}

function renderChips() {
  if (selectedSpeciesIds.size === 0) {
    selectedChipsContainer.innerHTML = '';
    return;
  }
  const chips = [...selectedSpeciesIds].map((id) => {
    const s = allSpeciesCache.find((x) => x.Species_ID === id);
    if (!s) return '';
    return `<span class="chip"><em>${escapeHtml(s.Genus)} ${escapeHtml(s.Species)}</em><button data-id="${id}">×</button></span>`;
  }).join('');
  selectedChipsContainer.innerHTML = chips;
  selectedChipsContainer.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedSpeciesIds.delete(btn.dataset.id);
      renderChips();
      runSearch();
    });
  });
}

if (sciNameInput) {
  sciNameInput.addEventListener('input', (e) => renderSuggestions(e.target.value));
}

if (urlParams.get('localityId')) {
  initialFilters.localityIds = [urlParams.get('localityId')];
}

if (urlParams.has('west') && urlParams.has('south') && urlParams.has('east') && urlParams.has('north')) {
  initialFilters.bounds = {
    west: parseFloat(urlParams.get('west')),
    south: parseFloat(urlParams.get('south')),
    east: parseFloat(urlParams.get('east')),
    north: parseFloat(urlParams.get('north')),
  };
  bannerText = 'Showing species inside the bounding box from the map.';
}


// ============================================================
// POPULATE FILTER DROPDOWNS
// ============================================================

function populateDropdown(selectEl, options, placeholder) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = placeholder;
  selectEl.appendChild(placeholderOption);
  options.forEach((opt) => {
    const optionEl = document.createElement('option');
    optionEl.value = opt;
    optionEl.textContent = opt;
    selectEl.appendChild(optionEl);
  });
}

populateDropdown(tribeSelect, TRIBES, 'Any tribe');


// ============================================================
// SET BANNER TEXT IF FILTERED FROM MAP
// ============================================================

async function updateBanner() {
  if (!filterBanner) return;

  if (initialFilters.localityIds && initialFilters.localityIds.length === 1) {
    const loc = await getLocality(initialFilters.localityIds[0]);
    if (loc) {
      bannerText = `Showing species at ${loc.locality_name}, ${loc.country}${loc.province ? ', ' + loc.province : ''}.`;
    }
  }

  if (bannerText) {
    filterBanner.innerHTML = `
      <span>${bannerText}</span>
      <button type="button" id="clearBannerBtn">Clear filter ×</button>
    `;
    filterBanner.style.display = 'flex';
    document.getElementById('clearBannerBtn').addEventListener('click', () => {
      delete initialFilters.localityIds;
      delete initialFilters.bounds;
      bannerText = '';
      filterBanner.style.display = 'none';
      filterBanner.innerHTML = '';
      window.history.replaceState({}, '', window.location.pathname);
      runSearch();
    });
  } else {
    filterBanner.style.display = 'none';
  }
}


// ============================================================
// GATHER FILTER VALUES
// ============================================================

function getFilters() {
  const filters = {
    speciesIds: selectedSpeciesIds.size > 0 ? [...selectedSpeciesIds] : null,
    countries: selectedCountries.size > 0 ? [...selectedCountries] : null,
    countryVariants: locationsData?.countryVariants || {},
    provinces: selectedProvinces.size > 0 ? [...selectedProvinces] : null,
    localities: selectedLocalities.size > 0 ? [...selectedLocalities] : null,
    tribe: tribeSelect?.value || '',
    imagesOnly: imagesOnlyCheckbox?.checked || false,
  };

  if (initialFilters.localityIds) filters.localityIds = initialFilters.localityIds;
  if (initialFilters.bounds) filters.bounds = initialFilters.bounds;

  return filters;
}


// ============================================================
// RENDER RESULTS
// ============================================================

function renderLoading() {
  cardsGrid.innerHTML = `<div class="results-message">Loading...</div>`;
}

function renderEmpty() {
  cardsGrid.innerHTML = `<div class="results-message">No species match your filters.</div>`;
}

function renderError(message) {
  cardsGrid.innerHTML = `<div class="results-message error">Error loading results: ${message}</div>`;
}

function renderCards(species) {
  if (species.length === 0) {
    renderEmpty();
    return;
  }

  cardsGrid.innerHTML = species.map((s) => `
    <article class="species-card">
      <div class="species-info">
        <h3><em>${escapeHtml(s.Genus)} ${escapeHtml(s.Species)}</em></h3>
        <p class="card-meta">
          Family Chrysomelidae · Subfamily Bruchinae${s.Tribe ? ` · ${escapeHtml(s.Tribe)}` : ''}
        </p>
        <a class="learn-more" href="./species.html?id=${encodeURIComponent(s.Species_ID)}">Learn More →</a>
      </div>
      <img
        class="species-img"
        src="${s.image_url ? escapeHtml(s.image_url) : './seed_beetle_logo_transparent.png'}"
        alt="${escapeHtml(s.Full_name)}"
        onerror="this.src='./seed_beetle_logo_transparent.png'"
      />
    </article>
  `).join('');
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


// ============================================================
// RUN A SEARCH
// ============================================================

function getFilterCacheKey(filters) {
  return JSON.stringify({
    speciesIds: filters.speciesIds,
    countries: filters.countries,
    provinces: filters.provinces,
    localities: filters.localities,
    tribe: filters.tribe,
    imagesOnly: filters.imagesOnly,
  });
}

async function runSearch(useCache = false) {
  const filters = getFilters();
  const cacheKey = getFilterCacheKey(filters);

  // Try to restore from cache
  if (useCache) {
    const cached = sessionStorage.getItem('search:' + cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        lastResults = parsed.results;
        currentPage = parsed.page || 1;
        if (resultsCount) {
          resultsCount.textContent = `${lastResults.length} result${lastResults.length === 1 ? '' : 's'}`;
        }
        renderPage();
        return;
      } catch {}
    }
  }

  renderLoading();
  try {
    const results = await searchSpecies(filters);
    lastResults = results;
    currentPage = 1;

    // Cache results
    sessionStorage.setItem('search:' + cacheKey, JSON.stringify({
      results,
      page: 1,
    }));

    if (resultsCount) {
      resultsCount.textContent = `${results.length} result${results.length === 1 ? '' : 's'}`;
    }
    renderPage();
  } catch (err) {
    console.error('Search error:', err);
    renderError(err.message);
  }
}

function renderPage() {
  const totalPages = Math.max(1, Math.ceil(lastResults.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = lastResults.slice(start, start + PAGE_SIZE);

  renderCards(pageItems);
  renderPagination(totalPages);

  // Save current page back to cache so navigation preserves it
  const filters = getFilters();
  const cacheKey = getFilterCacheKey(filters);
  const existing = sessionStorage.getItem('search:' + cacheKey);
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      parsed.page = currentPage;
      sessionStorage.setItem('search:' + cacheKey, JSON.stringify(parsed));
    } catch {}
  }
}

function renderPagination(totalPages) {
  let container = document.getElementById('pagination');
  if (!container) {
    container = document.createElement('div');
    container.id = 'pagination';
    container.className = 'pagination';
    cardsGrid.parentNode.appendChild(container);
  }

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  // Build a sensible page list: first, last, current ± 2, with ellipses for gaps
  const pages = new Set();
  pages.add(1);
  pages.add(totalPages);
  for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) {
    pages.add(i);
  }
  const sorted = [...pages].sort((a, b) => a - b);

  let html = '';
  html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">← Prev</button>`;

  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) html += `<span class="page-ellipsis">…</span>`;
    html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
    prev = p;
  }

  html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">Next →</button>`;

  container.innerHTML = html;

  container.querySelectorAll('.page-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page, 10);
      if (!isNaN(p) && p >= 1 && p <= totalPages) {
        currentPage = p;
        renderPage();
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
    });
  });
}


// ============================================================
// EVENT HANDLERS
// ============================================================

if (searchBtn) {
  searchBtn.addEventListener('click', () => runSearch());
}

if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    if (sciNameInput) sciNameInput.value = '';
    selectedSpeciesIds.clear();
    renderChips();
    if (countryInput) countryInput.value = '';
    if (tribeSelect) tribeSelect.value = '';
    if (imagesOnlyCheckbox) imagesOnlyCheckbox.checked = false;
    runSearch();
  });
}

// Initial load
updateBanner();
runSearch(true);  // try cache first
