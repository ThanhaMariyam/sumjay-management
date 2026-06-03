export type AdminRole = 'student' | 'membership';
export type UserRole = AdminRole | 'member';

export interface Student {
  id?: string;
  adminId: string;
  userId?: string;
  email?: string;
  name: string;
  dob: string;
  place: string;
  photoURL?: string;
  parentMobile: string;
  phoneNumber?: string;
  bloodGroup?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface Member {
  id?: string;
  adminId: string;
  userId?: string;
  email?: string;
  name: string;
  dob: string;
  place: string;
  phoneNumber: string;
  bloodGroup: string;
  photoURL?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface Attendance {
  id?: string;
  adminId: string;
  studentId: string;
  date: string;       // YYYY-MM-DD
  status: 'present' | 'absent';
  createdAt: number;
  updatedAt?: number;
}

export interface Fee {
  id?: string;
  adminId: string;
  studentId: string;
  month: string;      // YYYY-MM
  amount?: number;
  paidAmount?: number;
  status: 'paid' | 'unpaid';
  paidOn?: string | null;    // YYYY-MM-DD
  paidAt?: number | null;
  createdAt: number;
  updatedAt?: number;
}
