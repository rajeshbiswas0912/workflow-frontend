import type { Access, Area, Permissions, Role } from '../types';
import { AREAS, emptyPermissions } from '../utils/permissions';
import { api, unwrap, type ApiResponse } from './apiClient';

// ---- Backend shapes (see /docs → roles) ----

type ApiArea = 'employees' | 'departments' | 'customers' | 'products' | 'orders' | 'reports' | 'settings';
type ApiLevel = 'none' | 'view' | 'edit' | 'full';

interface ApiPermission {
  area: ApiArea;
  access_level: ApiLevel;
}

interface ApiRole {
  id: number;
  name: string;
  is_active: boolean;
  /** Sent by the live API though not in the OpenAPI schema. */
  is_system?: boolean;
  /** People assigned to the role. */
  people_count?: number;
  areas_with_access?: number;
  total_areas?: number;
  /** Only on GET /roles/{id} (RoleDetail); the list doesn't include it. */
  permissions?: ApiPermission[];
}

/** What the app sends when creating or updating a role. */
export interface RoleInput {
  name: string;
  isActive: boolean;
  permissions: Permissions;
}

// ---- Mapping between the app's labels and the API's enums ----

const toApiArea = (a: Area) => a.toLowerCase() as ApiArea;
const toApiLevel = (a: Access) => a.toLowerCase() as ApiLevel;
const AREA_BY_API = Object.fromEntries(AREAS.map((a) => [toApiArea(a), a])) as Record<ApiArea, Area>;
const ACCESS_BY_API: Record<ApiLevel, Access> = { none: 'None', view: 'View', edit: 'Edit', full: 'Full' };

/** Converts the API's list of {area, access_level} into a complete grid; missing areas mean no access. */
export function toPermissions(items: ApiPermission[] | undefined): Permissions {
  const p = emptyPermissions();
  for (const i of items ?? []) {
    const area = AREA_BY_API[i.area];
    if (area) p[area] = ACCESS_BY_API[i.access_level] ?? 'None';
  }
  return p;
}

/** Converts the API's {area: level} map (used by /employees/profile/permissions) into a grid. */
function mapToPermissions(map: Partial<Record<ApiArea, ApiLevel>>): Permissions {
  return toPermissions(Object.entries(map).map(([area, level]) => ({ area: area as ApiArea, access_level: level as ApiLevel })));
}

const toApiPermissions = (p: Permissions): ApiPermission[] =>
  AREAS.map((a) => ({ area: toApiArea(a), access_level: toApiLevel(p[a]) }));

/**
 * System roles are locked in the UI so nobody can lock everyone out of Settings. Uses the API's
 * `is_system` when present, and always treats the role named Admin as one.
 */
const isSystemRole = (r: ApiRole) => r.is_system === true || r.name.trim().toLowerCase() === 'admin';

function toRole(r: ApiRole): Role {
  return {
    id: String(r.id),
    name: r.name,
    description: '',
    isActive: r.is_active,
    system: isSystemRole(r),
    permissions: toPermissions(r.permissions),
    ...(typeof r.people_count === 'number' ? { userCount: r.people_count } : {}),
  };
}

const toBody = (data: RoleInput) => ({
  name: data.name,
  is_active: data.isActive,
  permissions: toApiPermissions(data.permissions),
});

export const roleService = {
  /** All roles with their permission grids. */
  async list(): Promise<Role[]> {
    const { data } = await api.get<ApiResponse<ApiRole[]>>('/roles');
    const list = unwrap(data, 'Could not load roles.');
    // The list has no permission grids, so fetch each role's details in parallel.
    const detailed = await Promise.all(
      list.map(async (r) => (Array.isArray(r.permissions) ? r : { ...r, ...(await roleService.getRaw(r.id)) })),
    );
    return detailed.map(toRole);
  },

  async getRaw(id: number | string): Promise<ApiRole> {
    const { data } = await api.get<ApiResponse<ApiRole>>(`/roles/${id}`);
    return unwrap(data, 'Could not load this role.');
  },

  async get(id: string): Promise<Role> {
    return toRole(await roleService.getRaw(id));
  },

  async create(input: RoleInput): Promise<Role> {
    const { data } = await api.post<ApiResponse<ApiRole>>('/roles', toBody(input));
    return toRole(unwrap(data, 'Could not create the role.'));
  },

  /** Saves name, status and the whole permission grid in one request. */
  async update(id: string, input: RoleInput): Promise<Role> {
    const { data } = await api.put<ApiResponse<ApiRole>>(`/roles/${id}`, toBody(input));
    return toRole(unwrap(data, 'Could not save the role.'));
  },

  /** The signed-in user's own access, which works even for users who can't list roles. */
  async myPermissions(): Promise<Permissions> {
    const { data } = await api.get<ApiResponse<Partial<Record<ApiArea, ApiLevel>>>>('/employees/profile/permissions');
    return mapToPermissions(unwrap(data, 'Could not load your permissions.'));
  },
};
