# WorkFlow

Employee & order management app built from the WorkFlow HTML prototype.

**Stack:** React 18 · TypeScript · Vite · Redux Toolkit · React Router 6 · Tailwind CSS 4

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```

## Demo accounts

| Role    | Email                | Password   | Sees                                      |
| ------- | -------------------- | ---------- | ----------------------------------------- |
| Admin   | admin@workflow.com   | admin123   | Everything                                |
| Manager | manager@workflow.com | manager123 | No Settings; departments & reports read-only; can add/edit products |
| Staff   | staff@workflow.com   | staff123   | Dashboard, Customers, Orders; products read-only |

The login page has buttons that fill these in. The table shows the starting roles; the account's actual access comes from
the role assigned to its employee record.

## Roles

Roles come from the backend (`src/services/roleService.ts` → `/roles`). In **Settings → Roles and permissions** an admin can
create, rename, duplicate, activate/deactivate roles and set each role's access (None / View / Edit / Full) for every area.
The tab reloads roles from the server each time it opens, and has a Refresh button.

- Saving sends the whole grid with `PUT /roles/{id}`; new roles use `POST /roles`.
- System roles are locked so nobody can lock everyone out: any role with `is_system: true`, and always the role named **Admin**.
- Roles are never deleted, only made inactive, and only when `people_count` is 0. Inactive roles can't be picked for employees.
- Your own access comes from `GET /employees/profile/permissions`, so users who can't list roles still get the right menu.
  When the role list is loaded, edits to your own role apply straight away.

## Structure

```
src/
  app/            store, typed hooks (useAppSelector, useCan), memoized selectors
  features/       one Redux slice per domain: auth, employees, departments, customers, products, orders, settings
  services/       mock API — returns dummy data after a short delay
  data/seed.ts    all dummy data
  components/     Layout (sidebar), route guards, shared UI (fields, badges, charts, pagination)
  pages/          one file per screen
  utils/          formatting, order math, permission check
```

## Dummy data / connecting a real API

No network calls are made. Slices load data through async thunks that call `src/services/*`, which resolve with
copies of `src/data/seed.ts`. To connect a backend, replace the bodies of the functions in
`services/dataService.ts` and `services/authService.ts` with real HTTP calls that return the same shapes; slices and
pages do not need to change.

Changes (new employees, orders, etc.) live in the Redux store only, so they reset on page reload. The sign-in session
is kept in `sessionStorage` (or `localStorage` with "Keep me signed in") and expires after the access-token lifetime
set in Settings.
