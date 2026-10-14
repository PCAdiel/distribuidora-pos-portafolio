import {
  buildAnularPayload,
  callNubefact,
  corsHeaders,
  errorMessage,
  getSecureContext,
  json,
  obtenerComprobanteSeguro,
  readComprobanteId
} from '../_shared/nubefact-secure.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Metodo no permitido.' }, 405);
  }

  try {
    const ctx = await getSecureContext(req);
    const comprobanteId = await readComprobanteId(req);
    const comprobante = await obtenerComprobanteSeguro(ctx, comprobanteId);
    const result = await callNubefact(ctx, buildAnularPayload(comprobante));

    const { data, error } = await ctx.client.rpc('marcar_comprobante_anulado_nubefact', {
      p_comprobante_id: comprobanteId,
      p_respuesta: result.data,
      p_mensaje: result.ok ? null : String(result.data.errors ?? result.data.error ?? 'No se pudo anular.')
    });

    if (error) {
      throw new Error(error.message);
    }

    return json({ ok: result.ok, comprobante: data, nubefact: result.data }, result.ok ? 200 : 502);
  } catch (error) {
    return json({ ok: false, error: errorMessage(error) }, 400);
  }
});
