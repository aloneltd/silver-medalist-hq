/** PLACEHOLDER — owned by the v3 builder named in SMV3 fan-out. Board: the pipeline, Paper-skinned. */
import { useHelpKey } from '../help/HelpProvider';
import { PageHeader } from '../ui';

export function BoardRoute() {
  useHelpKey('home');
  return (
    <div className="p-container">
      <PageHeader title="BoardRoute" lede="Being built." />
    </div>
  );
}
