import { Injectable } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { TicketItem } from '../../models/ticket.model';
import { Venta } from '../../models/venta.model';

interface ThermalPrinterPlugin {
  printLan(options: { host: string; port: number; payload: string; timeoutMs?: number }): Promise<void>;
  printBluetooth(options: { address?: string; name?: string; payload: string; timeoutMs?: number }): Promise<void>;
  listBluetoothPrinters(): Promise<{ devices: BluetoothPrinterDevice[] }>;
}

export interface BluetoothPrinterDevice {
  name: string;
  address: string;
}

interface ImpresoraConfig {
  tipo: string;
  ip: string;
  puerto: number;
  papel: string;
  bluetoothAddress: string;
  bluetoothName: string;
  imprimirRecibos: boolean;
}

interface EmpresaImpresion {
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  direccion: string;
  telefono: string;
  correo: string;
}

interface PrecuentaPayload {
  cliente: string;
  detalles: TicketItem[];
  subtotal: number;
  igv: number;
  total: number;
}

type Align = 'left' | 'center' | 'right';
type TextSize = 'normal' | 'tall' | 'wide' | 'big';

const ThermalPrinter = registerPlugin<ThermalPrinterPlugin>('ThermalPrinter');

@Injectable({ providedIn: 'root' })
export class ImpresionService {
  async listarImpresorasBluetooth(): Promise<BluetoothPrinterDevice[]> {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('La busqueda Bluetooth solo funciona en Android.');
    }

    const result = await ThermalPrinter.listBluetoothPrinters();
    return result.devices ?? [];
  }

  async imprimirVenta(venta: Venta): Promise<void> {
    const bytes = venta.tipoComprobante === 'FACTURA'
      ? this.construirFactura(venta)
      : this.construirBoleta(venta);

    await this.imprimirBytes(bytes);
  }

  async imprimirPrecuenta(payload: PrecuentaPayload): Promise<void> {
    await this.imprimirBytes(this.construirPrecuenta(payload));
  }

  async imprimirPrueba(): Promise<void> {
    await this.imprimirBytes(this.construirPrecuenta({
      cliente: 'Prueba',
      detalles: [{
        producto: {
          id: 'demo',
          nombre: 'Producto de prueba Xprinter 80 mm',
          categoria: 'Prueba',
          unidadMedida: 'NIU',
          precioVenta: 12.5,
          stock: 1,
          stockMinimo: 0,
          activo: true
        },
        cantidad: 1,
        precioUnitario: 12.5,
        total: 12.5
      }],
      subtotal: 10.59,
      igv: 1.91,
      total: 12.5
    }));
  }

  private async imprimirBytes(bytes: Uint8Array): Promise<void> {
    const config = this.obtenerConfig();

    if (!config.imprimirRecibos) {
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      window.print();
      return;
    }

    if (config.tipo === 'BLUETOOTH') {
      if (!config.bluetoothAddress.trim() && !config.bluetoothName.trim()) {
        throw new Error('Selecciona una impresora Bluetooth emparejada en Configuracion.');
      }

      await ThermalPrinter.printBluetooth({
        address: config.bluetoothAddress.trim(),
        name: config.bluetoothName.trim(),
        payload: this.bytesToBase64(bytes),
        timeoutMs: 5000
      });
      return;
    }

    if (!['ETHERNET', 'WIFI'].includes(config.tipo)) {
      throw new Error('Selecciona una interfaz de impresora valida.');
    }

    if (!config.ip.trim()) {
      throw new Error('Configura la IP de la impresora.');
    }

    await ThermalPrinter.printLan({
      host: config.ip.trim(),
      port: config.puerto,
      payload: this.bytesToBase64(bytes),
      timeoutMs: 5000
    });
  }

  private construirPrecuenta(payload: PrecuentaPayload): Uint8Array {
    const empresa = this.obtenerEmpresa();
    const printer = new EscPosBuilder(this.obtenerAncho());
    this.imprimirEncabezado(printer, empresa, false);

    printer.separator();
    printer.center('CUENTA', 'big', true);
    printer.line();
    printer.left(`Pedido: Ticket - ${this.hora(new Date())}`);
    printer.left('Empleado: Propietario');
    printer.wrap(`Cliente: ${payload.cliente}`);
    printer.separator();
    this.imprimirItems(printer, payload.detalles);
    this.imprimirTotales(printer, payload.subtotal, payload.igv, payload.total, false);
    printer.center('Cuenta sin cobrar', 'normal', false);
    printer.feed(4).cut();
    return printer.toBytes();
  }

  private construirBoleta(venta: Venta): Uint8Array {
    const empresa = this.obtenerEmpresa();
    const printer = new EscPosBuilder(this.obtenerAncho());
    this.imprimirEncabezado(printer, empresa, true);

    printer.separator();
    printer.center('BOLETA', 'big', true);
    printer.center('DE VENTA', 'wide', true);
    printer.center(this.serieNumero(venta), 'tall', true);
    printer.separator();
    this.imprimirDatosComprobante(printer, venta);
    this.imprimirItems(printer, venta.detalles);
    this.imprimirTotales(printer, venta.subtotal, venta.igv, venta.total, true);
    this.imprimirPieFiscal(printer, venta);
    printer.feed(4).cut();
    return printer.toBytes();
  }

  private construirFactura(venta: Venta): Uint8Array {
    const empresa = this.obtenerEmpresa();
    const printer = new EscPosBuilder(this.obtenerAncho());
    this.imprimirEncabezado(printer, empresa, true);

    printer.separator();
    printer.center('FACTURA', 'big', true);
    printer.center(this.serieNumero(venta), 'tall', true);
    printer.separator();
    this.imprimirDatosComprobante(printer, venta);
    this.imprimirItems(printer, venta.detalles);
    this.imprimirTotales(printer, venta.subtotal, venta.igv, venta.total, true);
    this.imprimirPieFiscal(printer, venta);
    printer.feed(4).cut();
    return printer.toBytes();
  }

  private imprimirEncabezado(printer: EscPosBuilder, empresa: EmpresaImpresion, mostrarRuc: boolean): void {
    printer.center(empresa.nombreComercial || 'Distribuidora Mariva', 'tall', true);
    printer.center(empresa.razonSocial || 'Distribuidora Mariva', 'normal', true);

    if (mostrarRuc && empresa.ruc) {
      printer.center(`RUC ${empresa.ruc}`, 'normal', true);
    }

    if (empresa.direccion) {
      printer.wrap(empresa.direccion, 'center');
    }

    if (empresa.telefono) {
      printer.wrap(`Contacto: ${empresa.telefono}`, 'center');
    }

    if (empresa.correo) {
      printer.wrap(empresa.correo, 'center');
    }
  }

  private imprimirDatosComprobante(printer: EscPosBuilder, venta: Venta): void {
    const fecha = new Date(venta.fecha);
    const cliente = venta.cliente;

    printer.left(`F. Emision: ${this.fecha(fecha)}`);
    printer.left(`H. Emision: ${this.hora(fecha)}`);
    printer.wrap(`Cliente: ${cliente?.nombreRazonSocial ?? 'Clientes varios'}`);
    printer.left(`Doc: ${cliente?.numeroDocumento || '99999999'}`);

    if (cliente?.direccion) {
      printer.wrap(`Direccion: ${cliente.direccion}`);
    }

    printer.separator();
  }

  private imprimirItems(printer: EscPosBuilder, items: TicketItem[]): void {
    printer.left('Cant. Descripcion              Total', true);
    printer.separator();

    for (const item of items) {
      const cantidad = this.formatearCantidad(item.cantidad);
      const total = `S/ ${item.total.toFixed(2)}`;
      printer.wrap(`${cantidad} ${item.producto.nombre}`, 'left', true);
      printer.row(`${item.cantidad} x S/ ${item.precioUnitario.toFixed(2)}`, total);
      printer.line();
    }

    printer.separator();
  }

  private imprimirTotales(printer: EscPosBuilder, subtotal: number, igv: number, total: number, mostrarImpuestos: boolean): void {
    if (mostrarImpuestos) {
      printer.row('Op. Gravadas:', `S/ ${subtotal.toFixed(2)}`, true);
      printer.row('IGV:', `S/ ${igv.toFixed(2)}`, true);
    }

    printer.line();
    printer.center('TOTAL A PAGAR', 'tall', true);
    printer.center(`S/ ${total.toFixed(2)}`, 'big', true);
    printer.line();
  }

  private imprimirPieFiscal(printer: EscPosBuilder, venta: Venta): void {
    const comprobante = venta.comprobante;
    const emitido = comprobante?.estado === 'EMITIDO' || comprobante?.estado === 'ACEPTADO';
    const pendiente = ['PENDIENTE_FACTURACION', 'PENDIENTE_REINTENTO', 'ENVIANDO', 'ERROR_FACTURACION'].includes(comprobante?.estado ?? '');
    const qr = this.obtenerDatoQr(venta);

    printer.wrap(`Son: S/ ${venta.total.toFixed(2)}`, 'center');
    printer.line();

    if (emitido) {
      printer.center('COMPROBANTE ELECTRONICO', 'normal', true);

      if (comprobante?.sunatDescription) {
        printer.wrap(comprobante.sunatDescription, 'center');
      } else {
        printer.center('Emitido correctamente', 'normal', false);
      }

      if (comprobante?.sunatResponseCode) {
        printer.center(`SUNAT: ${comprobante.sunatResponseCode}`, 'normal', false);
      }

      if (qr) {
        printer.line();
        printer.center('CODIGO QR', 'normal', true);
        printer.qr(qr);
      }

      if (comprobante?.codigoHash) {
        printer.wrap(`Hash: ${comprobante.codigoHash}`, 'center');
      }

      if (comprobante?.pdfUrl) {
        printer.wrap(`PDF: ${comprobante.pdfUrl}`, 'center');
      }

      if (comprobante?.xmlUrl) {
        printer.wrap(`XML: ${comprobante.xmlUrl}`, 'center');
      }
    } else if (pendiente) {
      printer.center('COMPROBANTE PENDIENTE', 'normal', true);
      printer.wrap('La venta fue registrada. La facturacion electronica queda pendiente de consulta o reintento.', 'center');
    } else {
      printer.center('COMPROBANTE LOCAL', 'normal', true);
      printer.wrap('Representacion impresa generada desde el POS.', 'center');
    }

    printer.line();
    printer.center('Representacion impresa del', 'normal', false);
    printer.center('comprobante electronico', 'normal', false);
    printer.center('Gracias por su compra.', 'normal', true);
  }

  private obtenerConfig(): ImpresoraConfig {
    const puerto = Number(localStorage.getItem('cfg_impresora_puerto') || 9100);

    return {
      tipo: localStorage.getItem('cfg_impresora') || 'ETHERNET',
      ip: localStorage.getItem('cfg_impresora_ip') || '',
      puerto: Number.isFinite(puerto) && puerto > 0 ? puerto : 9100,
      papel: localStorage.getItem('cfg_papel') || '80mm',
      bluetoothAddress: localStorage.getItem('cfg_impresora_bluetooth_address') || '',
      bluetoothName: localStorage.getItem('cfg_impresora_bluetooth_name') || '',
      imprimirRecibos: localStorage.getItem('cfg_imprimir_recibos') !== 'false'
    };
  }

  private obtenerEmpresa(): EmpresaImpresion {
    const raw = localStorage.getItem('cfg_empresa');
    let empresa: Partial<EmpresaImpresion & { razonSocial?: string; nombreComercial?: string; logoUrl?: string }> = {};

    if (raw) {
      try {
        empresa = JSON.parse(raw);
      } catch {
        empresa = {};
      }
    }

    return {
      ruc: empresa.ruc || localStorage.getItem('cfg_ruc') || '',
      razonSocial: empresa.razonSocial || localStorage.getItem('cfg_razon') || 'Distribuidora Mariva',
      nombreComercial: empresa.nombreComercial || localStorage.getItem('cfg_nombre_comercial') || 'Distribuidora Mariva',
      direccion: empresa.direccion || '',
      telefono: empresa.telefono || '',
      correo: empresa.correo || ''
    };
  }

  private obtenerAncho(): number {
    return (localStorage.getItem('cfg_papel') || '80mm') === '58mm' ? 32 : 42;
  }

  private serieNumero(venta: Venta): string {
    if (venta.comprobante?.serie && venta.comprobante?.numero) {
      return `${venta.comprobante.serie}-${String(venta.comprobante.numero).padStart(8, '0')}`;
    }

    return venta.tipoComprobante === 'FACTURA' ? 'F001-PENDIENTE' : 'B001-PENDIENTE';
  }

  private fecha(fecha: Date): string {
    return fecha.toISOString().slice(0, 10);
  }

  private hora(fecha: Date): string {
    return fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  private formatearCantidad(cantidad: number): string {
    return Number.isInteger(cantidad) ? String(cantidad) : cantidad.toFixed(2);
  }

  private obtenerDatoQr(venta: Venta): string {
    const comprobante = venta.comprobante;

    if (comprobante?.cadenaQr) {
      return comprobante.cadenaQr;
    }

    if (comprobante?.enlace) {
      return comprobante.enlace;
    }

    if (comprobante?.pdfUrl) {
      return comprobante.pdfUrl;
    }

    if (!comprobante?.serie || !comprobante?.numero) {
      return '';
    }

    const clienteDocumento = venta.cliente?.numeroDocumento || '00000000';
    return [
      comprobante.tipo,
      comprobante.serie,
      comprobante.numero,
      venta.igv.toFixed(2),
      venta.total.toFixed(2),
      this.fecha(new Date(venta.fecha)),
      clienteDocumento,
      comprobante.codigoHash || ''
    ].join('|');
  }

  private bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary);
  }
}

class EscPosBuilder {
  private readonly bytes: number[] = [];
  private readonly encoder = new TextEncoder();

  constructor(private readonly width: number) {
    this.command(0x1b, 0x40);
    this.align('left');
    this.size('normal');
  }

  center(text: string, size: TextSize = 'normal', bold = false): this {
    this.align('center');
    this.size(size);
    this.bold(bold);
    this.textLine(text);
    this.bold(false);
    this.size('normal');
    this.align('left');
    return this;
  }

  left(text: string, bold = false): this {
    this.align('left');
    this.size('normal');
    this.bold(bold);
    this.textLine(text);
    this.bold(false);
    return this;
  }

  wrap(text: string, align: Align = 'left', bold = false): this {
    const lines = this.dividir(text, this.width);
    this.align(align);
    this.size('normal');
    this.bold(bold);
    lines.forEach(line => this.textLine(line));
    this.bold(false);
    this.align('left');
    return this;
  }

  row(left: string, right: string, bold = false): this {
    const available = Math.max(1, this.width - right.length - 1);
    const leftLines = this.dividir(left, available);
    this.left(leftLines[0].padEnd(this.width - right.length, ' ') + right, bold);

    for (const line of leftLines.slice(1)) {
      this.left(line, bold);
    }

    return this;
  }

  qr(data: string): this {
    const value = this.ascii(data).trim();

    if (!value) {
      return this;
    }

    const qrBytes = Array.from(this.encoder.encode(value));
    const length = qrBytes.length + 3;
    const pL = length % 256;
    const pH = Math.floor(length / 256);

    this.align('center');
    this.command(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    this.command(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06);
    this.command(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30);
    this.command(0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30, ...qrBytes);
    this.command(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
    this.align('left');
    this.line();
    return this;
  }

  separator(char = '-'): this {
    return this.left(char.repeat(this.width));
  }

  line(): this {
    this.textLine('');
    return this;
  }

  feed(lines: number): this {
    for (let i = 0; i < lines; i++) {
      this.line();
    }

    return this;
  }

  cut(): this {
    this.command(0x1d, 0x56, 0x00);
    return this;
  }

  toBytes(): Uint8Array {
    return new Uint8Array(this.bytes);
  }

  private align(value: Align): void {
    const code = value === 'center' ? 1 : value === 'right' ? 2 : 0;
    this.command(0x1b, 0x61, code);
  }

  private bold(enabled: boolean): void {
    this.command(0x1b, 0x45, enabled ? 1 : 0);
  }

  private size(value: TextSize): void {
    const code = value === 'big' ? 0x11 : value === 'wide' ? 0x10 : value === 'tall' ? 0x01 : 0x00;
    this.command(0x1d, 0x21, code);
  }

  private textLine(text: string): void {
    this.text(this.ascii(text));
    this.command(0x0a);
  }

  private text(text: string): void {
    this.bytes.push(...this.encoder.encode(text));
  }

  private command(...values: number[]): void {
    this.bytes.push(...values);
  }

  private dividir(text: string, width: number): string[] {
    const words = this.ascii(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      if (!current) {
        current = word.slice(0, width);
        continue;
      }

      if (`${current} ${word}`.length <= width) {
        current = `${current} ${word}`;
        continue;
      }

      lines.push(current);
      current = word.slice(0, width);
    }

    if (current) {
      lines.push(current);
    }

    return lines.length ? lines : [''];
  }

  private ascii(text: string): string {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]/g, '');
  }
}
