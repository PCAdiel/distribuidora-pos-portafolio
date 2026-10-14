# Integración con proveedor API de facturación

## Flujo correcto

1. Ionic registra la venta.
2. Ionic llama a una Supabase Edge Function.
3. La Edge Function llama al proveedor API.
4. El proveedor envía a SUNAT.
5. El proveedor devuelve PDF, XML y CDR.
6. La app muestra el estado e imprime el ticket.

## Seguridad

- Nunca guardar Clave SOL en Ionic.
- Nunca exponer token del proveedor en `environment.ts`.
- Guardar tokens como secretos del backend/Edge Function.
- El RUC puede guardarse en tabla `empresas`.
- El certificado digital debe configurarse en el proveedor o almacenarse cifrado en backend.

## Datos mínimos para emitir

### Boleta
- Tipo comprobante: 03
- Serie: B001
- Cliente: DNI o cliente general
- Productos: unidad, descripción, cantidad, precio, IGV
- Totales

### Factura
- Tipo comprobante: 01
- Serie: F001
- Cliente con RUC obligatorio
- Razón social y dirección
- Productos y totales

## En producción

Reemplaza el endpoint falso `/comprobantes` dentro de:
`supabase/functions/emitir-comprobante/index.ts`

por el endpoint real del proveedor contratado.
