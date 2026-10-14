import { Injectable } from '@angular/core';
import { TicketItem } from '../../models/ticket.model';

@Injectable({ providedIn: 'root' })
export class PosCalculatorService {
  total(items: TicketItem[]): number {
    return this.round(items.reduce((sum, item) => sum + item.total, 0));
  }

  subtotal(items: TicketItem[]): number {
    return this.round(this.total(items) / 1.18);
  }

  igv(items: TicketItem[]): number {
    return this.round(this.total(items) - this.subtotal(items));
  }

  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
