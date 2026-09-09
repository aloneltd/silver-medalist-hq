/** PLACEHOLDER — owned by the v3 builder named in SMV3 fan-out. Home: greeting, prose brief, paste-a-role hero, three doors, five person cards. */
import { useHelpKey } from '../help/HelpProvider';
import { PageHeader } from '../ui';

export function Home() {
  useHelpKey('home');
  return (
    <div className="p-container">
      <PageHeader title="Home" lede="Being built." />
    </div>
  );
}
