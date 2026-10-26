import { Navigate, useLocation, useParams } from 'react-router-dom';
import { isMode, PAGES } from './registry';
import Placeholder from './Placeholder';

export default function ModePage() {
  const { mode, page } = useParams();
  const { search } = useLocation();
  if (!isMode(mode)) return <Navigate to={{ pathname: '/clinical/overview', search }} replace />;
  const def = PAGES[mode].find((p) => p.id === page);
  if (!def) return <Navigate to={{ pathname: `/${mode}/overview`, search }} replace />;
  const Page = def.component;
  return Page ? <Page /> : <Placeholder titleKey={`pages.${mode}.${def.id}`} />;
}
