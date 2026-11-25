import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { changePassword, logout } from '../features/auth/authSlice';
import { Logo } from './Logo';
import { TextField } from './ui';

/** The API rejects shorter passwords whatever Settings says; 72 is the bcrypt limit used when employees are created. */
const API_MIN_PASSWORD = 8;
const API_MAX_PASSWORD = 72;

type Errors = Partial<Record<'next' | 'confirm', string>>;

/**
 * Shown instead of the app while the user is signed in with a temporary password.
 * It cannot be dismissed: the only ways out are setting a new password or logging out.
 */
export default function ChangePasswordModal() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user)!;
  const security = useAppSelector((s) => s.settings.security);
  const minLength = Math.max(security.minPasswordLength, API_MIN_PASSWORD);

  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const validate = (): Errors => {
    const er: Errors = {};
    if (next.length < minLength) er.next = `Use at least ${minLength} characters.`;
    else if (next.length > API_MAX_PASSWORD) er.next = `Use ${API_MAX_PASSWORD} characters or fewer.`;
    else if (security.requireComplexPassword && !(/[a-z]/.test(next) && /[A-Z]/.test(next) && /\d/.test(next)))
      er.next = 'Include an uppercase letter, a lowercase letter and a number.';
    if (!er.next && confirm !== next) er.confirm = 'Passwords do not match.';
    return er;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const er = validate();
    setErrors(er);
    setServerError(null);
    if (Object.keys(er).length) return;
    setSaving(true);
    const res = await dispatch(changePassword({ newPassword: next, confirmPassword: confirm }));
    // On success the session flag is cleared and the app renders in place of this popup.
    if (changePassword.rejected.match(res)) {
      // Pydantic validator messages arrive as "Value error, ...".
      setServerError((res.payload ?? 'Could not change your password.').replace(/^Value error,\s*/i, ''));
      setSaving(false);
    }
  };

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login', { replace: true });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/90 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-pw-title"
        aria-describedby="change-pw-desc"
        className="w-full max-w-[440px] rounded-2xl bg-white p-6 shadow-xl sm:p-8"
      >
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <Logo size={36} />
          <div>
            <h2 id="change-pw-title" className="text-2xl font-bold tracking-tight">Set a new password</h2>
            <p id="change-pw-desc" className="mt-1.5 text-[15px] text-slate-600">
              Hi {user.name}, you signed in with a temporary password. Choose a new one to continue.
            </p>
          </div>

          {serverError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {serverError}
            </div>
          )}

          <TextField
            autoFocus
            id="new-password"
            label="New password"
            type="password"
            autoComplete="new-password"
            placeholder={`At least ${minLength} characters`}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            error={errors.next}
          />
          <TextField
            id="confirm-password"
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={errors.confirm}
          />

          <button type="submit" className="btn-primary min-h-12 text-[15px]" disabled={saving}>
            {saving ? 'Saving…' : 'Save password and continue'}
          </button>
          <button type="button" onClick={handleLogout} className="btn-secondary min-h-11" disabled={saving}>
            Log out
          </button>
        </form>
      </div>
    </div>
  );
}
