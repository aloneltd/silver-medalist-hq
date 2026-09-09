/** PLACEHOLDER — owned by the v3 builder named in SMV3 fan-out. Team: members, roles, invite, add-to-bench link, inbox summary. */
import { useHelpKey } from '../help/HelpProvider';
import { PageHeader } from '../ui';

export function Team() {
  useHelpKey('home');
  return (
    <div className="p-container">
      <PageHeader title="Team" lede="Being built." />
    </div>
  );
}
