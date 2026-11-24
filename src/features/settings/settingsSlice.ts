import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { GeneralSettings, SecuritySettings } from '../../types';

// The backend has no settings endpoints yet, so settings live in the browser for this session.

const DEFAULT_GENERAL: GeneralSettings = {
  companyName: 'WorkFlow Pvt Ltd',
  currency: 'INR',
  timeZone: 'Asia/Kolkata',
  gstRate: 18,
  orderPrefix: 'ORD-',
};

const DEFAULT_SECURITY: SecuritySettings = {
  accessTokenMinutes: 30,
  refreshTokenDays: 7,
  minPasswordLength: 10,
  lockAfterFailedAttempts: 5,
  requireComplexPassword: true,
};

interface SettingsState {
  general: GeneralSettings;
  security: SecuritySettings;
  saving: boolean;
  savedAt: number | null;
}

export const saveSettings = createAsyncThunk(
  'settings/save',
  async (data: { general: GeneralSettings; security: SecuritySettings }) => data,
);

const initialState: SettingsState = {
  general: DEFAULT_GENERAL,
  security: DEFAULT_SECURITY,
  saving: false,
  savedAt: null,
};

const slice = createSlice({
  name: 'settings',
  initialState,
  reducers: {},
  extraReducers: (b) => {
    b.addCase(saveSettings.pending, (s) => {
      s.saving = true;
    })
      .addCase(saveSettings.fulfilled, (s, { payload }) => {
        s.saving = false;
        s.general = payload.general;
        s.security = payload.security;
        s.savedAt = Date.now();
      })
      .addCase(saveSettings.rejected, (s) => {
        s.saving = false;
      });
  },
});

export default slice.reducer;
