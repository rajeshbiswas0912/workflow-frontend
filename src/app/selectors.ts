import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from './store';
import type { Role } from '../types';

export const selCurrency = (s: RootState) => s.settings.general.currency;

/**
 * The signed-in user's role. Taken from the role list when it is loaded, so edits to the role's
 * permissions apply straight away; otherwise built from the user's own permissions
 * (/employees/profile/permissions), which every user can read.
 */
export const selectCurrentRole = createSelector(
  [(s: RootState) => s.auth.user, (s: RootState) => s.roles.items, (s: RootState) => s.roles.myPermissions],
  (user, roles, mine): Role | undefined => {
    if (!user) return undefined;
    const listed = roles.find((r) => r.id === user.roleId);
    if (listed) return listed;
    if (!mine) return undefined;
    return { id: user.roleId, name: '', description: '', isActive: true, system: false, permissions: mine };
  },
);

/** People per role, as reported by the backend's role list (people_count). */
export const selectRoleUserCounts = createSelector([(s: RootState) => s.roles.items], (roles) => {
  const counts = new Map<string, number>();
  for (const r of roles) if (r.userCount !== undefined) counts.set(r.id, r.userCount);
  return counts;
});
