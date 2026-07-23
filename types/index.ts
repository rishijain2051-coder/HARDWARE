import { RecipientType, AttributeType, AuditAction, TransactionType } from "@prisma/client";

// ============================================================
// API Types
// ============================================================

export interface PaginatedRequest {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  search?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================
// Auth Types
// ============================================================

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: {
    id: string;
    name: string;
  };
  isActive: boolean;
}

// ============================================================
// Master Types
// ============================================================

export interface CategoryWithCount {
  id: string;
  name: string;
  isActive: boolean;
  _count: { products: number };
  attributes: Array<{
    attribute: {
      id: string;
      name: string;
      type: AttributeType;
      isRequired: boolean;
      isSearchable: boolean;
      options: string[];
    };
    sortOrder: number;
  }>;
}

export interface ProductFormData {
  description: string;
  categoryId: string;
  unitId: string;
  finish?: string;
  size?: string;
  minStock: number;
  openingStock?: number;
  defaultBinId?: string;
  imageUrl?: string;
  aliases: string[];
  attributeValues: Array<{
    attributeId: string;
    value: string;
  }>;
}

export interface ProductListItem {
  id: string;
  sku: string;
  description: string;
  category: { id: string; name: string };
  unit: { id: string; name: string; abbreviation: string };
  currentStock: number;
  minStock: number;
  isActive: boolean;
  imageUrl: string | null;
  lastPurchaseRate: number | null;
}

// ============================================================
// GRN Types
// ============================================================

export interface GrnFormData {
  date: string;
  supplierId: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  remarks?: string;
  items: GrnItemFormData[];
}

export interface GrnItemFormData {
  productId: string;
  quantity: number;
  purchaseUnitName?: string;
  conversionFactor: number;
  rate: number;
  binId?: string;
}

export interface GrnListItem {
  id: string;
  grnNumber: string;
  date: string;
  supplier: { id: string; name: string };
  invoiceNumber: string | null;
  itemCount: number;
  totalQuantity: number;
  createdBy: { id: string; name: string };
  isDeleted: boolean;
}

// ============================================================
// MIS Types
// ============================================================

export interface MisFormData {
  date: string;
  recipientType: RecipientType;
  staffId?: string;
  purpose?: string;
  items: MisItemFormData[];
}

export interface MisItemFormData {
  productId: string;
  quantity: number;
  binId?: string;
}

export interface MisListItem {
  id: string;
  misNumber: string;
  date: string;
  recipientType: RecipientType;
  staff: { id: string; name: string } | null;
  purpose: string | null;
  itemCount: number;
  totalQuantity: number;
  createdBy: { id: string; name: string };
  isDeleted: boolean;
}

// ============================================================
// Search Types
// ============================================================

export interface SearchResult {
  id: string;
  sku: string;
  description: string;
  category: string;
  currentStock: number;
  unit: string;
  imageUrl: string | null;
  isActive: boolean;
  score: number;
}

// ============================================================
// Report Types
// ============================================================

export interface DashboardKPIs {
  todayGrns: number;
  todayMis: number;
  itemsReceivedToday: number;
  itemsIssuedToday: number;
  lowStockCount: number;
  negativeStockCount: number;
  totalProducts: number;
  activeSuppliers: number;
  activeStaff: number;
  todayPurchaseValue: number;
  todayConsumptionQty: number;
}

export interface StoreLogEntry {
  id: string;
  date: string;
  transactionType: TransactionType;
  referenceNumber: string;
  product: { id: string; sku: string; description: string };
  quantity: number;
  balanceAfter: number;
  supplier: { id: string; name: string } | null;
  staff: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
}

// Re-export Prisma enums for convenience
export { RecipientType, AttributeType, AuditAction, TransactionType };
