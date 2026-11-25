import { useCan } from '../app/hooks';
import { PageHeader } from '../components/ui';
import RolesPanel from '../components/RolesPanel';

export default function SettingsPage() {
  const can = useCan();
  const readOnly = !can('Settings', 'edit');

  return (
    <>
      <PageHeader title="Settings" subtitle={readOnly ? 'Role permissions. You have view-only access.' : 'Role permissions.'} />
      <div className="card p-6">
        <RolesPanel readOnly={readOnly} />
      </div>
    </>
  );
}
