export interface Student {
  id?: string;
  adminId: string;
  name: string;
  dob: string;
  place: string;
  photoURL?: string;
  parentMobile: string;
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
