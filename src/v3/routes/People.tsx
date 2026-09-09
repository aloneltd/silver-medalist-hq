/** PLACEHOLDER — owned by the v3 builder named in SMV3 fan-out. People: controls, grouped person cards, Target side chart, Show me walkthrough. */
import { useHelpKey } from '../help/HelpProvider';
import { PageHeader } from '../ui';

export function People() {
  useHelpKey('home');
  return (
    <div className="p-container">
      <PageHeader title="People" lede="Being built." />
    </div>
  );
}
