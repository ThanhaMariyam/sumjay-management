import { useEffect, useMemo, useState } from 'react';
import { useStudents, useFees } from '../lib/hooks';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { db, handleFirestoreError } from '../lib/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { MessageSquareWarning, MessageSquareShare } from 'lucide-react';
import { Fee as FeeType, MemberRole } from '../types';
import { sendWhatsAppMessage } from '../lib/whatsapp';
import { toast } from 'sonner';
import { SearchInput } from '../components/SearchInput';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../lib/AuthContext';
import { useMemberRoleFilter } from '../lib/memberRoleFilter';

const DEFAULT_FEE_AMOUNT = 1000;
const DEFAULT_FUND_AMOUNT = 100;
const DEFAULT_ANNUAL_FUND_AMOUNT = DEFAULT_FUND_AMOUNT * 12;
const PAGE_SIZE = 10;

export default function Fees() {
  const { user, isMembershipAdmin } = useAuth();
  const { students, loading: studentsLoading } = useStudents(isMembershipAdmin ? 'members' : 'students');
  const entityLabel = isMembershipAdmin ? 'Member' : 'Student';
  const contactLabel = isMembershipAdmin ? 'Phone' : 'Parent Mobile';
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [fundYear, setFundYear] = useState(format(new Date(), 'yyyy'));
  const [defaultAmount, setDefaultAmount] = useState(String(isMembershipAdmin ? DEFAULT_FUND_AMOUNT : DEFAULT_FEE_AMOUNT));
  const { fees, loading: feesLoading } = useFees();
  const [sendingIds, setSendingIds] = useState<Record<string, boolean>>({});
  const [paidDialogOpen, setPaidDialogOpen] = useState(false);
  const [dueDialogOpen, setDueDialogOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const { memberRoleFilter, setMemberRoleFilter } = useMemberRoleFilter();
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setDefaultAmount(String(
      isMembershipAdmin
        ? (memberRoleFilter === 'abroad' ? DEFAULT_ANNUAL_FUND_AMOUNT : DEFAULT_FUND_AMOUNT)
        : DEFAULT_FEE_AMOUNT,
    ));
  }, [isMembershipAdmin, memberRoleFilter]);

  const isAnnualFund = isMembershipAdmin && memberRoleFilter === 'abroad';
  const fundPeriodKey = isAnnualFund ? `${fundYear}-01` : month;
  const fundPeriodLabel = isAnnualFund ? fundYear : format(new Date(`${month}-01`), 'MMMM yyyy');
  const monthFees = fees.filter(f => f.month === fundPeriodKey);
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
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: isMembershipAdmin ? 0 : 2,
    }).format(value);

  const roleFilteredStudents = useMemo(() => {
    if (!isMembershipAdmin) return students;
    return students.filter((student) => (student.memberRole === 'abroad' ? 'abroad' : 'local') === memberRoleFilter);
  }, [students, isMembershipAdmin, memberRoleFilter]);

  const totals = useMemo(() => {
    const expected = roleFilteredStudents.reduce((sum, student) => sum + getStudentAmount(student.id!), 0);
    const received = roleFilteredStudents.reduce((sum, student) => {
      const record = feeMap[student.id!];
      if (record?.status !== 'paid') return sum;
      const paidAmount = typeof record.paidAmount === 'number'
        ? record.paidAmount
        : (typeof record.amount === 'number' ? record.amount : getStudentAmount(student.id!));
      return sum + paidAmount;
    }, 0);
    const pending = roleFilteredStudents.reduce((sum, student) => {
      const record = feeMap[student.id!];
      const feeAmount = getStudentAmount(student.id!);
      const paidAmount = record?.status === 'paid'
        ? (record.paidAmount ?? record.amount ?? feeAmount)
        : 0;
      return sum + Math.max(feeAmount - paidAmount, 0);
    }, 0);
    return { expected, received, pending };
  }, [roleFilteredStudents, feeMap, defaultAmount]);

  const dueStudents = useMemo(() => {
    return roleFilteredStudents
      .map((student) => {
        const record = feeMap[student.id!];
        const expectedAmount = getStudentAmount(student.id!);
        const paidAmount = record?.status === 'paid' ? (record.paidAmount ?? record.amount ?? expectedAmount) : 0;
        const balanceAmount = Math.max(expectedAmount - paidAmount, 0);
        return {
          id: student.id!,
          name: student.name,
          parentMobile: isMembershipAdmin ? (student.phoneNumber || '') : student.parentMobile,
          paidAmount,
          balanceAmount,
          status: paidAmount <= 0 ? 'UNPAID' : 'PARTIAL PAID',
        };
      })
      .filter((row) => row.balanceAmount > 0);
  }, [roleFilteredStudents, feeMap, defaultAmount, isMembershipAdmin]);

  const filteredStudents = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return roleFilteredStudents;
    return roleFilteredStudents.filter((student) => {
      const roleLabel = student.memberRole === 'abroad' ? 'abroad' : 'local';
      const searchable = `${student.name} ${isMembershipAdmin ? student.phoneNumber : student.parentMobile} ${student.place} ${roleLabel}`.toLowerCase();
      return searchable.includes(query);
    });
  }, [roleFilteredStudents, searchTerm, isMembershipAdmin]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, roleFilteredStudents.length, month, memberRoleFilter]);

  const paginatedStudents = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredStudents.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredStudents, currentPage]);

  const handleMark = async (studentId: string, status: 'paid' | 'unpaid', paidAmount?: number) => {
    if (!user) return false;
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
              adminId: user.adminId,
              studentId,
              month: fundPeriodKey,
              amount,
              paidAmount: nextPaidAmount,
              status,
              paidOn: nextPaidOn,
              paidAt: nextPaidAt,
              createdAt: Date.now()
          };
          await setDoc(newDocRef, payload);
      }
      return true;
    } catch (error) {
        toast.error(`Failed to update ${isMembershipAdmin ? 'fund' : 'fee'} record. Please check Firestore rules and try again.`);
        try {
          handleFirestoreError(error, 'write' as any, 'fees');
        } catch (loggedError) {
          console.error(loggedError);
        }
        return false;
    }
  };

  const getPaidMessage = (studentName: string, monthStr: string) => {
    const formattedMonth = isAnnualFund ? fundYear : format(new Date(monthStr + '-01'), 'MMMM yyyy');
    if (isMembershipAdmin) {
      return `Dear Member, your ${isAnnualFund ? 'annual' : 'monthly'} fund for ${formattedMonth} has been received. Thank you, ${studentName}.`;
    }
    return `Dear Parent, fees of this month (${formattedMonth}) for your ward ${studentName} has been received. Thank you.`;
  };

  const getWarningMessage = (studentName: string, monthStr: string) => {
    const formattedMonth = isAnnualFund ? fundYear : format(new Date(monthStr + '-01'), 'MMMM yyyy');
    if (isMembershipAdmin) {
      return `Dear Member, this is a reminder that your ${isAnnualFund ? 'annual' : 'monthly'} fund for ${formattedMonth} is pending. Kindly pay at the earliest, ${studentName}.`;
    }
    return `Dear Parent, this is a reminder that fees for ${formattedMonth} for your ward ${studentName} is pending. Kindly pay at the earliest.`;
  };

  const getPartialPaymentMessage = (
    studentName: string,
    monthStr: string,
    expectedAmount: number,
    paidAmount: number,
  ) => {
    const formattedMonth = isAnnualFund ? fundYear : format(new Date(monthStr + '-01'), 'MMMM yyyy');
    const balance = Math.max(expectedAmount - paidAmount, 0);
    if (isMembershipAdmin) {
      return `Dear Member, for ${formattedMonth}, we received INR ${paidAmount.toFixed(2)} from ${studentName}. ${isAnnualFund ? 'Annual' : 'Monthly'} fund is INR ${expectedAmount.toFixed(2)}. Pending balance is INR ${balance.toFixed(2)}. Kindly clear the balance.`;
    }
    return `Dear Parent, for ${formattedMonth}, we received INR ${paidAmount.toFixed(2)} for your ward ${studentName}. Monthly fee is INR ${expectedAmount.toFixed(2)}. Pending balance is INR ${balance.toFixed(2)}. Kindly clear the balance.`;
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
          ? getPaidMessage(studentName, fundPeriodKey)
          : messageType === 'partial' && meta
            ? getPartialPaymentMessage(studentName, fundPeriodKey, meta.expectedAmount, meta.paidAmount)
            : getWarningMessage(studentName, fundPeriodKey);
      await sendWhatsAppMessage(mobile, message);
      const personLabel = isMembershipAdmin ? 'member' : 'parent';
      toast.success(
        messageType === 'receipt'
          ? `${isMembershipAdmin ? 'Fund' : 'Payment'} receipt sent to ${studentName}'s ${personLabel}.`
          : messageType === 'partial'
            ? `${isMembershipAdmin ? 'Fund' : 'Payment'} warning sent to ${studentName}'s ${personLabel}.`
            : `${isMembershipAdmin ? 'Fund overdue' : 'Overdue payment'} warning sent to ${studentName}'s ${personLabel}.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send WhatsApp message.');
    } finally {
      setSendingIds((prev) => ({ ...prev, [studentId]: false }));
    }
  };

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
    if (!isAnnualFund && addAmount > balanceAmount + 0.009) {
      toast.error(`Entered amount is greater than balance ${formatAmount(balanceAmount)}.`);
      return;
    }
    const nextPaidAmount = isAnnualFund ? currentPaidAmount + addAmount : Math.min(currentPaidAmount + addAmount, expectedAmount);
    const ok = await handleMark(selectedStudentId, 'paid', nextPaidAmount);
    if (!ok) return;
    setPaidDialogOpen(false);
    setSelectedStudentId(null);
    setPaymentAmountInput('');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center bg-white p-4 rounded-lg border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-primary">{isMembershipAdmin ? 'Fund Record' : 'Fees Record'}</h1>
          <p className="text-gray-500 text-sm">Manage {isAnnualFund ? 'yearly fund' : `monthly ${isMembershipAdmin ? 'fund' : 'fees'}`}, amount and balance</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <label className="text-sm font-medium text-gray-700">{isAnnualFund ? 'Year:' : 'Month:'}</label>
          {isAnnualFund ? (
            <Input
              type="number"
              min={2000}
              max={2100}
              step={1}
              value={fundYear}
              onChange={(e) => setFundYear(e.target.value)}
              className="w-28"
            />
          ) : (
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-auto"
            />
          )}
          <label className="text-sm font-medium text-gray-700">Default Amount:</label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={defaultAmount}
            onChange={(e) => setDefaultAmount(e.target.value)}
            className="w-36"
          />
          {isMembershipAdmin && (
            <>
              <label className="text-sm font-medium text-gray-700">Role:</label>
              <Select value={memberRoleFilter} onValueChange={(value) => setMemberRoleFilter(value as MemberRole)}>
                <SelectTrigger className="w-36 bg-white">
                  <SelectValue placeholder="Filter role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="abroad">Abroad</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
          <Button
            type="button"
            onClick={() => setDueDialogOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Due {entityLabel}s
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
        placeholder={`Search by ${entityLabel.toLowerCase()} name, place or ${contactLabel.toLowerCase()}`}
      />

      <div className="border rounded-md bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{entityLabel}</TableHead>
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
              <TableRow><TableCell colSpan={5} className="text-center text-gray-500 py-8">No {entityLabel.toLowerCase()}s found.</TableCell></TableRow>
            ) : (
              paginatedStudents.map(student => {
                const record = feeMap[student.id!];
                const feeAmount = getStudentAmount(student.id!);
                const paidAmount = record?.status === 'paid'
                  ? (record.paidAmount ?? record.amount ?? feeAmount)
                  : 0;
                const balanceAmount = Math.max(feeAmount - paidAmount, 0);
                const isPaidExact = record?.status === 'paid' && (isAnnualFund ? paidAmount + 0.009 >= feeAmount : Math.abs(paidAmount - feeAmount) < 0.01);
                const hasPaidMismatch = record?.status === 'paid' && !isPaidExact;
                // Show warning as soon as a row is marked unpaid (or no payment exists yet).
                const isOverdue = !record || record.status === 'unpaid';

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
                          <p className="text-xs text-gray-500">{isMembershipAdmin ? student.phoneNumber : student.parentMobile}</p>
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
                          onClick={() => handleSendFeeMessage(student.id!, student.name, isMembershipAdmin ? (student.phoneNumber || '') : student.parentMobile, 'receipt')}
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
                            isMembershipAdmin ? (student.phoneNumber || '') : student.parentMobile,
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
                <p>{entityLabel}: {selectedStudent.name}</p>
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
                {isAnnualFund ? 'Yearly' : 'Monthly'} amount to be paid: {formatAmount(parseAmount(defaultAmount))}
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
            <DialogTitle>Due {entityLabel}s ({fundPeriodLabel})</DialogTitle>
          </DialogHeader>
          <div className="max-h-[420px] overflow-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{entityLabel}</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dueStudents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-gray-500 py-8">
                      No unpaid or partial-paid {entityLabel.toLowerCase()}s for this month.
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

