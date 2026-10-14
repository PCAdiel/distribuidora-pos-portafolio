import {
  buildGenerarComprobantePayload,
  callNubefact,
  corsHeaders,
  errorMessage,
  estadoDesdeRespuesta,
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

    await ctx.client.rpc('registrar_evento_facturacion', {
      p_comprobante_id: comprobanteId,
      p_operacion: 'generar_comprobante',
      p_estado: 'ENVIANDO',
      p_mensaje: null,
      p_detalle: null
    });

    const payload = buildGenerarComprobantePayload(comprobante);
    const result = await callNubefact(ctx, payload);
    const estado = estadoDesdeRespuesta(result.ok, result.data);
    const mensaje = result.ok ? null : String(result.data.errors ?? result.data.error ?? 'Nubefact rechazo el comprobante.');

    const { data, error } = await ctx.client.rpc('marcar_comprobante_nubefact', {
      p_comprobante_id: comprobanteId,
      p_operacion: 'generar_comprobante',
      p_estado: estado,
      p_respuesta: result.data,
      p_mensaje: mensaje
    });

    if (error) {
      throw new Error(error.message);
    }

    return json({ ok: result.ok, comprobante: data, nubefact: result.data }, result.ok ? 200 : 502);
  } catch (error) {
    return json({ ok: false, error: errorMessage(error) }, 400);
  }
});
