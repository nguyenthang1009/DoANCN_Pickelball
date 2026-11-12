import { useEffect, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';

const KEY = 'pkb_admin_venue';

// Cơ sở đang thao tác: Manager/Staff cố định theo tài khoản (BR15), Admin chọn cơ sở bất kỳ
export function useVenueScope() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueIdState] = useState(() => (isAdmin ? Number(localStorage.getItem(KEY)) || null : user?.venueId ?? null));

  useEffect(() => {
    api(isAdmin ? '/admin/venues' : '/venues').then((d) => {
      setVenues(d.venues);
      if (isAdmin) setVenueIdState((id) => (d.venues.some((v) => v.id === id) ? id : d.venues[0]?.id ?? null));
    }).catch(() => {});
  }, [isAdmin]);

  const setVenueId = (id) => { localStorage.setItem(KEY, String(id)); setVenueIdState(id); };
  return { isAdmin, venues, venueId, setVenueId, venue: venues.find((v) => v.id === venueId) };
}
