import type { ProductStatus } from '../types';
import { api, unwrap, type ApiResponse } from './apiClient';

// ---- Backend shapes (see /docs → Products) ----

interface ApiProduct {
  id: number;
  name: string;
  sku: string | null;
  description: string | null;
  unit_price: string;
  stock_quantity: number;
  is_active: boolean;
  units_sold?: number;
  total_sales?: string;
  category: string | null;
  deleted_at: string | null;
  is_low_stock: boolean;
}

interface ApiProductList {
  items: ApiProduct[];
  total: number;
  limit: number;
  offset: number;
}

interface ApiProductStats {
  total: number;
  active: number;
  discontinued: number;
  low_stock: number;
  stock_value: string;
  low_stock_threshold: number;
  best_seller: { id: number; name: string; units_sold: number; total_sales: string } | null;
}

// ---- App shapes ----

export interface ProductRecord {
  id: string;
  name: string;
  sku: string;
  category: string;
  description: string;
  price: number;
  stock: number;
  status: ProductStatus;
  unitsSold: number;
  revenue: number;
  lowStock: boolean;
  deletedAt: string | null;
}

export interface ProductInput {
  name: string;
  sku: string;
  category: string;
  description: string;
  price: number;
  stock: number;
  status: ProductStatus;
}

export interface ProductSummary {
  total: number;
  active: number;
  discontinued: number;
  lowStock: number;
  stockValue: number;
  lowStockThreshold: number;
  bestSeller: { id: string; name: string; unitsSold: number; revenue: number } | null;
}

export interface ProductQuery {
  search?: string;
  category?: string;
  status?: ProductStatus | '';
  inStockOnly?: boolean;
  includeDeleted?: boolean;
  limit: number;
  offset: number;
}

const toRecord = (p: ApiProduct): ProductRecord => ({
  id: String(p.id),
  name: p.name,
  sku: p.sku ?? '',
  category: p.category ?? '',
  description: p.description ?? '',
  price: Number(p.unit_price) || 0,
  stock: p.stock_quantity,
  status: p.is_active ? 'Active' : 'Discontinued',
  unitsSold: p.units_sold ?? 0,
  revenue: Number(p.total_sales ?? 0) || 0,
  lowStock: p.is_low_stock,
  deletedAt: p.deleted_at ?? null,
});

const toBody = (p: ProductInput) => ({
  name: p.name,
  sku: p.sku,
  category: p.category,
  description: p.description || null,
  unit_price: p.price,
  stock_quantity: p.stock,
  is_active: p.status === 'Active',
});

export const productApi = {
  async list(q: ProductQuery): Promise<{ items: ProductRecord[]; total: number }> {
    const { data } = await api.get<ApiResponse<ApiProductList>>('/products', {
      params: {
        search: q.search || undefined,
        category: q.category || undefined,
        is_active: q.status ? q.status === 'Active' : undefined,
        in_stock_only: q.inStockOnly || undefined,
        include_deleted: q.includeDeleted || undefined,
        limit: q.limit,
        offset: q.offset,
      },
    });
    const list = unwrap(data, 'Could not load products.');
    return { items: list.items.map(toRecord), total: list.total };
  },

  async summary(lowStockThreshold?: number): Promise<ProductSummary> {
    const { data } = await api.get<ApiResponse<ApiProductStats>>('/products/summary', {
      params: { low_stock_threshold: lowStockThreshold },
    });
    const s = unwrap(data, 'Could not load product figures.');
    return {
      total: s.total,
      active: s.active,
      discontinued: s.discontinued,
      lowStock: s.low_stock,
      stockValue: Number(s.stock_value) || 0,
      lowStockThreshold: s.low_stock_threshold,
      bestSeller: s.best_seller
        ? {
            id: String(s.best_seller.id),
            name: s.best_seller.name,
            unitsSold: s.best_seller.units_sold,
            revenue: Number(s.best_seller.total_sales) || 0,
          }
        : null,
    };
  },

  async categories(): Promise<{ name: string; count: number }[]> {
    const { data } = await api.get<ApiResponse<{ name: string; product_count: number }[]>>('/products/categories');
    return unwrap(data, 'Could not load categories.').map((c) => ({ name: c.name, count: c.product_count }));
  },

  async create(input: ProductInput): Promise<ProductRecord> {
    const { data } = await api.post<ApiResponse<ApiProduct>>('/products', toBody(input));
    return toRecord(unwrap(data, 'Could not create the product.'));
  },

  async update(id: string, input: ProductInput): Promise<ProductRecord> {
    const { data } = await api.put<ApiResponse<ApiProduct>>(`/products/${id}`, toBody(input));
    return toRecord(unwrap(data, 'Could not save the product.'));
  },

  async setStatus(id: string, status: ProductStatus): Promise<ProductRecord> {
    const { data } = await api.patch<ApiResponse<ApiProduct>>(`/products/${id}/status`, { is_active: status === 'Active' });
    return toRecord(unwrap(data, 'Could not change the status.'));
  },

  /** Adds (positive) or removes (negative) units; the API never lets stock go below zero. */
  async adjustStock(id: string, delta: number): Promise<ProductRecord> {
    const { data } = await api.post<ApiResponse<ApiProduct>>(`/products/${id}/stock/adjust`, { delta });
    return toRecord(unwrap(data, 'Could not adjust the stock.'));
  },

  async remove(id: string): Promise<void> {
    const { data } = await api.delete<ApiResponse<null>>(`/products/${id}`);
    unwrap(data, 'Could not delete the product.');
  },

  async restore(id: string): Promise<ProductRecord> {
    const { data } = await api.post<ApiResponse<ApiProduct>>(`/products/${id}/restore`);
    return toRecord(unwrap(data, 'Could not restore the product.'));
  },
};
