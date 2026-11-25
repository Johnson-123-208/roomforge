import { Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { syncCreateAccessFromSearch, hasCreateAccess } from '../../lib/createAccess';

/** Guards /create — only hosts with the URL password may open this page. */
export function RequireCreateAccess({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [allowed, setAllowed] = useState(() => hasCreateAccess());

  useEffect(() => {
    const { unlocked, cleanedSearch } = syncCreateAccessFromSearch(location.search);
    setAllowed(unlocked);
    if (unlocked && cleanedSearch !== location.search) {
      window.history.replaceState(
        null,
        '',
        `${location.pathname}${cleanedSearch}${location.hash}`,
      );
    }
  }, [location.pathname, location.search, location.hash]);

  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  return children;
}
