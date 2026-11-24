import type { Access, Action, Area, Permissions, Role } from '../types';

export const AREAS: Area[] = ['Employees', 'Departments', 'Customers', 'Products', 'Orders', 'Reports', 'Settings'];
export const ACCESS_LEVELS: Access[] = ['None', 'View', 'Edit', 'Full'];

export const ACCESS_HELP: Record<Access, string> = {
  None: 'Hidden from the menu',
  View: 'Can view only',
  Edit: 'Can create, view and edit',
  Full: 'Can create, view, edit and delete',
};

const allowed: Record<Access, Action[]> = {
  Full: ['view', 'create', 'edit', 'delete'],
  Edit: ['view', 'create', 'edit'],
  View: ['view'],
  None: [],
};

export const canDo = (role: Role | undefined, area: Area, action: Action) =>
  !!role && allowed[role.permissions[area]].includes(action);

export const emptyPermissions = (): Permissions =>
  Object.fromEntries(AREAS.map((a) => [a, 'None'])) as Permissions;
