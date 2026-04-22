// FileMaker proxy Edge Function
// Forwards requests to FileMaker Server through the Cloudflare tunnel
// and adds CORS headers so the browser can call it.
// Also proxies container field images with the session-cookie redirect flow.

const FM_URL = Deno.env.get('FM_URL')!;
const FM_USER = Deno.env.get('FM_USER')!;
const FM_PASS = Deno.env.get('FM_PASS')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// The 6 tribes Geoffrey wants visible (used for allowlist check)
const ALLOWED_TRIBES = [
  'Amblycerini', 'Bruchini', 'Eubaptini',
  'Kytorhinini', 'Pachymerini', 'Rhaebini',
];


// Cache of allowed genera (union across the 6 tribes), built lazily
let allowedGeneraCache: Set<string> | null = null;

// Cache FileMaker tokens per database
const tokenCache: Record<string, string> = {};

async function getFmToken(database: string): Promise<string> {
  if (tokenCache[database]) return tokenCache[database];

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
  tokenCache[database] = data.response.token;
  return tokenCache[database];
}

async function getAllowedImageUrls(speciesId: string): Promise<string[] | null> {
  const token = await getFmToken('Species');

  // 1. Fetch the species record
  const res = await fetch(
    `${FM_URL}/fmi/data/v2/databases/Species/layouts/Species/_find`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: [{ Species_ID: `==${speciesId}` }],
        limit: 1,
      }),
    }
  );

  if (!res.ok) return null;
  const data = await res.json();
  const record = data?.response?.data?.[0];
  if (!record) return null;

  // 2. Validity check (lowercase on the Species layout)
  if (record.fieldData?.validity !== 'Valid name') return null;

  // 3. Get the species' genus
  const genus = record.fieldData?.Genus;
  if (!genus) return null;

  // 4. Single targeted query: does this genus exist in Genus DB with one of our allowed tribes?
  const genusToken = await getFmToken('Genus');
  const genusRes = await fetch(
    `${FM_URL}/fmi/data/v2/databases/Genus/layouts/Genus/_find`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${genusToken}`,
      },
      body: JSON.stringify({
        // OR query: matches if Genus==X AND P::Tribe is any of the 6
        query: ALLOWED_TRIBES.map((tribe) => ({
          Genus: `==${genus}`,
          'P::Tribe': tribe,
        })),
        limit: 1,
      }),
    }
  );

  if (!genusRes.ok) return null;
  const genusData = await genusRes.json();
  if (!genusData?.response?.data?.length) return null;

  // Genus verified. Extract image URLs.
  const images = record.portalData?.Related_images || [];
  return images
    .map((img: any) => img['Related_images::image_container'])
    .filter((url: string) => url && url.length > 0);
}

async function getAllowedSpecimenImageUrls(specimenId: string): Promise<string[] | null> {
  const token = await getFmToken('Specimen');

  // 1. Fetch the specimen record
  const res = await fetch(
    `${FM_URL}/fmi/data/v2/databases/Specimen/layouts/Specimen record/_find`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: [{ Specimen_ID: `==${specimenId}` }],
        limit: 1,
      }),
    }
  );

  if (!res.ok) return null;
  const data = await res.json();
  const record = data?.response?.data?.[0];
  if (!record) return null;

  // 2. Get the species this specimen belongs to
  const speciesId = record.fieldData?.Species_ID;
  if (!speciesId) return null;

  // 3. Verify the species is in our allowlist (reuses the existing species check)
  // This confirms validity + allowed genus, protecting host plant specimens automatically
  const species = await getAllowedImageUrls(speciesId);
  if (species === null) return null;

  // 4. Extract image URLs from the specimen's own Related_images portal
  const images = record.portalData?.Related_images || [];
  return images
    .map((img: any) => img['Related_images::image_container'])
    .filter((url: string) => url && url.length > 0);
}

// Stream an image from FileMaker, handling the session-cookie redirect flow
async function streamImage(imgUrl: string): Promise<Response> {
  // Step 1: GET the URL, do NOT auto-follow redirects yet — we need to capture the cookie
  const initialRes = await fetch(imgUrl, {
    method: 'GET',
    redirect: 'manual',
  });

  // If it's not a redirect, return whatever FileMaker sent
  if (initialRes.status !== 302 && initialRes.status !== 301) {
    // Might already be the image
    if (initialRes.headers.get('content-type')?.startsWith('image/')) {
      return new Response(initialRes.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': initialRes.headers.get('content-type') || 'image/jpeg',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }
    return new Response(JSON.stringify({ error: 'Unexpected response', status: initialRes.status }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Extract the session cookie from Set-Cookie
  const setCookie = initialRes.headers.get('set-cookie') || '';
  const cookieMatch = setCookie.match(/X-FMS-Session-Key=([^;]+)/);
  if (!cookieMatch) {
    return new Response(JSON.stringify({ error: 'No session cookie in redirect' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const sessionKey = cookieMatch[1];

  // Extract the redirect location
  const location = initialRes.headers.get('location');
  if (!location) {
    return new Response(JSON.stringify({ error: 'No redirect location' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Resolve relative redirect to absolute URL
  const redirectUrl = new URL(location, imgUrl).toString();

  // Step 2: Follow the redirect with the session cookie
  const imgRes = await fetch(redirectUrl, {
    method: 'GET',
    headers: {
      'Cookie': `X-FMS-Session-Key=${sessionKey}`,
    },
  });

  if (!imgRes.ok) {
    return new Response(JSON.stringify({ error: 'Image fetch failed', status: imgRes.status }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(imgRes.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': imgRes.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/fm-proxy/')[1];
    if (!pathParts) {
      return new Response(JSON.stringify({ error: 'Missing path' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Image proxy requests
    // Species: /fm-proxy/image/{species_id}/{index}
    // Specimen: /fm-proxy/image/specimen/{specimen_id}/{index}
    if (pathParts.startsWith('image/')) {
      const segments = pathParts.split('/');
      if (segments.length < 3) {
        return new Response(JSON.stringify({ error: 'Bad image path' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let imageUrls: string[] | null;
      let index: number;

      if (segments[1] === 'specimen') {
        // /image/specimen/{specimen_id}/{index}
        if (segments.length < 4) {
          return new Response(JSON.stringify({ error: 'Bad specimen image path' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const specimenId = segments[2];
        index = parseInt(segments[3], 10);
        imageUrls = await getAllowedSpecimenImageUrls(specimenId);
      } else {
        // /image/{species_id}/{index}
        const speciesId = segments[1];
        index = parseInt(segments[2], 10);
        imageUrls = await getAllowedImageUrls(speciesId);
      }

      if (!imageUrls) {
        return new Response(JSON.stringify({ error: 'Forbidden or not found' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!imageUrls[index]) {
        return new Response(JSON.stringify({ error: 'Image index out of range' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return await streamImage(imageUrls[index]);
    }

    // READ-ONLY WHITELIST: only allow specific operations
    // Everything else is blocked, even if someone crafts a custom request.
    const isImageRequest = pathParts.startsWith('image/');
    const isFindRequest = pathParts.includes('/_find');
    const isLayoutsList = pathParts.endsWith('/layouts') || pathParts.match(/\/layouts\/[^/]+$/);

    if (!isImageRequest && !isFindRequest && !isLayoutsList) {
      return new Response(JSON.stringify({
        error: 'Forbidden: only read operations are allowed'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only allow GET (image, layouts list) and POST (_find)
    if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'OPTIONS') {
      return new Response(JSON.stringify({
        error: 'Forbidden: only GET and POST allowed'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Default: proxy to FileMaker Data API
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
      delete tokenCache[database];
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

    // Strip unneeded fields from species responses
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
            const slimFieldData = Object.fromEntries(
              keepFields
                .filter((k) => k in record.fieldData)
                .map((k) => [k, record.fieldData[k]])
            );

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
            const f = record.fieldData || {};
            const slimFieldData = {
              Locality_ID: f.Locality_ID,
              Country: f.Country,
              province: f.province,
              locality: f.locality,
              'decimal latitude': f['decimal latitude'],
              'decimal longitude': f['decimal longitude'],
            };
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
      } catch {}
    }

    if (database === 'Specimen' && fmResponse.ok) {
      try {
        const data = JSON.parse(cleanedText);
        if (data?.response?.data) {
          const keepFields = [
            'Specimen_ID', 'Species_ID', 'sex', 'stage', 'collecting_method',
            'determined by', 'ss', 'Tape', 'stored', 'medium',
            'Species::Full_name', 'Host species::Full_name', 'Host species::Family',
            'Citation::full_citation', 'Event_ID',
            'Events::country', 'Events::province', 'Events::County',
            'Events::locality', 'Events::full_date', 'Events::collector',
            'Events::coordinates', 'Specimen notes',
          ];
          data.response.data = data.response.data.map((record: any) => {
            const slimFieldData = Object.fromEntries(
              keepFields
                .filter((k) => k in (record.fieldData || {}))
                .map((k) => [k, record.fieldData[k]])
            );
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
            return {
              recordId: record.recordId,
              modId: record.modId,
              fieldData: slimFieldData,
              portalData: slimPortalData,
            };
          });
          cleanedText = JSON.stringify(data);
        }
      } catch {}
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