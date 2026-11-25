export type EmployeeStatus = 'Active' | 'On leave' | 'Inactive';

export type ProductStatus = 'Active' | 'Discontinued';

export type OrderStatus = 'Pending' | 'Confirmed' | 'Shipped' | 'Delivered' | 'Cancelled';

export type Area = 'Employees' | 'Departments' | 'Customers' | 'Products' | 'Orders' | 'Reports' | 'Settings';
export type Access = 'Full' | 'Edit' | 'View' | 'None';
export type Action = 'view' | 'create' | 'edit' | 'delete';

export type Permissions = Record<Area, Access>;

/** A user role, loaded from the backend. Admins can create and edit roles at runtime. */
export interface Role {
  id: string;
  name: string;
  description: string;
  /** Inactive roles can't be given to anyone new. */
  isActive: boolean;
  /** System roles are locked so the app always has someone who can manage it. */
  system: boolean;
  permissions: Permissions;
  /** People with this role, when the backend reports it. */
  userCount?: number;
}

export interface GeneralSettings {
  companyName: string;
  currency: 'INR' | 'USD';
  timeZone: string;
  gstRate: number;
  orderPrefix: string;
}

export interface SecuritySettings {
  accessTokenMinutes: number;
  refreshTokenDays: number;
  minPasswordLength: number;
  lockAfterFailedAttempts: number;
  requireComplexPassword: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  roleId: string;
  /** Signed in with a temporary password: must set a new one before using the app. */
  mustChangePassword: boolean;
}

export type LoadStatus = 'idle' | 'loading' | 'succeeded' | 'failed';
