// "pending" is used while a new user waits for approval/subscription.
// Rollar: admin | cashier (sotuvchi) | warehouse (omborchi) | viewer (faqat ko'ruvchi)
// "accountant" eski yozuvlar bilan moslik uchun saqlangan (viewer bilan teng huquqli).
export type Role = "admin" | "cashier" | "warehouse" | "viewer" | "accountant" | "pending";

export type PaymentType = "cash" | "card";

export type Product = {
  id: string;
  shopId: string;
  name: string;
  barcode: string;
  /**
   * Mahsulot turi:
   *  - "product" (default) — tayyor mahsulot, kassada sotiladi
   *  - "material" — xomashyo/detal (tunuka, kabel, shurup...), sotilmaydi,
   *    faqat ishlab chiqarishda ishlatiladi
   */
  kind?: "product" | "material";
  category?: string;
  /** Pult modeli (masalan: "Artel smart", "Yasin 007") */
  model?: string;
  /** Brend (masalan: Artel, Yasin, Samsung) */
  brand?: string;
  /** Izoh — mahsulot haqida qo'shimcha ma'lumot */
  note?: string;
  /** Optional image URL for POS/Inventory grid cards (safe to omit) */
  imageUrl?: string;
  unit?: string; // dona/kg
  /** Cutting materials (sheet) dimensions in cm. If unit="sm", POS sells by cm and stock is stored as sheet-count + remainder. */
  cutLengthCm?: number;
  cutWidthCm?: number;
  cutRemainderCm?: number; // 0..cutWidthCm-1
  price: number; // selling price
  avgCost: number; // average cost (MVP)
  stock: number;
  minStock?: number;
  createdAt: number;
  updatedAt: number;
};

export type Customer = {
  id: string;
  shopId: string;
  name: string;
  phone: string;
  /** digits-only version of phone, for equality queries (Telegram link) */
  phoneNorm?: string;
  /** Telegram link: chat id (where we send personal sale notifications) */
  telegramChatId?: string;
  telegramUserId?: string;
  note?: string;
  totalBought: number;
  totalPaid: number;
  debt: number;
  createdAt: number;
  updatedAt: number;
};


export type Supplier = {
  id: string;
  shopId: string;
  name: string;
  phone?: string;
  note?: string;
  totalPurchased: number; // jami kirim (tovar kelishi)
  totalPaid: number; // ta'minotchiga to'langan
  balance: number; // qarz (totalPurchased - totalPaid)
  createdAt: number;
  updatedAt: number;
};

export type PurchaseItem = {
  productId: string;
  nameSnapshot: string;
  barcodeSnapshot: string;
  qty: number;
  unitSnapshot?: string;
  unitCost: number; // kelish narxi
  lineTotal: number;
  // Optional rollback snapshots (used for Purchase VOID)
  beforeStock?: number;
  beforeAvgCost?: number;
  afterStock?: number;
  afterAvgCost?: number;
};

export type Purchase = {
  id: string;
  shopId: string;
  purchaseNo: string;
  supplierId: string | null;
  supplierNameSnapshot?: string | null;
  invoiceNo?: string | null;
  items: PurchaseItem[];
  total: number; // jami kelish summasi
  paidAmount: number; // hozir to'landi
  dueAmount: number; // qarz
  paymentType: PaymentType | null; // paidAmount>0 bo'lsa
  note?: string;
  createdAt: number;
  createdBy: string;
  status: "completed" | "voided";
};

export type SupplierPayment = {
  id: string;
  shopId: string;
  supplierId: string;
  supplierNameSnapshot?: string | null;
  amount: number;
  paymentType: PaymentType;
  note?: string;
  createdAt: number;
  createdBy: string;
};
export type SaleItem = {
  productId: string;
  nameSnapshot: string;
  barcodeSnapshot: string;
  qty: number;
  unitSnapshot?: string;
  unitPrice: number;
  /** Katalogdagi standart narx (agar sotuvda narx qo'lda o'zgartirilgan bo'lsa, farq shu yerdan ko'rinadi) */
  listPriceSnapshot?: number;
  /** true — sotuv paytida narx qo'lda o'zgartirilgan */
  priceOverridden?: boolean;
  unitCostSnapshot: number;
  lineTotal: number;
  profit: number;
};

export type Sale = {
  id: string;
  shopId: string;
  saleNo: string;
  customerId: string | null;
  customerNameSnapshot?: string | null;
  customerPhoneSnapshot?: string | null;
  items: SaleItem[];
  total: number;
  paidAmount: number;
  dueAmount: number;
  paymentType: PaymentType;
  createdAt: number;
  createdBy: string; // uid
  status: "completed" | "voided";
};

export type ReturnItem = {
  productId: string;
  nameSnapshot: string;
  qty: number;
  unitPrice: number;
  unitCostSnapshot: number;
  lineTotalRefund: number;
};

export type SaleReturn = {
  id: string;
  shopId: string;
  saleId: string;
  items: ReturnItem[];
  totalRefund: number;
  reason?: string;
  note?: string;
  approvedBy: string; // uid
  createdAt: number;
};

export type Expense = {
  id: string;
  shopId: string;
  category: string;
  amount: number;
  paymentType: PaymentType;
  note?: string;
  createdAt: number;
  createdBy: string;
};

export type CashTxn = {
  id: string;
  shopId: string;
  type:
    | "SALE"
    | "REFUND"
    | "EXPENSE"
    | "PURCHASE"
    | "PURCHASE_VOID"
    | "SUPPLIER_PAYMENT"
    | "CUSTOMER_PAYMENT";
  amount: number;
  paymentType: PaymentType;
  refId: string; // saleId / returnId / expenseId / purchaseId / supplierPaymentId
  createdAt: number;
  createdBy: string;
  reason?: string;
  note?: string;
};

export type CustomerPayment = {
  id: string;
  customerId: string;
  shopId: string;
  amount: number;
  paymentType: PaymentType;
  note?: string;
  createdAt: number;
  createdBy: string;
};


// =========================
// BUYURTMALAR (Orders)
// =========================
export type OrderStatus = "new" | "preparing" | "delivered" | "cancelled";
export type OrderSource = "online" | "offline";

export type OrderItem = {
  productId?: string | null;
  name: string;
  qty: number;
  price: number; // kelishilgan narx (dona)
};

export type Order = {
  id: string;
  shopId: string;
  orderNo: string;
  source: OrderSource;
  status: OrderStatus;
  customerId?: string | null;
  customerName: string;
  customerPhone?: string;
  address?: string;
  items: OrderItem[];
  total: number;
  note?: string;
  /** Holat o'zgarishlari tarixi — kim, qachon */
  statusHistory: Array<{ status: OrderStatus; at: number; by: string }>;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
};

// =========================
// ISHLAB CHIQARISH (Production / Assembly)
// =========================
// Xomashyo/detallardan tayyor mahsulot yig'ish. Har bir yig'ishda qaysi
// detaldan necha ishlatilгani yoziladi -> tayyor mahsulot tannarxi aniq.
export type ProductionMaterial = {
  productId: string;
  nameSnapshot: string;
  qty: number;
  unitCostSnapshot: number; // detalning o'sha paytdagi kelish narxi (avgCost)
  lineCost: number; // qty * unitCostSnapshot
};

export type Production = {
  id: string;
  shopId: string;
  productionNo: string;
  finishedProductId: string;
  finishedNameSnapshot: string;
  qtyProduced: number;
  materials: ProductionMaterial[];
  totalCost: number; // barcha detallar jami narxi
  unitCost: number; // 1 dona tayyor mahsulot tannarxi = totalCost / qtyProduced
  note?: string;
  createdAt: number;
  createdBy: string;
};

export type AuditLog = {
  id: string;
  shopId: string;
  actorId: string;
  role: Role;
  actionType: string;
  entityType: string;
  entityId: string;
  timestamp: number;
  meta?: Record<string, any>;
};
