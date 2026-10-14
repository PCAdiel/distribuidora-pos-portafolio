import {
  buildConsultarPayload,
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
    const result = await callNubefact(ctx, buildConsultarPayload(comprobante));

    await ctx.client.rpc('registrar_evento_facturacion', {
      p_comprobante_id: comprobanteId,
      p_operacion: 'consultar_comprobante',
      p_estado: result.ok ? 'CONSULTADO' : 'ERROR_CONSULTA',
      p_mensaje: result.ok ? null : String(result.data.errors ?? result.data.error ?? 'No se pudo consultar.'),
      p_detalle: result.data
    });

    return json({ ok: result.ok, nubefact: result.data }, result.ok ? 200 : 502);
  } catch (error) {
    return json({ ok: false, error: errorMessage(error) }, 400);
  }
});
