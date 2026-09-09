/** PLACEHOLDER — owned by the v3 builder named in SMV3 fan-out. Connections: Outlook/Google/Drive honest states, data export, start my own bench. */
import { useHelpKey } from '../help/HelpProvider';
import { PageHeader } from '../ui';

export function Connections() {
  useHelpKey('home');
  return (
    <div className="p-container">
      <PageHeader title="Connections" lede="Being built." />
    </div>
  );
}
