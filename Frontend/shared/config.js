// BruchinDB configuration

export const CONFIG = {
  // Supabase Edge Function that proxies FileMaker requests.
  // The function holds the FileMaker credentials server-side, so they
  // are no longer in the frontend.
  fileMakerUrl: 'https://ybkzmrytbgohhtjorkpu.supabase.co/functions/v1/fm-proxy',
};
