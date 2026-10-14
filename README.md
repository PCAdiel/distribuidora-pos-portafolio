> Versión de portafolio: se han omitido credenciales, identificadores de proyectos Supabase, archivos generados y datos operativos. Configure sus propias variables en `src/environments/environment.ts` y `environment.prod.ts` antes de ejecutar la aplicación. Este repositorio presenta un proyecto académico y no debe conectarse a sistemas con datos reales.

# Distribuidora Mariva POS

App Ionic/Angular + Capacitor + Supabase para una distribuidora pequena. Esta preparada para venta POS, stock, clientes, caja, impresion termica Bluetooth/LAN, modo offline y facturacion Nubefact mediante Edge Functions.

## Demostración para portafolio

La carpeta `demo/` contiene un prototipo interactivo autónomo con catálogo y ventas ficticias. Permite agregar productos al carrito, simular un cobro y ver cómo cambia el inventario. No se conecta a Supabase, Nubefact ni impresoras, y no registra operaciones reales.

**Demo interactiva:** https://distribuidora-mariva-demo.vercel.app/

La demostración estática vive en `demo/` y tiene su configuración de Vercel. La aplicación completa de Ionic/Angular se mantiene en la raíz del repositorio y necesita configurar un proyecto Supabase propio.

## Instalacion local

```bash
npm install
npm start
```

Si `ionic` no existe como comando global, usa:

```bash
npx ionic serve
```

## Variables de entorno

Los archivos `src/environments/environment.ts` y `src/environments/environment.prod.ts` no deben guardar tokens privados. Copia la estructura de:

```txt
src/environments/environment.example.ts
```

Configura:

```ts
supabaseUrl: 'SUPABASE_URL',
supabaseAnonKey: 'SUPABASE_ANON_KEY'
```

La anon key puede vivir en la app, pero la seguridad debe estar en RLS. Nunca uses `service_role` en Ionic.

## Supabase

1. Ejecuta primero `supabase/schema.sql` si la base esta vacia.
2. Ejecuta la migracion:

```txt
supabase/migrations/20260610120000_pos_beta_rpc_json.sql
supabase/migrations/20260611100000_phase1_security_nubefact.sql
supabase/migrations/20260611110000_phase2_kardex_inventory_reports.sql
supabase/migrations/20260611120000_phase3_combos_lotes_pos.sql
```

3. Al final la migracion ejecuta:

```sql
select pg_notify('pgrst', 'reload schema');
```

Esto recarga PostgREST y corrige el error `PGRST202` de `registrar_venta_pos`.

## Venta transaccional

El frontend usa:

```ts
registrar_venta_pos_json(p_payload jsonb)
```

La funcion SQL:

- valida usuario autenticado y empresa;
- no confia en precios del frontend;
- valida stock con `select for update`;
- descuenta stock dentro de la transaccion;
- registra venta, detalle, pagos y comprobante local;
- usa `client_sale_id` para evitar duplicados por doble toque o reintentos offline.

## Offline

Cuando no hay internet, la venta se guarda en IndexedDB con estado `PENDIENTE_SYNC`. Al volver la conexion, el POS puede sincronizarla sin duplicar gracias a `client_sale_id`.

## Kardex y reportes

La fase 2 agrega:

- `kardex_movimientos`
- `producto_lotes`
- `combos`
- `combo_items`
- inventario valorizado
- stock minimo
- productos por vencer
- ventas por metodo de pago
- productos mas vendidos
- ingresos/egresos
- comprobantes por estado

Cada venta registrada por `registrar_venta_pos_json` descuenta stock y genera una salida en Kardex.

La fase 3 agrega:

- combos visibles en POS mediante `listar_combos_pos()`
- venta transaccional de combos desde `registrar_venta_pos_json`
- descuento de stock de componentes con `SELECT FOR UPDATE`
- detalle de venta con `tipo_item`, `combo_id` y `descripcion`
- registro de Kardex tipo `COMBO`
- registro rapido de lotes y ajustes desde Productos
- Kardex reciente visible en Reportes

La fase 4 agrega:

- pantalla `/combos` para crear, editar y desactivar combos desde la app
- seleccion de componentes por producto y cantidad
- validacion de combos sin componentes, productos no sincronizados y cantidades invalidas
- menu y ruta de Combos visibles solo para ADMIN
- POS listo para vender combos creados desde la interfaz

## Nubefact

Nubefact queda preparado, pero no activo por defecto:

```ts
nubefactEnabled: false
```

El token no debe ir en el APK. Configuralo como secret de Supabase:

```bash
supabase secrets set NUBEFACT_API_URL="https://api.nubefact.com/api/v1/..."
supabase secrets set NUBEFACT_TOKEN="TOKEN_DEL_CLIENTE"
supabase secrets set NUBEFACT_ENV="demo"
```

Despliega las funciones seguras:

```bash
supabase functions deploy emitir-comprobante
supabase functions deploy consultar-comprobante
supabase functions deploy anular-comprobante
```

El frontend solo envia `comprobante_id`. Las funciones leen venta, cliente, detalle y comprobante desde Supabase, validan JWT/empresa/rol y recien llaman a Nubefact.

Cuando se active Nubefact, la venta debe registrarse primero. Si Nubefact falla, la venta no se pierde: el comprobante queda como `PENDIENTE_REINTENTO` o `ERROR_FACTURACION`.

## Impresion

La app soporta:

- Bluetooth en Android con impresora emparejada.
- WiFi/LAN por IP y puerto, usualmente `9100`.
- Precuenta.
- Boleta/factura local en formato ticket de 80 mm.

En navegador se usa `window.print()` porque Chrome no imprime directo a Bluetooth. En Android usa el plugin nativo.

## Android

Generar web y sincronizar Capacitor:

```bash
npm run build:prod
npx cap sync android
npx cap open android
```

APK debug para pruebas:

```bash
cd android
.\gradlew assembleDebug
```

APK release firmada:

1. Crea un keystore fuera del repo.
2. Configura firma en Android Studio o `gradle.properties` local.
3. Ejecuta:

```bash
cd android
.\gradlew assembleRelease
```

No subas `.jks`, `.keystore`, `.env` ni `release.properties`.

## Checklist rapido

Revisa `docs/PRODUCCION_CHECKLIST.md` antes de entregar al cliente.
