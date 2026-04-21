import { getSpecimen } from '../shared/bruchindb-api.js';
import { CONFIG } from '../shared/config.js';

const params = new URLSearchParams(window.location.search);
const specimenId = params.get('id');

const titleEl = document.getElementById('specimen-title');
const subtitleEl = document.getElementById('specimen-subtitle');
const specimenInfoEl = document.getElementById('specimen-info');
const eventInfoEl = document.getElementById('event-info');
const hostInfoEl = document.getElementById('host-info');
const hostSection = document.getElementById('specimen-host-section');
const citationTextEl = document.getElementById('citation-text');
const citationSection = document.getElementById('specimen-citation-section');
const notesTextEl = document.getElementById('notes-text');
const notesSection = document.getElementById('specimen-notes-section');
const imagesEl = document.getElementById('specimen-images');
const imagesSection = document.getElementById('specimen-images-section');

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function infoItem(label, value) {
  if (!value || !String(value).trim()) return '';
  return `
    <div class="info-item">
      <div class="info-label">${escapeHtml(label)}</div>
      <div class="info-value">${escapeHtml(value)}</div>
    </div>
  `;
}

async function loadSpecimen() {
  if (!specimenId) {
    titleEl.textContent = 'No specimen selected';
    subtitleEl.textContent = 'Go back and click a specimen.';
    return;
  }

  const cached = sessionStorage.getItem('specimen:' + specimenId);
  if (cached) {
    try {
      renderSpecimen(JSON.parse(cached));
      return;
    } catch {}
  }

  titleEl.textContent = 'Loading...';
  try {
    const sp = await getSpecimen(specimenId);
    if (!sp) {
      titleEl.textContent = 'Specimen not found';
      subtitleEl.textContent = '';
      return;
    }
    sessionStorage.setItem('specimen:' + specimenId, JSON.stringify(sp));
    renderSpecimen(sp);
  } catch (err) {
    console.error(err);
    titleEl.textContent = 'Error loading specimen';
    subtitleEl.textContent = err.message;
  }
}

function renderSpecimen(sp) {
  titleEl.textContent = sp.Specimen_ID || 'Specimen';
  const breadcrumbSpeciesLink = document.getElementById('breadcrumb-species-link');
  const breadcrumbSpecimen = document.getElementById('breadcrumb-specimen');
  if (breadcrumbSpeciesLink && sp.Species_ID) {
    const lastTab = sessionStorage.getItem('lastSpeciesTab:' + sp.Species_ID) || 'taxon';
    breadcrumbSpeciesLink.href = `./species.html?id=${encodeURIComponent(sp.Species_ID)}&tab=${lastTab}`;
    breadcrumbSpeciesLink.textContent = sp.species_full_name
      ? sp.species_full_name.split(/\s+/).slice(0, 2).join(' ')
      : 'Species';
  }
  if (breadcrumbSpecimen) {
    breadcrumbSpecimen.textContent = sp.Specimen_ID || 'Specimen';
  }
  const breadcrumbNav = document.querySelector('.breadcrumbs');
  if (breadcrumbNav) breadcrumbNav.style.visibility = 'visible';
  subtitleEl.innerHTML = sp.species_full_name
    ? `<a href="./species.html?id=${encodeURIComponent(sp.Species_ID)}&tab=${sessionStorage.getItem('lastSpeciesTab:' + sp.Species_ID) || 'taxon'}"><em>${escapeHtml(sp.species_full_name)}</em></a>`
    : '';

  specimenInfoEl.innerHTML = [
    infoItem('Specimen ID', sp.Specimen_ID),
    infoItem('Sex', sp.sex),
    infoItem('Stage', sp.stage),
    infoItem('Collection Method', sp.collecting_method),
    infoItem('Determined By', sp.determined_by),
    infoItem('Type Status', sp.ss),
    infoItem('Tape', sp.Tape),
    infoItem('Medium', sp.medium),
    infoItem('Stored At', sp.stored),
  ].filter(Boolean).join('') || '<p class="empty">No specimen details recorded.</p>';

  eventInfoEl.innerHTML = [
    infoItem('Country', sp.event_country),
    infoItem('Province', sp.event_province),
    infoItem('County', sp.event_county),
    infoItem('Locality', sp.event_locality),
    infoItem('Date', sp.event_date),
    infoItem('Collector', sp.event_collector),
  ].filter(Boolean).join('') || '<p class="empty">No collection event recorded.</p>';

  const hasHost = (sp.host_species_name && sp.host_species_name.trim()) ||
                  (sp.host_species_family && sp.host_species_family.trim());
  if (hasHost) {
    hostSection.style.display = '';
    hostInfoEl.innerHTML = [
      infoItem('Host Species', sp.host_species_name),
      infoItem('Host Family', sp.host_species_family),
    ].filter(Boolean).join('');
  }

  if (sp.citation && sp.citation.trim()) {
    citationSection.style.display = '';
    citationTextEl.textContent = sp.citation;
  }

  if (sp.notes && sp.notes.trim()) {
    notesSection.style.display = '';
    notesTextEl.textContent = sp.notes;
  }

  if (sp.images && sp.images.length > 0) {
    imagesSection.style.display = '';
    const proxyBase = CONFIG.fileMakerUrl + '/image/specimen/' + encodeURIComponent(sp.Specimen_ID);
    imagesEl.innerHTML = sp.images.map((img, idx) => `
      <figure class="image-tile">
        <img src="${proxyBase}/${idx}" alt="${escapeHtml(img.category)}" loading="lazy" onerror="this.src='./seed_beetle_logo_transparent.png'" />
        <figcaption>
          ${escapeHtml(img.category)}
          ${img.copyright ? `<div class="image-credit">${escapeHtml(img.copyright)}</div>` : ''}
          ${img.source ? `<div class="image-source">${escapeHtml(img.source)}</div>` : ''}
        </figcaption>
      </figure>
    `).join('');
  }
}

loadSpecimen();