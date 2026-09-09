/** PLACEHOLDER — owned by the v3 builder named in SMV3 fan-out. Inbox: accept/reject submissions. */
import { useHelpKey } from '../help/HelpProvider';
import { PageHeader } from '../ui';

export function InboxRoute() {
  useHelpKey('home');
  return (
    <div className="p-container">
      <PageHeader title="InboxRoute" lede="Being built." />
    </div>
  );
}
