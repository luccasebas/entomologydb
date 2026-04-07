// FileMaker proxy Edge Function
// Forwards requests to FileMaker Server through the Cloudflare tunnel
// and adds CORS headers so the browser can call it.

const FM_URL = Deno.env.get('FM_URL')!;
const FM_USER = Deno.env.get('FM_USER')!;
const FM_PASS = Deno.env.get('FM_PASS')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Cache the FileMaker token in memory for the function instance
let cachedToken: string | null = null;
let cachedTokenDb: string | null = null;

async function getFmToken(database: string): Promise<string> {
  if (cachedToken && cachedTokenDb === database) return cachedToken;

  const auth = btoa(`${FM_USER}:${FM_PASS}`);
  const response = await fetch(
    `${FM_URL}/fmi/data/v2/databases/${database}/sessions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
      },
      body: '{}',
    }
  );

  if (!response.ok) {
    throw new Error(`FM auth failed: ${response.status}`);
  }

  const data = await response.json();
  cachedToken = data.response.token;
  cachedTokenDb = database;
  return cachedToken!;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    // Strip the function path prefix to get the FileMaker path
    const pathParts = url.pathname.split('/fm-proxy/')[1];
    if (!pathParts) {
      return new Response(JSON.stringify({ error: 'Missing path' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // First path segment is the database name
    const [database, ...rest] = pathParts.split('/');
    const fmPath = '/' + rest.join('/');

    const token = await getFmToken(database);

    const fmResponse = await fetch(
      `${FM_URL}/fmi/data/v2/databases/${database}${fmPath}`,
      {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: req.method !== 'GET' ? await req.text() : undefined,
      }
    );

    // If token expired, retry once
    if (fmResponse.status === 401) {
      cachedToken = null;
      const newToken = await getFmToken(database);
      const retryResponse = await fetch(
        `${FM_URL}/fmi/data/v2/databases/${database}${fmPath}`,
        {
          method: req.method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${newToken}`,
          },
          body: req.method !== 'GET' ? await req.text() : undefined,
        }
      );
      const retryData = await retryResponse.text();
      return new Response(retryData, {
        status: retryResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const responseText = await fmResponse.text();

    // Strip unneeded fields from species responses to reduce payload size
    let cleanedText = responseText;
    if (database === 'Species' && fmResponse.ok) {
      try {
        const data = JSON.parse(responseText);
        if (data?.response?.data) {
          const keepFields = [
            'Species_ID', 'Genus', 'Subgenus', 'Species', 'Subspecies',
            'Author', 'Year', 'Validity', 'Tribe', 'Common',
          ];
          data.response.data = data.response.data.map((record: any) => {
            // Keep only the fields we want from fieldData
            const slimFieldData = Object.fromEntries(
              keepFields
                .filter((k) => k in record.fieldData)
                .map((k) => [k, record.fieldData[k]])
            );

// Keep only Related_images from portalData (URLs aren't useful right now but kept for image_count)
            // Keep all useful portal data, slimmed where needed
            const slimPortalData: any = {};
            if (record.portalData?.Related_images) {
              slimPortalData.Related_images = record.portalData.Related_images.map((img: any) => ({
                'Related_images::image_container': img['Related_images::image_container'],
                'Related_images::image_category': img['Related_images::image_category'],
                'Related_images::full caption': img['Related_images::full caption'],
                'Related_images::source': img['Related_images::source'],
                'Related_images::copyright': img['Related_images::copyright'],
              }));
            }
            if (record.portalData?.Specimens) {
              slimPortalData.Specimens = record.portalData.Specimens;
            }
            if (record.portalData?.Events) {
              slimPortalData.Events = record.portalData.Events;
            }
            if (record.portalData?.Geolib) {
              slimPortalData.Geolib = record.portalData.Geolib;
            }
            if (record.portalData?.['Host species']) {
              slimPortalData['Host species'] = record.portalData['Host species'];
            }
            if (record.portalData?.['Host specimens']) {
              slimPortalData['Host specimens'] = record.portalData['Host specimens'];
            }

            return {
              ...record,
              fieldData: slimFieldData,
              portalData: slimPortalData,
            };
          });
          cleanedText = JSON.stringify(data);
        }
      } catch {
        // If parsing fails, return original
      }
    }

    if (database === 'Event' && fmResponse.ok) {
      try {
        const data = JSON.parse(cleanedText);
        if (data?.response?.data && data?.response?.dataInfo?.layout === 'Locality') {
          data.response.data = data.response.data.map((record: any) => {
            // Keep only essentials: location fields + Species_Locality portal (bruchids only)
            const f = record.fieldData || {};
            const slimFieldData = {
              Locality_ID: f.Locality_ID,
              Country: f.Country,
              province: f.province,
              locality: f.locality,
              'decimal latitude': f['decimal latitude'],
              'decimal longitude': f['decimal longitude'],
            };
            // Keep only Species_Locality portal, with just full names + tribe info
            const slimPortalData: any = {};
            if (record.portalData?.Species_Locality) {
              slimPortalData.Species_Locality = record.portalData.Species_Locality.map((sp: any) => ({
                'Species_Locality::Full_name': sp['Species_Locality::Full_name'],
                'Species_Locality::Family': sp['Species_Locality::Family'],
                'Species_Locality::Subfamily': sp['Species_Locality::Subfamily'],
                'Species_Locality::Tribe': sp['Species_Locality::Tribe'],
              }));
            }
            return {
              recordId: record.recordId,
              modId: record.modId,
              fieldData: slimFieldData,
              portalData: slimPortalData,
            };
          });
          cleanedText = JSON.stringify(data);
        }
      } catch {
        // If parsing fails, return original
      }
    }

    return new Response(cleanedText, {
      status: fmResponse.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});