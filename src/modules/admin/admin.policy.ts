export const adminRoles = [
  'SUPER_ADMIN',
  'OPERATIONS_ADMIN',
  'ORDER_ADMIN',
  'FINANCE_ADMIN',
  'GARDENER_ADMIN',
  'SUPPORT_ADMIN',
  'CONTENT_ADMIN',
] as const;
export type AdminRole = (typeof adminRoles)[number];
const grants: Record<AdminRole, string[]> = {
  SUPER_ADMIN: ['*'],
  OPERATIONS_ADMIN: [
    'dashboard.read',
    'orders.read',
    'orders.update',
    'orders.cancel',
    'products.read',
    'inventory.read',
    'inventory.update',
    'customers.read',
    'gardeners.read',
    'bookings.read',
    'bookings.update',
    'services.read',
    'support.read',
    'support.update',
    'ratings.read',
    'reports.read',
  ],
  ORDER_ADMIN: [
    'dashboard.read',
    'orders.read',
    'orders.update',
    'orders.cancel',
    'products.read',
    'inventory.read',
    'inventory.update',
    'customers.read',
  ],
  FINANCE_ADMIN: [
    'dashboard.read',
    'finance.read',
    'finance.update',
    'orders.read',
    'bookings.read',
    'reports.read',
    'reports.export',
    'rewards.read',
  ],
  GARDENER_ADMIN: [
    'dashboard.read',
    'gardeners.read',
    'gardeners.update',
    'gardeners.approve',
    'gardeners.suspend',
    'bookings.read',
    'bookings.update',
    'services.read',
    'services.update',
    'ratings.read',
    'plant-health.read',
  ],
  SUPPORT_ADMIN: [
    'dashboard.read',
    'customers.read',
    'orders.read',
    'bookings.read',
    'support.read',
    'support.update',
    'ratings.read',
  ],
  CONTENT_ADMIN: [
    'dashboard.read',
    'products.read',
    'products.create',
    'products.update',
    'products.delete',
    'content.read',
    'content.update',
    'notifications.read',
    'notifications.update',
  ],
};
export const permissionsFor = (role: string): string[] => grants[role as AdminRole] ?? [];
export const permits = (role: string, permission: string): boolean =>
  permissionsFor(role).some((p) => p === '*' || p === permission);
export const orderTransitions: Record<string, string[]> = {
  PLACED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};
export function csvCell(value: unknown): string {
  const text =
    value == null
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean' ||
            typeof value === 'bigint'
          ? String(value)
          : '';
  return `"${(/^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
}
