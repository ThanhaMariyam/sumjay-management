import { useEffect, useMemo, useState } from 'react';
import { useStudents, useAttendance } from '../lib/hooks';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { db, handleFirestoreError } from '../lib/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { MessageSquareWarning } from 'lucide-react';
import { Attendance as AttendanceType } from '../types';
import { sendWhatsAppMessage } from '../lib/whatsapp';
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../lib/AuthContext';

const PAGE_SIZE = 10;

export default function Attendance() {
  const { user } = useAuth();
  const { students, loading: studentsLoading } = useStudents();
  // Using hooks is good, but for attendance we probably just want to query for the current date's attendance to avoid pulling everything.
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const { attendance, loading: attendanceLoading } = useAttendance();
  const [sendingIds, setSendingIds] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Filter attendance for selected date
  const todaysAttendance = attendance.filter(a => a.date === date);
  const attendanceMap = todaysAttendance.reduce((acc, curr) => {
    acc[curr.studentId] = curr;
    return acc;
  }, {} as Record<string, AttendanceType>);

  const filteredStudents = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) => {
      const searchable = `${student.name} ${student.parentMobile} ${student.place}`.toLowerCase();
      return searchable.includes(query);
    });
  }, [students, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, students.length, date]);

  const paginatedStudents = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredStudents.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredStudents, currentPage]);

  const handleMark = async (studentId: string, status: 'present' | 'absent') => {
    if (!user) return;
    try {
      const existing = attendanceMap[studentId];
      if (existing?.id) {
          if (existing.status === status) return; // No change
          await setDoc(doc(db, 'attendance', existing.id), {
              ...existing,
              status,
              updatedAt: Date.now()
          });
      } else {
          // Add new record
          const newDocRef = doc(collection(db, 'attendance'));
          const payload: AttendanceType = {
              adminId: user.adminId,
              studentId,
              date,
              status,
              createdAt: Date.now()
          };
          await setDoc(newDocRef, payload);
      }
    } catch (error) {
        handleFirestoreError(error, 'write' as any, 'attendance');
    }
  };

  const getAbsentMessage = (studentName: string, dateStr: string) => {
    const formattedDate = format(new Date(dateStr), 'MMM do, yyyy');
    return `Dear Parent, your ward ${studentName} is absent today (${formattedDate}).`;
  };

  const getAbsentTemplate = (studentName: string, dateStr: string) => ({
    name: 'absence_notify',
    languageCode: 'en',
    bodyParams: [
      studentName,
      format(new Date(dateStr), 'MMM do, yyyy'),
    ],
  });

  const handleSendAbsentMessage = async (studentId: string, studentName: string, mobile: string) => {
    setSendingIds((prev) => ({ ...prev, [studentId]: true }));
    try {
      await sendWhatsAppMessage(mobile, getAbsentMessage(studentName, date), getAbsentTemplate(studentName, date));
      toast.success(`Absent notification sent to ${studentName}'s parent.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send WhatsApp message.');
    } finally {
      setSendingIds((prev) => ({ ...prev, [studentId]: false }));
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center bg-white p-4 rounded-lg border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-primary">Attendance</h1>
          <p className="text-gray-500 text-sm">Mark daily attendance</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Date:</label>
          <Input 
            type="date" 
            value={date} 
            onChange={(e) => setDate(e.target.value)} 
            className="w-auto"
          />
        </div>
      </div>

      <SearchInput
        value={searchTerm}
        onChange={setSearchTerm}
        placeholder="Search by student name, place or parent mobile"
      />

      <div className="border rounded-md bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead className="w-1/3">Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {studentsLoading || attendanceLoading ? (
              <TableRow><TableCell colSpan={3} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filteredStudents.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center text-gray-500 py-8">No students found.</TableCell></TableRow>
            ) : (
              paginatedStudents.map(student => {
                const record = attendanceMap[student.id!];
                return (
                  <TableRow key={student.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={student.photoURL} />
                          <AvatarFallback>{student.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{student.name}</p>
                          <p className="text-xs text-gray-500">{student.parentMobile}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant={record?.status === 'present' ? 'default' : 'outline'}
                          className={record?.status === 'present' ? 'bg-green-600 hover:bg-green-700' : ''}
                          onClick={() => handleMark(student.id!, 'present')}
                          size="sm"
                        >
                          Present
                        </Button>
                        <Button 
                          variant={record?.status === 'absent' ? 'default' : 'outline'}
                          className={record?.status === 'absent' ? 'bg-red-600 hover:bg-red-700' : ''}
                          onClick={() => handleMark(student.id!, 'absent')}
                          size="sm"
                        >
                          Absent
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {record?.status === 'absent' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-green-600 hover:text-green-700 hover:bg-green-50"
                          disabled={!!sendingIds[student.id!]}
                          onClick={() => handleSendAbsentMessage(student.id!, student.name, student.parentMobile)}
                        >
                          <MessageSquareWarning className="w-4 h-4 mr-2" />
                          {sendingIds[student.id!] ? 'Sending...' : 'Notify'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {!studentsLoading && !attendanceLoading && (
        <Pagination
          currentPage={currentPage}
          pageSize={PAGE_SIZE}
          totalItems={filteredStudents.length}
          onPageChange={setCurrentPage}
        />
      )}
    </div>
  );
}
