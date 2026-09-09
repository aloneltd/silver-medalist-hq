/** PLACEHOLDER — owned by the v3 builder named in SMV3 fan-out. Capture landing: reads the bookmarklet payload and offers Add to bench. */
import { useHelpKey } from '../help/HelpProvider';
import { PageHeader } from '../ui';

export function Capture() {
  useHelpKey('home');
  return (
    <div className="p-container">
      <PageHeader title="Capture" lede="Being built." />
    </div>
  );
}
