import { useHelpKey } from '../help/HelpProvider';
import { PageHeader, Skel } from '../ui';
import { useSubmissions } from '../team/store';
import { InboxList } from '../team/InboxList';
import '../team/team.css';

export function InboxRoute() {
  useHelpKey('inbox');
  const waiting = useSubmissions('waiting');

  return (
    <div className="p-container">
      <PageHeader
        title="Inbox"
        lede="Everything a teammate, the add-to-bench link, a mailbox scan or a capture proposed. Nothing here is on the bench until you accept it."
      />
      <div className="p-mt-8">
        {waiting === undefined ? (
          <div className="p-col p-gap-3"><Skel height={72} /><Skel height={72} /><Skel height={72} /></div>
        ) : (
          <InboxList submissions={waiting} />
        )}
      </div>
    </div>
  );
}
