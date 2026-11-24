import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { login } from '../features/auth/authSlice';
import { Logo } from '../components/Logo';

const FEATURES = [
  'Orders with line items, status flow and totals',
  'Reports on sales, customers and headcount',
  'Custom roles with per-area permissions',
];

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, status, error } = useAppSelector((s) => s.auth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';
  if (user) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const res = await dispatch(login({ email, password }));
    if (login.fulfilled.match(res)) navigate(from, { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-wrap">
      <section className="flex flex-[1_1_520px] flex-col justify-between gap-12 bg-slate-900 p-8 text-white sm:p-16">
        <Logo />
        <div className="flex max-w-[520px] flex-col gap-6">
          <h1 className="text-4xl leading-tight font-bold tracking-tight sm:text-[44px]">
            Run your people and your orders from one place.
          </h1>
          <p className="text-[17px] leading-relaxed text-slate-300">
            Keep employees, departments and customers organised, and follow every order from pending to delivered.
          </p>
          <ul className="mt-2 flex flex-col gap-3.5">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3 text-[15px] text-slate-200">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {f}
              </li>
            ))}
          </ul>
        </div>
        <div className="text-[13px] text-slate-300">Sessions use a signed token that renews automatically while you work.</div>
      </section>

      <section className="flex flex-[1_1_520px] items-center justify-center px-6 py-12">
        <form onSubmit={submit} className="flex w-full max-w-[400px] flex-col gap-6" noValidate>
          <div>
            <h2 className="text-[28px] font-bold tracking-tight">Sign in</h2>
            <p className="mt-1.5 text-[15px] text-slate-600">Use your work account to continue.</p>
          </div>

          {error && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-semibold">Email</label>
            <input id="email" type="email" autoComplete="username" required placeholder="you@company.com" className="input text-[15px]" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-semibold">Password</label>
            <input id="password" type="password" autoComplete="current-password" required placeholder="Enter your password" className="input text-[15px]" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary min-h-12 text-[15px]" disabled={status === 'loading' || !email || !password}>
            {status === 'loading' ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="text-center text-[13px] text-slate-600">Trouble signing in? Ask an administrator to reset your password.</p>
        </form>
      </section>
    </div>
  );
}
