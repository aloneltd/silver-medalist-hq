import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from '../db';
import { SETTINGS_KEYS } from '../types';

/** BLUEPRINT-v2.md: "one banner 'Sample bench · Start my own'" shown whenever the loaded
 * bench is the seeded sample data. Wipe flow itself lives in Settings — this just links there. */
export function SampleBenchBanner() {
  const navigate = useNavigate();
  const flag = useLiveQuery(() => db.settings.get(SETTINGS_KEYS.sampleFlag), [], undefined);
  if (!flag?.value) return null;

  return (
    <div className="smhq-sample-banner" role="note">
      <span>Sample bench — this is demo data so you can see how it works.</span>
      <button type="button" onClick={() => navigate('/settings')}>Start my own</button>
    </div>
  );
}
