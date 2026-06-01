import { useEffect, useState } from 'react';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db, handleFirestoreError } from './firebase';
import { useAuth } from './AuthContext';
import { Student, Attendance, Fee } from '../types';

export function useStudents() {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setStudents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, 'students'), where('adminId', '==', user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Student))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      setStudents(data);
      setLoading(false);
    }, (error) => {
      try {
        handleFirestoreError(error, 'list' as any, 'students');
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  return { students, loading };
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
    const q = query(collection(db, 'attendance'), where('adminId', '==', user.uid));
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
  const { user } = useAuth();
  const [fees, setFees] = useState<Fee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setFees([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, 'fees'), where('adminId', '==', user.uid));
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
  }, [user]);

  return { fees, loading };
}
