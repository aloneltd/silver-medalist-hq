/** PLACEHOLDER — owned by the v3 builder named in SMV3 fan-out. Roles: open roles, shortlist counts, paste a role. */
import { useHelpKey } from '../help/HelpProvider';
import { PageHeader } from '../ui';

export function Roles() {
  useHelpKey('home');
  return (
    <div className="p-container">
      <PageHeader title="Roles" lede="Being built." />
    </div>
  );
}
