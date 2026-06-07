import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError } from './firebase';
import { useAuth } from './AuthContext';
import { Student, Attendance, Fee, Member } from '../types';

export function useStudents(collectionName: 'students' | 'members' = 'students') {
  const { user, isMembershipAdmin, isMemberUser } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setStudents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const applySnapshot = (snapshot: { docs: Array<{ id: string; data: () => unknown }> }) => {
      const data = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Student))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      setStudents(data);
    };

    const q = query(collection(db, collectionName), where('adminId', '==', user.adminId));
    const unsubOwned = onSnapshot(q, (snapshot) => {
      applySnapshot(snapshot);
      setLoading(false);
    }, (error) => {
      try {
        handleFirestoreError(error, 'list' as any, collectionName);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    });

    let unsubAllMembers: (() => void) | undefined;
    if (collectionName === 'members' && (isMembershipAdmin || isMemberUser)) {
      unsubAllMembers = onSnapshot(query(collection(db, collectionName)), (snapshot) => {
        applySnapshot(snapshot);
      }, (error) => {
        console.warn('Unable to load all member profiles; showing admin-owned members only.', error);
      });
    }

    return () => {
      unsubOwned();
      unsubAllMembers?.();
    };
  }, [user, collectionName, isMembershipAdmin, isMemberUser]);

  return { students, loading };
}

export function useMembers() {
  const { students: members, loading } = useStudents('members');
  return { members: members as Member[], loading };
}

export function useAttendance() {
  const { user } = useAuth();
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setAttendance([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, 'attendance'), where('adminId', '==', user.adminId));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Attendance))
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
      setAttendance(data);
      setLoading(false);
    }, (error) => {
      try {
        handleFirestoreError(error, 'list' as any, 'attendance');
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  return { attendance, loading };
}

export function useFees() {
  const { user, isMembershipAdmin, isMemberUser } = useAuth();
  const [fees, setFees] = useState<Fee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setFees([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let ownedFees: Fee[] = [];
    let allFees: Fee[] = [];

    const publishFees = () => {
      const feeById = new Map<string, Fee>();
      [...ownedFees, ...allFees].forEach((fee) => {
        if (fee.id) feeById.set(fee.id, fee);
      });
      setFees(
        Array.from(feeById.values()).sort((a, b) => (b.month ?? '').localeCompare(a.month ?? '')),
      );
    };

    const q = query(collection(db, 'fees'), where('adminId', '==', user.adminId));
    const unsubOwned = onSnapshot(q, (snapshot) => {
      ownedFees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Fee));
      publishFees();
      setLoading(false);
    }, (error) => {
      try {
        handleFirestoreError(error, 'list' as any, 'fees');
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    });

    let unsubAllFees: (() => void) | undefined;
    if (isMembershipAdmin || isMemberUser) {
      unsubAllFees = onSnapshot(query(collection(db, 'fees')), (snapshot) => {
        allFees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Fee));
        publishFees();
      }, (error) => {
        console.warn('Unable to load all fund records; showing admin-owned records only.', error);
      });
    }

    return () => {
      unsubOwned();
      unsubAllFees?.();
    };
  }, [user, isMembershipAdmin, isMemberUser]);

  return { fees, loading };
}

export function useCurrentMemberProfile() {
  const { user, isMemberUser } = useAuth();
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !isMemberUser) {
      setMember(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, 'members'), where('userId', '==', user.adminId), limit(1));
    const unsub = onSnapshot(q, (snapshot) => {
      const docSnap = snapshot.docs[0];
      setMember(docSnap ? ({ id: docSnap.id, ...docSnap.data() } as Member) : null);
      setLoading(false);
    }, (error) => {
      try {
        handleFirestoreError(error, 'list' as any, 'members');
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [user, isMemberUser]);

  return { member, loading };
}

export function useMemberFees(memberId?: string) {
  const { user, isMemberUser } = useAuth();
  const [fees, setFees] = useState<Fee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !isMemberUser || !memberId) {
      setFees([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, 'fees'), where('studentId', '==', memberId));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Fee))
        .sort((a, b) => (b.month ?? '').localeCompare(a.month ?? ''));
      setFees(data);
      setLoading(false);
    }, (error) => {
      try {
        handleFirestoreError(error, 'list' as any, 'fees');
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [user, isMemberUser, memberId]);

  return { fees, loading };
}
