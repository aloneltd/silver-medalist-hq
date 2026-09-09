import { Drawer } from '../ui';
import { ProfileBody } from './ProfileBody';

/**
 * The `?c=<id>` side panel version of a profile (src/app/useDossierLink.ts), mounted globally
 * by <ShellV3> so opening someone from Home, People, a Board card or a lookalike link never
 * loses the page underneath. Shell #2 around the shared <ProfileBody> — see ProfilePage.tsx
 * for shell #1. The drawer chrome's own title stays generic because <ProfileBody> renders its
 * own name/avatar header (section 1 of the brief) — a second "Kofi Kowalski" above it would
 * just be noise.
 */
export function ProfileDrawer({ candidateId, onClose }: { candidateId: string; onClose: () => void }) {
  return (
    <Drawer title="Profile" onClose={onClose} wide>
      <ProfileBody candidateId={candidateId} />
    </Drawer>
  );
}
