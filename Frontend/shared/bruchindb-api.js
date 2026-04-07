// BruchinDB API Client
import { CONFIG as APP_CONFIG } from './config.js';

let genusCacheByTribe = {};

const CONFIG = {
  fmUrl: APP_CONFIG.fileMakerUrl,
};

async function fmRequest(database, path, options = {}) {
  const response = await fetch(`${CONFIG.fmUrl}/${database}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`FileMaker request failed: ${response.status}`);
  return response.json();
}

export const TRIBES = [
  'Amblycerini',
  'Bruchini',
  'Eubaptini',
  'Kytorhinini',
  'Pachymerini',
  'Rhaebini',
];

export function getTribes() {
  return [...TRIBES];
}

// ============================================================
// SEARCH
// ============================================================
export async function searchSpecies(filters = {}) {
  let genusList = null;
  if (filters.tribe) {
    if (genusCacheByTribe[filters.tribe]) {
      genusList = genusCacheByTribe[filters.tribe];
    } else {
      try {
        const genusData = await fmRequest('Genus', '/layouts/Genus/_find', {
          method: 'POST',
          body: JSON.stringify({
            query: [{ 'P::Tribe': filters.tribe }],
            limit: 1000,
          }),
        });
        genusList = (genusData.response?.data || []).map((r) => r.fieldData.Genus);
        genusCacheByTribe[filters.tribe] = genusList;
      } catch (err) {
        console.error('Genus lookup failed:', err);
        return [];
      }
    }
    if (genusList.length === 0) return [];
  }

  // Step 1.5: If location filter is set, query Locality DB to get bruchid species names at those localities
  let speciesNameAllowlist = null;
  if (filters.countries || filters.provinces || filters.localities) {
    // Build OR'd queries: each country/province/locality combo gets its own query
    // Expand selected countries to include all spelling variants
    let expandedCountries = [''];
    if (filters.countries) {
      expandedCountries = [];
      const variantsMap = filters.countryVariants || {};
      for (const c of filters.countries) {
        const variants = variantsMap[c] || [c];
        expandedCountries.push(...variants);
      }
    }
    const queries = [];
    const countries = expandedCountries;
    const provinces = filters.provinces || [''];
    const localities = filters.localities || [''];
    for (const c of countries) {
      for (const p of provinces) {
        for (const l of localities) {
          const q = {};
          if (c) q.Country = c;
          if (p) q.province = p;
          if (l) q.locality = `*${l}*`;
          if (Object.keys(q).length > 0) queries.push(q);
        }
      }
    }

    try {
      const locData = await fmRequest('Event', '/layouts/Locality/_find', {
        method: 'POST',
        body: JSON.stringify({
          query: queries,
          limit: 1000,
        }),
      });
      const localities = locData.response?.data || [];
      // Extract bruchid species names from each locality's Species_Locality portal
      // Only include species in the Bruchinae family (excludes host plants)
      const names = new Set();
      for (const loc of localities) {
        const sps = loc.portalData?.Species_Locality || [];
        for (const sp of sps) {
          if (sp['Species_Locality::Family'] === 'Bruchinae') {
            names.add(sp['Species_Locality::Full_name']);
          }
        }
      }
      speciesNameAllowlist = names;
      if (speciesNameAllowlist.size === 0) return [];
    } catch (err) {
      console.error('Locality lookup failed:', err);
      return [];
    }
  }

  let queries;
  if (filters.speciesIds && filters.speciesIds.length > 0) {
    // Direct species_id filter — one OR query per ID
    queries = filters.speciesIds.map((id) => ({
      Species_ID: `==${id}`,
      Validity: 'Valid name',
    }));
  } else if (genusList) {
    queries = genusList.map((genus) => {
      const q = { Genus: `==${genus}`, Validity: 'Valid name' };
      if (filters.scientificName) q.Species = `*${filters.scientificName}*`;
      if (filters.genus) q.Genus = `*${filters.genus}*`;
      return q;
    });
  } else {
    const q = { Validity: 'Valid name' };
    if (filters.scientificName) q.Species = `*${filters.scientificName}*`;
    if (filters.genus) q.Genus = `*${filters.genus}*`;
    queries = [q];
  }

  const data = await fmRequest('Species', '/layouts/Lookup species/_find', {
    method: 'POST',
    body: JSON.stringify({ query: queries, limit: 10000 }),
  });

  if (!data.response?.data) return [];

  let mapped = data.response.data.map((record) => {
    const f = record.fieldData;
    return {
      Species_ID: f.Species_ID,
      Genus: f.Genus,
      Subgenus: f.Subgenus || '',
      Species: f.Species,
      Subspecies: f.Subspecies || '',
      Author: '',
      Year: '',
      Tribe: f.Tribe || '',
      Common: '',
      Full_name: `${f.Genus} ${f.Species}`.trim(),
      image_url: null,
      image_count: 0,
      specimen_count: 0,
      locality_count: 0,
    };
  });

  // Apply location allowlist filter
  if (speciesNameAllowlist) {
    mapped = mapped.filter((s) => {
      // Check if any name in the allowlist starts with the species' Genus + Species
      const speciesNamePrefix = `${s.Genus} ${s.Species}`;
      for (const fullName of speciesNameAllowlist) {
        if (fullName.startsWith(speciesNamePrefix)) return true;
      }
      return false;
    });
  }

  return mapped;
}

// ============================================================
// SPECIES DETAIL
// ============================================================
export async function getSpecies(speciesId) {
  const data = await fmRequest('Species', '/layouts/Species/_find', {
    method: 'POST',
    body: JSON.stringify({
      query: [{ Species_ID: `==${speciesId}` }],
      limit: 1,
    }),
  });

  if (!data.response?.data?.[0]) return null;

  const record = data.response.data[0];
  const f = record.fieldData;
  const portals = record.portalData || {};

  const allImages = (portals.Related_images || []).map((img) => ({
    url: img['Related_images::image_container'] || '',
    category: img['Related_images::image_category'] || '',
    caption: img['Related_images::full caption'] || '',
    source: img['Related_images::source'] || '',
    copyright: img['Related_images::copyright'] || '',
  }));

  const specimens = (portals.Specimens || []).map((s) => ({
    id: s['Specimens::Dynamic_ID'] || '',
    stage_lot: s['Specimens::stage_lot'] || '',
    stored: s['Specimens::stored'] || '',
    locality_with_date: s['Specimens::Locality_with_date'] || '',
    medium: s['Specimens::medium'] || '',
  }));

  // Build a quick lookup of coordinates by locality name from Geolib
  const geolibByLocality = {};
  for (const g of (portals.Geolib || [])) {
    const locName = g['Geolib::locality'] || '';
    if (locName && g['Geolib::coordinates']) {
      geolibByLocality[locName] = g['Geolib::coordinates'];
    }
  }

  const events = (portals.Events || []).map((e) => {
    const localityName = e['Events::locality'] || '';
    return {
      country: e['Events::country'] || '',
      province: e['Events::province'] || '',
      locality: localityName,
      elevation: e['Events::full_elevation'] || '',
      date: e['Events::full_date'] || '',
      collector: e['Events::collector'] || '',
      coordinates: geolibByLocality[localityName] || '',
    };
  });

  const hosts = (portals['Host species'] || []).map((h) => ({
    tribe: h['Host species::Tribe'] || '',
    name: h['Host species::Full specific name'] || '',
  }));

  const geolib = (portals.Geolib || []).map((g) => ({
    locality_id: g['Geolib::Locality_ID'] || '',
    country: g['Geolib::Country'] || '',
    province: g['Geolib::province'] || '',
    locality: g['Geolib::locality'] || '',
    coordinates: g['Geolib::coordinates'] || '',
  }));

  return {
    Species_ID: f.Species_ID,
    Genus: f.Genus,
    Subgenus: f.Subgenus || '',
    Species: f.Species,
    Subspecies: f.Subspecies || '',
    Author: f.Author || '',
    Year: f.Year || '',
    Common: f.Common || '',
    Full_name: `${f.Genus} ${f.Species}`.trim(),
    images: allImages,
    specimens,
    events,
    hosts,
    geolib,
  };
}

// ============================================================
// MAP - stubs to be wired later
// ============================================================
export async function getMapPoints(filters = {}) {
  return [];
}

export async function getLocality(localityId) {
  return null;
}