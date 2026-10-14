# Checklist de produccion - Distribuidora Mariva

## Supabase

- Ejecutar `supabase/schema.sql` si la base esta vacia.
- Ejecutar `supabase/migrations/20260610120000_pos_beta_rpc_json.sql`.
- Ejecutar `supabase/migrations/20260611100000_phase1_security_nubefact.sql`.
- Ejecutar `supabase/migrations/20260611110000_phase2_kardex_inventory_reports.sql`.
- Ejecutar `supabase/migrations/20260611120000_phase3_combos_lotes_pos.sql`.
- Confirmar que `registrar_venta_pos_json(jsonb)` existe.
- Confirmar que `listar_combos_pos()` existe.
- Confirmar que `ventas_empresa_client_sale_id_uidx` existe.
- Confirmar que `comprobantes_empresa_tipo_serie_numero_uidx` existe.
- Confirmar que `kardex_movimientos`, `producto_lotes`, `combos` y `combo_items` existen.
- Confirmar que cada venta nueva genera movimiento `VENTA` en Kardex.
- Confirmar RLS activo en empresas, usuarios_empresa, productos, clientes, ventas, venta_detalle, pagos, comprobantes, caja_turnos, caja_movimientos, tickets, ticket_items, facturacion_config y facturacion_eventos.
- Confirmar que ningun usuario puede cambiarse a `ADMIN` desde frontend.
- Confirmar que productos/clientes/ventas se filtran por `empresa_id`.

## App

- Configurar `supabaseUrl` y `supabaseAnonKey`.
- Crear empresa.
- Crear usuario admin real.
- Crear usuarios CAJERO/VENDEDOR desde configuracion y probar login.
- Cargar productos con precio, stock, categoria y estado activo.
- Cargar clientes con DNI/RUC segun corresponda.

## Ventas

- Probar venta online.
- Probar doble toque en `Cobrar / Emitir`: no debe duplicar.
- Probar producto sin stock: debe bloquear.
- Probar boleta menor o igual a S/ 700 con cliente general.
- Probar boleta mayor a S/ 700 exigiendo documento.
- Probar factura exigiendo RUC, razon social y direccion.
- Probar que el stock baja correctamente.
- Crear un combo en Supabase y probar venta de combo desde POS.
- Crear un combo desde la pantalla Combos como ADMIN.
- Confirmar que CAJERO/VENDEDOR no ven la opcion Combos en el menu.
- Confirmar que la venta de combo descuenta stock de sus componentes.
- Confirmar que la venta de combo genera Kardex tipo `COMBO`.
- Revisar reporte de inventario valorizado.
- Revisar Kardex reciente.
- Revisar reporte de stock minimo.
- Revisar productos por vencer si se registraron lotes.
- Revisar ventas por metodo de pago.
- Revisar productos mas vendidos.

## Offline

- Apagar internet.
- Registrar venta.
- Confirmar mensaje de venta pendiente.
- Volver a internet.
- Sincronizar pendientes.
- Confirmar que no duplica venta.

## Caja

- Abrir turno.
- Registrar venta.
- Registrar ingreso/egreso.
- Cerrar turno.
- Revisar historial.

## Impresion

- Emparejar XPrinter por Bluetooth en Android.
- Seleccionar impresora en Configuracion.
- Probar impresion de prueba.
- Probar precuenta.
- Probar boleta/factura local.
- Probar LAN con IP y puerto 9100 si aplica.
- Desconectar impresora y confirmar que la app no crashea.

## Nubefact

- No activar hasta tener ruta, token, RUC, razon social, direccion, ubigeo y series.
- Guardar `NUBEFACT_API_URL`, `NUBEFACT_TOKEN` y `NUBEFACT_ENV` como secrets de Supabase.
- Desplegar `emitir-comprobante`, `consultar-comprobante`, `anular-comprobante`.
- Activar `nubefactEnabled` solo cuando los datos esten validados.
- Probar comprobante demo antes de produccion.

## Android APK

- Ejecutar `npm run build:prod`.
- Ejecutar `npx cap sync android`.
- Abrir Android Studio con `npx cap open android`.
- Aceptar licencias SDK.
- Generar APK debug para pruebas.
- Probar en Android real con internet y sin internet.
- Generar APK release firmada para entrega.
