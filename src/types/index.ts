// ─── Auth & Users ─────────────────────────────────────────────────────────────

export type UserRole = "admin" | "council_member" | "owner" | "tenant" | "manager";

export interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: UserRole;
  createdAt: Date;
}

// ─── Buildings ────────────────────────────────────────────────────────────────

export interface Building {
  id: string;
  name: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  totalUnits: number;
  createdAt: Date;
}

export interface StrataLot {
  id: string;
  buildingId: string;
  unitNumber: string;
  floor: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
  ownershipFraction: number; // e.g. 0.0125 = 1.25%
}

// ─── Meetings ────────────────────────────────────────────────────────────────

export type MeetingStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export type MeetingType  = "agm" | "special" | "council" | "committee";

export interface Meeting {
  id: string;
  buildingId: string;
  title: string;
  type: MeetingType;
  status: MeetingStatus;
  scheduledAt: Date;
  location: string | null;
  videoUrl: string | null;
  quorum: number | null;
  createdBy: string;
  createdAt: Date;
}

// ─── Maintenance ─────────────────────────────────────────────────────────────

export type MaintenanceStatus =
  | "open"
  | "in_progress"
  | "resolved"
  | "closed";

export type MaintenancePriority = "low" | "medium" | "high" | "urgent";

export interface MaintenanceRequest {
  id: string;
  buildingId: string;
  unitId: string | null;
  title: string;
  description: string;
  status: MaintenanceStatus;
  priority: MaintenancePriority;
  reportedBy: string;
  assignedTo: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

// ─── Documents ───────────────────────────────────────────────────────────────

export type DocumentCategory =
  | "minutes"
  | "bylaw"
  | "financial"
  | "insurance"
  | "maintenance"
  | "legal"
  | "correspondence"
  | "other";

export interface Document {
  id: string;
  buildingId: string;
  title: string;
  category: DocumentCategory;
  version: number;
  s3Key: string;
  sizeBytes: number;
  mimeType: string;
  uploadedBy: string;
  createdAt: Date;
}

// ─── Payments ────────────────────────────────────────────────────────────────

export type PaymentStatus = "pending" | "paid" | "overdue" | "waived" | "refunded";
export type PaymentType   = "strata_fee" | "special_levy" | "fine" | "repair" | "other";

export interface Payment {
  id: string;
  buildingId: string;
  unitId: string;
  type: PaymentType;
  amountCents: number;
  status: PaymentStatus;
  dueDate: Date;
  paidAt: Date | null;
  notes: string | null;
  createdAt: Date;
}

// ─── Votes ───────────────────────────────────────────────────────────────────

export type VoteStatus = "draft" | "open" | "closed" | "cancelled";

export interface Vote {
  id: string;
  buildingId: string;
  title: string;
  description: string | null;
  status: VoteStatus;
  anonymous: boolean;
  opensAt: Date;
  closesAt: Date;
  createdBy: string;
  createdAt: Date;
}

// ─── Notifications ───────────────────────────────────────────────────────────

export type NotificationChannel = "in_app" | "email";
export type NotificationType =
  | "maintenance_update"
  | "payment_due"
  | "meeting_reminder"
  | "document_shared"
  | "vote_opened"
  | "announcement";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  link: string | null;
  createdAt: Date;
}

// ─── API Responses ───────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  error: string;
  details?: unknown;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Pagination ──────────────────────────────────────────────────────────────

export interface PaginationParams {
  page?: number;
  perPage?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}
