/** PLACEHOLDER — owned by the v3 builder named in SMV3 fan-out. Profile as a full page (story, fit, last contact, statuses, lookalikes). */
import { useHelpKey } from '../help/HelpProvider';
import { PageHeader } from '../ui';

export function ProfilePage() {
  useHelpKey('home');
  return (
    <div className="p-container">
      <PageHeader title="ProfilePage" lede="Being built." />
    </div>
  );
}
