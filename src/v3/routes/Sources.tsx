/** PLACEHOLDER — owned by the v3 builder named in SMV3 fan-out. Sources hub: drop zone, mapping + merge preview, connector cards, capture, import history. */
import { useHelpKey } from '../help/HelpProvider';
import { PageHeader } from '../ui';

export function Sources() {
  useHelpKey('home');
  return (
    <div className="p-container">
      <PageHeader title="Sources" lede="Being built." />
    </div>
  );
}
