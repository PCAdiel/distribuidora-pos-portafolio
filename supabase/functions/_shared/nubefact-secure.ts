import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export interface SecureContext {
  client: SupabaseClient;
  userId: string;
  apiUrl: string;
  token: string;
  env: string;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

export async function getSecureContext(req: Request): Promise<SecureContext> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const apiUrl = Deno.env.get('NUBEFACT_API_URL');
  const token = Deno.env.get('NUBEFACT_TOKEN');
  const env = Deno.env.get('NUBEFACT_ENV') ?? 'demo';
  const authHeader = req.headers.get('authorization');

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase no esta configurado en Edge Functions.');
  }

  if (!apiUrl || !token) {
    throw new Error('Nubefact no esta configurado.');
  }

  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('No autorizado.');
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await client.auth.getUser();

  if (error || !data.user) {
    throw new Error('Sesion invalida.');
  }

  return { client, userId: data.user.id, apiUrl, token, env };
}

export async function readComprobanteId(req: Request): Promise<string> {
  const body = await req.json().catch(() => null) as { comprobante_id?: string } | null;
  const comprobanteId = body?.comprobante_id;

  if (!comprobanteId || typeof comprobanteId !== 'string') {
    throw new Error('Envia comprobante_id.');
  }

  return comprobanteId;
}

export async function obtenerComprobanteSeguro(ctx: SecureContext, comprobanteId: string): Promise<any> {
  const { data: comprobante, error } = await ctx.client
    .from('comprobantes')
    .select(`
      *,
      ventas:venta_id(
        *,
        clientes:cliente_id(*),
        venta_detalle(
          *,
          productos:producto_id(*),
          combos:combo_id(*)
        )
      )
    `)
    .eq('id', comprobanteId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!comprobante?.id || !comprobante.empresa_id) {
    throw new Error('Comprobante no encontrado.');
  }

  const { data: perfil, error: perfilError } = await ctx.client
    .from('usuarios_empresa')
    .select('rol')
    .eq('user_id', ctx.userId)
    .eq('empresa_id', comprobante.empresa_id)
    .maybeSingle();

  if (perfilError) {
    throw new Error(perfilError.message);
  }

  if (!perfil || !['ADMIN', 'CAJERO'].includes(perfil.rol)) {
    throw new Error('Tu rol no permite operar comprobantes.');
  }

  return comprobante;
}

export function buildGenerarComprobantePayload(comprobante: any): Record<string, unknown> {
  const venta = comprobante.ventas;
  const cliente = venta?.clientes;
  const tipo = comprobante.tipo_comprobante === 'FACTURA' ? 1 : 2;

  if (!venta) {
    throw new Error('La venta del comprobante no existe.');
  }

  if (tipo === 1 && (!cliente || cliente.tipo_documento !== 'RUC' || soloDigitos(cliente.numero_documento).length !== 11)) {
    throw new Error('Para factura el cliente debe tener RUC valido.');
  }

  if (tipo === 2 && Number(venta.total) > 700 && (!cliente || soloDigitos(cliente.numero_documento).length < 8)) {
    throw new Error('Para boleta mayor a S/ 700 el cliente debe tener documento.');
  }

  return {
    operacion: 'generar_comprobante',
    tipo_de_comprobante: tipo,
    serie: comprobante.serie,
    numero: Number(comprobante.numero),
    sunat_transaction: 1,
    cliente_tipo_de_documento: tipoDocumentoNubefact(cliente?.tipo_documento),
    cliente_numero_de_documento: cliente?.numero_documento || '00000000',
    cliente_denominacion: cliente?.nombre_razon_social || 'Clientes varios',
    cliente_direccion: cliente?.direccion || '',
    fecha_de_emision: fechaNubefact(venta.created_at),
    moneda: 1,
    porcentaje_de_igv: 18,
    total_gravada: Number(venta.subtotal),
    total_igv: Number(venta.igv),
    total: Number(venta.total),
    enviar_automaticamente_a_la_sunat: true,
    enviar_automaticamente_al_cliente: false,
    formato_de_pdf: 'TICKET',
    items: (venta.venta_detalle ?? []).map((detalle: any) => {
      const total = Number(detalle.total);
      const precio = Number(detalle.precio_unitario);
      const subtotal = round(total / 1.18);

      return {
        unidad_de_medida: detalle.productos?.unidad_medida || 'NIU',
        codigo: detalle.productos?.codigo || detalle.productos?.id || detalle.combo_id,
        descripcion: detalle.descripcion || detalle.productos?.nombre || detalle.combos?.nombre || 'Producto',
        cantidad: Number(detalle.cantidad),
        valor_unitario: round(precio / 1.18),
        precio_unitario: precio,
        subtotal,
        tipo_de_igv: 1,
        igv: round(total - subtotal),
        total,
        anticipo_regularizacion: false
      };
    })
  };
}

export function buildConsultarPayload(comprobante: any): Record<string, unknown> {
  return {
    operacion: 'consultar_comprobante',
    tipo_de_comprobante: comprobante.tipo_comprobante === 'FACTURA' ? 1 : 2,
    serie: comprobante.serie,
    numero: Number(comprobante.numero)
  };
}

export function buildAnularPayload(comprobante: any): Record<string, unknown> {
  return {
    operacion: 'generar_anulacion',
    tipo_de_comprobante: comprobante.tipo_comprobante === 'FACTURA' ? 1 : 2,
    serie: comprobante.serie,
    numero: Number(comprobante.numero),
    motivo: 'ANULACION SOLICITADA'
  };
}

export async function callNubefact(ctx: SecureContext, payload: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const response = await fetch(ctx.apiUrl, {
    method: 'POST',
    headers: {
      Authorization: ctx.token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({ errors: 'Respuesta Nubefact no valida.' })) as Record<string, unknown>;
  return { ok: response.ok && !data.errors, data };
}

export function estadoDesdeRespuesta(ok: boolean, data: Record<string, unknown>): string {
  if (!ok) {
    return 'PENDIENTE_REINTENTO';
  }

  const tieneDocumento = Boolean(data.enlace || data.enlace_del_pdf || data.enlace_del_xml);

  if (tieneDocumento) {
    return 'EMITIDO';
  }

  return data.aceptada_por_sunat === false ? 'PENDIENTE_REINTENTO' : 'EMITIDO';
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo procesar la solicitud.';
}

function tipoDocumentoNubefact(tipo?: string): string {
  if (tipo === 'RUC') {
    return '6';
  }

  if (tipo === 'DNI') {
    return '1';
  }

  return '-';
}

function fechaNubefact(value: string): string {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(Number.isNaN(date.getTime()) ? new Date() : date);
  const day = parts.find(part => part.type === 'day')?.value ?? '01';
  const month = parts.find(part => part.type === 'month')?.value ?? '01';
  const year = parts.find(part => part.type === 'year')?.value ?? String(new Date().getFullYear());

  return `${day}-${month}-${year}`;
}

function soloDigitos(value = ''): string {
  return value.replace(/\D/g, '');
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
