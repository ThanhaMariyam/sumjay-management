import { useEffect, useState } from 'react';
import { MemberRole } from '../types';

const MEMBER_ROLE_FILTER_KEY = 'sumjay.memberRoleFilter';

const normalizeMemberRole = (value: string | null): MemberRole => (
  value === 'abroad' ? 'abroad' : 'local'
);

export function useMemberRoleFilter() {
  const [memberRoleFilter, setMemberRoleFilterState] = useState<MemberRole>(() => {
    if (typeof window === 'undefined') return 'local';
    return normalizeMemberRole(window.localStorage.getItem(MEMBER_ROLE_FILTER_KEY));
  });

  const setMemberRoleFilter = (value: MemberRole) => {
    setMemberRoleFilterState(value);
    window.localStorage.setItem(MEMBER_ROLE_FILTER_KEY, value);
  };

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === MEMBER_ROLE_FILTER_KEY) {
        setMemberRoleFilterState(normalizeMemberRole(event.newValue));
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return { memberRoleFilter, setMemberRoleFilter };
}
