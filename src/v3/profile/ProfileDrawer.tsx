/** PLACEHOLDER — owned by the Profile builder. The `?c=` side panel version of a profile. */
import { Drawer } from '../ui';

export function ProfileDrawer({ candidateId, onClose }: { candidateId: string; onClose: () => void }) {
  return <Drawer title="Profile" onClose={onClose}><div className="p-sec">{candidateId}</div></Drawer>;
}
