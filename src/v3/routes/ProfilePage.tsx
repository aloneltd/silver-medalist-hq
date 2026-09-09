import { Link, useParams } from 'react-router-dom';
import { useHelpKey } from '../help/HelpProvider';
import { ProfileBody } from '../profile/ProfileBody';

/**
 * The full-page profile at /p/:id — B4's brief: "one body component under src/v3/profile/,
 * rendered two ways". This is shell #1 (the page); shell #2 is ProfileDrawer, for the `?c=`
 * deep link. Both wrap <ProfileBody> and nothing else, so the two never drift apart.
 */
export function ProfilePage() {
  useHelpKey('profile');
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return (
      <div className="p-container">
        <p className="p-sec">No profile to show.</p>
      </div>
    );
  }

  return (
    <div className="p-container" style={{ maxWidth: 860 }}>
      <Link to="/people" className="p-sec">&larr; People</Link>
      <div className="p-mt-8">
        <ProfileBody candidateId={id} />
      </div>
    </div>
  );
}
