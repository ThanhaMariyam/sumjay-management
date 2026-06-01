import { useEffect, useMemo, useState } from 'react';
import { useStudents, useFees } from '../lib/hooks';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { db, auth, handleFirestoreError } from '../lib/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { MessageSquareWarning, MessageSquareShare } from 'lucide-react';
import { Fee as FeeType } from '../types';
import { sendWhatsAppMessage } from '../lib/whatsapp';
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import { Pagination } from '../components/Pagination';

const DEFAULT_FEE_AMOUNT = 1000;
const PAGE_SIZE = 10;

export default function Fees() {
  const { students, loading: studentsLoading } = useStudents();
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [defaultAmount, setDefaultAmount] = useState(String(DEFAULT_FEE_AMOUNT));
  const { fees, loading: feesLoading } = useFees();
  const [sendingIds, setSendingIds] = useState<Record<string, boolean>>({});
  const [paidDialogOpen, setPaidDialogOpen] = useState(false);
  const [dueDialogOpen, setDueDialogOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const monthFees = fees.filter(f => f.month === month);
  const feeMap = monthFees.reduce((acc, curr) => {
    acc[curr.studentId] = curr;
    return acc;
  }, {} as Record<string, FeeType>);

  const parseAmount = (value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.round(parsed * 100) / 100;
  };

  const getStudentAmount = (studentId: string) => {
    void studentId;
    return parseAmount(defaultAmount);
  };

  const formatAmount = (value: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);

  const totals = useMemo(() => {
    const expected = students.reduce((sum, student) => sum + getStudentAmount(student.id!), 0);
    const received = students.reduce((sum, student) => {
      const record = feeMap[student.id!];
      if (record?.status !== 'paid') return sum;
      const paidAmount = typeof record.paidAmount === 'number'
        ? record.paidAmount
        : (typeof record.amount === 'number' ? record.amount : getStudentAmount(student.id!));
      return sum + paidAmount;
    }, 0);
    const pending = students.reduce((sum, student) => {
      const record = feeMap[student.id!];
      const feeAmount = getStudentAmount(student.id!);
      const paidAmount = record?.status === 'paid'
        ? (record.paidAmount ?? record.amount ?? feeAmount)
        : 0;
      return sum + Math.max(feeAmount - paidAmount, 0);
    }, 0);
    return { expected, received, pending };
  }, [students, feeMap, defaultAmount]);

  const dueStudents = useMemo(() => {
    return students
      .map((student) => {
        const record = feeMap[student.id!];
        const expectedAmount = getStudentAmount(student.id!);
        const paidAmount = record?.status === 'paid' ? (record.paidAmount ?? record.amount ?? expectedAmount) : 0;
        const balanceAmount = Math.max(expectedAmount - paidAmount, 0);
        return {
          id: student.id!,
          name: student.name,
          parentMobile: student.parentMobile,
          paidAmount,
          balanceAmount,
          status: paidAmount <= 0 ? 'UNPAID' : 'PARTIAL PAID',
        };
      })
      .filter((row) => row.balanceAmount > 0);
  }, [students, feeMap, defaultAmount]);

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
  }, [searchTerm, students.length, month]);

  const paginatedStudents = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredStudents.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredStudents, currentPage]);

  const handleMark = async (studentId: string, status: 'paid' | 'unpaid', paidAmount?: number) => {
    if (!auth.currentUser) return;
    try {
      const existing = feeMap[studentId];
      const amount = getStudentAmount(studentId);
      const nextPaidAmount = status === 'paid' ? (paidAmount ?? existing?.paidAmount ?? existing?.amount ?? amount) : 0;
      const nextPaidOn = status === 'paid' ? format(new Date(), 'yyyy-MM-dd') : null;
      const nextPaidAt = status === 'paid' ? Date.now() : null;
      if (existing?.id) {
          if (
            existing.status === status &&
            (existing.amount ?? 0) === amount &&
            (existing.paidAmount ?? 0) === nextPaidAmount
          ) {
            return;
          }
          await setDoc(doc(db, 'fees', existing.id), {
              ...existing,
              status,
              amount,
              paidAmount: nextPaidAmount,
              paidOn: nextPaidOn,
              paidAt: nextPaidAt,
              updatedAt: Date.now()
          });
      } else {
          const newDocRef = doc(collection(db, 'fees'));
          const payload: FeeType = {
              adminId: auth.currentUser.uid,
              studentId,
              month,
              amount,
              paidAmount: nextPaidAmount,
              status,
              paidOn: nextPaidOn,
              paidAt: nextPaidAt,
              createdAt: Date.now()
          };
          await setDoc(newDocRef, payload);
      }
    } catch (error) {
        handleFirestoreError(error, 'write' as any, 'fees');
    }
  };

  const getPaidMessage = (studentName: string, monthStr: string) => {
    const formattedMonth = format(new Date(monthStr + '-01'), 'MMMM yyyy');
    return `Dear Parent, fees of this month (${formattedMonth}) for your ward ${studentName} is received. Thank you.`;
  };

  const getWarningMessage = (studentName: string, monthStr: string) => {
    const formattedMonth = format(new Date(monthStr + '-01'), 'MMMM yyyy');
    return `Dear Parent, this is a gentle reminder that the fees for ${formattedMonth} for your ward ${studentName} is pending. Kindly pay at the earliest.`;
  };

  const getPartialPaymentMessage = (
    studentName: string,
    monthStr: string,
    expectedAmount: number,
    paidAmount: number,
  ) => {
    const formattedMonth = format(new Date(monthStr + '-01'), 'MMMM yyyy');
    const balance = Math.max(expectedAmount - paidAmount, 0);
    return `Dear Parent, for ${formattedMonth}, we received INR ${paidAmount.toFixed(2)} for ${studentName}. Monthly fee is INR ${expectedAmount.toFixed(2)}. Pending balance is INR ${balance.toFixed(2)}. Kindly clear the balance.`;
  };

  const handleSendFeeMessage = async (
    studentId: string,
    studentName: string,
    mobile: string,
    messageType: 'receipt' | 'overdue' | 'partial',
    meta?: { expectedAmount: number; paidAmount: number },
  ) => {
    setSendingIds((prev) => ({ ...prev, [studentId]: true }));
    try {
      const message =
        messageType === 'receipt'
          ? getPaidMessage(studentName, month)
          : messageType === 'partial' && meta
            ? getPartialPaymentMessage(studentName, month, meta.expectedAmount, meta.paidAmount)
            : getWarningMessage(studentName, month);
      await sendWhatsAppMessage(mobile, message);
      toast.success(
        messageType === 'receipt'
          ? `Payment receipt sent to ${studentName}'s parent.`
          : messageType === 'partial'
            ? `Payment warning sent to ${studentName}'s parent.`
            : `Overdue warning sent to ${studentName}'s parent.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send WhatsApp message.');
    } finally {
      setSendingIds((prev) => ({ ...prev, [studentId]: false }));
    }
  };

  const todayDate = new Date().getDate();
  const selectedStudent = students.find((student) => student.id === selectedStudentId);

  const openPaidAmountDialog = (studentId: string) => {
    const record = feeMap[studentId];
    const expectedAmount = getStudentAmount(studentId);
    const currentPaidAmount = record?.status === 'paid'
      ? (record.paidAmount ?? record.amount ?? expectedAmount)
      : 0;
    const balanceAmount = Math.max(expectedAmount - currentPaidAmount, 0);
    setSelectedStudentId(studentId);
    setPaymentAmountInput(balanceAmount > 0 ? String(balanceAmount) : '');
    setPaidDialogOpen(true);
  };

  const handleConfirmPaid = async () => {
    if (!selectedStudentId) return;
    const addAmount = parseAmount(paymentAmountInput);
    if (addAmount <= 0) {
      toast.error('Please enter an amount greater than 0.');
      return;
    }
    const record = feeMap[selectedStudentId];
    const expectedAmount = getStudentAmount(selectedStudentId);
    const currentPaidAmount = record?.status === 'paid'
      ? (record.paidAmount ?? record.amount ?? expectedAmount)
      : 0;
    const balanceAmount = Math.max(expectedAmount - currentPaidAmount, 0);
    if (addAmount > balanceAmount + 0.009) {
      toast.error(`Entered amount is greater than balance ${formatAmount(balanceAmount)}.`);
      return;
    }
    const nextPaidAmount = Math.min(currentPaidAmount + addAmount, expectedAmount);
    await handleMark(selectedStudentId, 'paid', nextPaidAmount);
    setPaidDialogOpen(false);
    setSelectedStudentId(null);
    setPaymentAmountInput('');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center bg-white p-4 rounded-lg border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-primary">Fees Record</h1>
          <p className="text-gray-500 text-sm">Manage monthly fees, amount and balance</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <label className="text-sm font-medium text-gray-700">Month:</label>
          <Input 
            type="month" 
            value={month} 
            onChange={(e) => setMonth(e.target.value)} 
            className="w-auto"
          />
          <label className="text-sm font-medium text-gray-700">Default Amount:</label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={defaultAmount}
            onChange={(e) => setDefaultAmount(e.target.value)}
            className="w-36"
          />
          <Button
            type="button"
            onClick={() => setDueDialogOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Due Students
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total Expected</p>
          <p className="text-xl font-bold text-primary">{formatAmount(totals.expected)}</p>
        </div>
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total Received</p>
          <p className="text-xl font-bold text-green-600">{formatAmount(totals.received)}</p>
        </div>
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Balance Pending</p>
          <p className="text-xl font-bold text-orange-600">{formatAmount(totals.pending)}</p>
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
              <TableHead>Paid</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead className="w-1/3">Status</TableHead>
              <TableHead className="text-right">Notify via WhatsApp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {studentsLoading || feesLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filteredStudents.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-gray-500 py-8">No students found.</TableCell></TableRow>
            ) : (
              paginatedStudents.map(student => {
                const record = feeMap[student.id!];
                const feeAmount = getStudentAmount(student.id!);
                const paidAmount = record?.status === 'paid'
                  ? (record.paidAmount ?? record.amount ?? feeAmount)
                  : 0;
                const balanceAmount = Math.max(feeAmount - paidAmount, 0);
                const isPaidExact = record?.status === 'paid' && Math.abs(paidAmount - feeAmount) < 0.01;
                const hasPaidMismatch = record?.status === 'paid' && !isPaidExact;
                // if unpaid AND past 3rd of month => show warning
                // we'll just check if status is unpaid or null, if date > 3 then warning available
                const isOverdue = todayDate > 3 && (!record || record.status === 'unpaid');

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
                    <TableCell className="text-green-700 font-medium">{formatAmount(paidAmount)}</TableCell>
                    <TableCell className="text-orange-700 font-medium">{formatAmount(balanceAmount)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant={record?.status === 'paid' ? 'default' : 'outline'}
                          className={record?.status === 'paid' ? 'bg-green-600 hover:bg-green-700' : ''}
                          onClick={() => openPaidAmountDialog(student.id!)}
                          size="sm"
                        >
                          Paid
                        </Button>
                        <Button 
                          variant={record?.status === 'unpaid' ? 'default' : 'outline'}
                          className={record?.status === 'unpaid' ? 'bg-orange-500 hover:bg-orange-600' : ''}
                          onClick={() => handleMark(student.id!, 'unpaid')}
                          size="sm"
                        >
                          Unpaid
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      {isPaidExact && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-green-600 hover:text-green-700 hover:bg-green-50"
                          disabled={!!sendingIds[student.id!]}
                          onClick={() => handleSendFeeMessage(student.id!, student.name, student.parentMobile, 'receipt')}
                        >
                          <MessageSquareShare className="w-4 h-4 mr-2" />
                          {sendingIds[student.id!] ? 'Sending...' : 'Receipt'}
                        </Button>
                      )}
                      {(hasPaidMismatch || ((record?.status === 'unpaid' || !record) && isOverdue)) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          disabled={!!sendingIds[student.id!]}
                          onClick={() => handleSendFeeMessage(
                            student.id!,
                            student.name,
                            student.parentMobile,
                            hasPaidMismatch ? 'partial' : 'overdue',
                            hasPaidMismatch ? { expectedAmount: feeAmount, paidAmount } : undefined,
                          )}
                        >
                          <MessageSquareWarning className="w-4 h-4 mr-2" />
                          {sendingIds[student.id!] ? 'Sending...' : hasPaidMismatch ? 'Payment Warning' : 'Overdue Warning'}
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

      {!studentsLoading && !feesLoading && (
        <Pagination
          currentPage={currentPage}
          pageSize={PAGE_SIZE}
          totalItems={filteredStudents.length}
          onPageChange={setCurrentPage}
        />
      )}

      <Dialog open={paidDialogOpen} onOpenChange={setPaidDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Payment Amount</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {selectedStudent && (
              <div className="text-sm text-gray-600 space-y-1">
                <p>Student: {selectedStudent.name}</p>
                <p>
                  Already paid:{' '}
                  <span className="font-medium text-green-700">
                    {formatAmount(
                      feeMap[selectedStudent.id!]?.status === 'paid'
                        ? (feeMap[selectedStudent.id!]?.paidAmount ?? feeMap[selectedStudent.id!]?.amount ?? getStudentAmount(selectedStudent.id!))
                        : 0,
                    )}
                  </span>
                </p>
                <p>
                  Balance:{' '}
                  <span className="font-medium text-orange-700">
                    {formatAmount(
                      Math.max(
                        getStudentAmount(selectedStudent.id!) - (
                          feeMap[selectedStudent.id!]?.status === 'paid'
                            ? (feeMap[selectedStudent.id!]?.paidAmount ?? feeMap[selectedStudent.id!]?.amount ?? getStudentAmount(selectedStudent.id!))
                            : 0
                        ),
                        0,
                      ),
                    )}
                  </span>
                </p>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Amount Received Now</label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={paymentAmountInput}
                onChange={(e) => setPaymentAmountInput(e.target.value)}
                placeholder="Enter received amount"
                autoFocus
              />
              <p className="text-xs text-gray-500">
                Monthly amount to be paid: {formatAmount(parseAmount(defaultAmount))}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPaidDialogOpen(false);
                  setSelectedStudentId(null);
                  setPaymentAmountInput('');
                }}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleConfirmPaid}>OK</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dueDialogOpen} onOpenChange={setDueDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Due Students ({format(new Date(`${month}-01`), 'MMMM yyyy')})</DialogTitle>
          </DialogHeader>
          <div className="max-h-[420px] overflow-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dueStudents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-gray-500 py-8">
                      No unpaid or partial-paid students for this month.
                    </TableCell>
                  </TableRow>
                ) : (
                  dueStudents.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{row.name}</p>
                          <p className="text-xs text-gray-500">{row.parentMobile}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-green-700 font-medium">{formatAmount(row.paidAmount)}</TableCell>
                      <TableCell className="text-orange-700 font-medium">{formatAmount(row.balanceAmount)}</TableCell>
                      <TableCell>
                        <span className={row.status === 'UNPAID' ? 'text-red-600 font-medium' : 'text-amber-600 font-medium'}>
                          {row.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

