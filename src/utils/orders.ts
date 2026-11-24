import type { OrderStatus } from '../types';

/** The normal path an order moves through; Cancelled can branch off before Delivered. */
export const ORDER_FLOW: OrderStatus[] = ['Pending', 'Confirmed', 'Shipped', 'Delivered'];
export const ORDER_STATUSES: OrderStatus[] = [...ORDER_FLOW, 'Cancelled'];
