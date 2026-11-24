import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { roleService, type RoleInput } from '../../services/roleService';
import { getErrorMessage } from '../../services/apiClient';
import { login, sessionChanged } from '../auth/authSlice';
import type { LoadStatus, Permissions, Role } from '../../types';

interface RolesState {
  items: Role[];
  /** The signed-in user's own access, from /employees/profile/permissions. */
  myPermissions: Permissions | null;
  status: LoadStatus;
  /** Why the role list couldn't be loaded (for example, the user can't manage roles). */
  listError: string | null;
}

/**
 * Loads the user's own permissions (always) and the full role list (when allowed).
 * A user without Settings access can't list roles; that must not stop the app from loading.
 */
export const fetchRoles = createAsyncThunk<
  { items: Role[]; myPermissions: Permissions; listError: string | null },
  void,
  { rejectValue: string }
>('roles/fetch', async (_, { rejectWithValue }) => {
  const [mine, list] = await Promise.allSettled([roleService.myPermissions(), roleService.list()]);
  if (mine.status === 'rejected') return rejectWithValue(getErrorMessage(mine.reason, 'Could not load your permissions.'));
  return {
    myPermissions: mine.value,
    items: list.status === 'fulfilled' ? list.value : [],
    listError: list.status === 'rejected' ? getErrorMessage(list.reason, 'Could not load roles.') : null,
  };
});

/** Reloads just the role list, e.g. when opening the Roles tab or after an error. */
export const reloadRoles = createAsyncThunk<Role[], void, { rejectValue: string }>('roles/reload', async (_, { rejectWithValue }) => {
  try {
    return await roleService.list();
  } catch (err) {
    return rejectWithValue(getErrorMessage(err, 'Could not load roles.'));
  }
});

export const createRole = createAsyncThunk<Role, RoleInput, { rejectValue: string }>('roles/create', async (input, { rejectWithValue }) => {
  try {
    return await roleService.create(input);
  } catch (err) {
    return rejectWithValue(getErrorMessage(err, 'Could not create the role.'));
  }
});

export const updateRole = createAsyncThunk<Role, { id: string; system: boolean } & RoleInput, { rejectValue: string }>(
  'roles/update',
  async ({ id, system, ...input }, { rejectWithValue }) => {
    if (system) return rejectWithValue('System roles cannot be changed.');
    try {
      return await roleService.update(id, input);
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, 'Could not save the role.'));
    }
  },
);

const initialState: RolesState = { items: [], myPermissions: null, status: 'idle', listError: null };

/** Keeps a people count the list endpoint gave when a detail/update response doesn't include one. */
const merge = (prev: Role | undefined, next: Role): Role =>
  next.userCount === undefined && prev?.userCount !== undefined ? { ...next, userCount: prev.userCount } : next;

const slice = createSlice({
  name: 'roles',
  initialState,
  reducers: {},
  extraReducers: (b) => {
    b.addCase(fetchRoles.pending, (s) => {
      s.status = 'loading';
    })
      .addCase(fetchRoles.fulfilled, (s, { payload }) => {
        s.status = 'succeeded';
        s.items = payload.items;
        s.myPermissions = payload.myPermissions;
        s.listError = payload.listError;
      })
      .addCase(fetchRoles.rejected, (s) => {
        s.status = 'failed';
      })
      .addCase(reloadRoles.fulfilled, (s, { payload }) => {
        s.items = payload;
        s.listError = null;
      })
      .addCase(reloadRoles.rejected, (s, { payload }) => {
        s.listError = payload ?? 'Could not load roles.';
      })
      .addCase(createRole.fulfilled, (s, { payload }) => {
        s.items.push(payload);
      })
      .addCase(updateRole.fulfilled, (s, { payload }) => {
        s.items = s.items.map((r) => (r.id === payload.id ? merge(r, payload) : r));
      })
      // Permissions belong to the signed-in user: drop them on sign-out and reload them for the next user.
      .addCase(login.fulfilled, () => initialState)
      .addCase(sessionChanged, (s, { payload }) => (payload ? s : initialState));
  },
});

export default slice.reducer;
