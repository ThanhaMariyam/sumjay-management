import { useEffect, useMemo, useState } from 'react';
import { useStudents, useAttendance, useFees, useMembers } from '../lib/hooks';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Users, CalendarCheck, IndianRupee, AlertCircle } from 'lucide-react';
import { addMonths, format } from 'date-fns';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { useAuth } from '../lib/AuthContext';
import { MemberRole } from '../types';
import { useMemberRoleFilter } from '../lib/memberRoleFilter';

type CompactTooltipProps = {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
  }>;
};

function CompactTooltip({ active, payload }: CompactTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0];
  return (
    <div className="rounded border bg-white px-2 py-1 text-[11px] leading-none shadow-sm">
      <span style={{ color: item.color }}>{item.name}: {item.value}</span>
    </div>
  );
}

const DEFAULT_FEE_AMOUNT = 1000;
const DEFAULT_FUND_AMOUNT = 100;
const DEFAULT_ANNUAL_FUND_AMOUNT = DEFAULT_FUND_AMOUNT * 12;
const MONTHLY_FUND_ACCRUAL_START = '2026-06';

export default function Dashboard() {
  const { isMembershipAdmin } = useAuth();
  const { students, loading: sl } = useStudents();
  const { members, loading: ml } = useMembers();
  const { attendance, loading: al } = useAttendance();
  const { fees, loading: fl } = useFees();
  const [now, setNow] = useState(new Date());
  const [dueDialogOpen, setDueDialogOpen] = useState(false);
  const { memberRoleFilter, setMemberRoleFilter } = useMemberRoleFilter();

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const monthStr = format(new Date(), 'yyyy-MM');
  const yearStr = format(new Date(), 'yyyy');
  const fundPeriodKey = isMembershipAdmin && memberRoleFilter === 'abroad' ? `${yearStr}-01` : monthStr;
  const fundPeriodLabel = isMembershipAdmin && memberRoleFilter === 'abroad' ? yearStr : format(new Date(`${monthStr}-01`), 'MMMM yyyy');
  const todayDate = new Date().getDate();

  const todaysAttendance = attendance.filter(a => a.date === todayStr);
  const presentCount = todaysAttendance.filter(a => a.status === 'present').length;
  const absentCount = todaysAttendance.filter(a => a.status === 'absent').length;
  // Unmarked could be students.length - todaysAttendance.length

  const filteredMembers = useMemo(() => {
    return members.filter((member) => (member.memberRole === 'abroad' ? 'abroad' : 'local') === memberRoleFilter);
  }, [members, memberRoleFilter]);
  const activePeople = isMembershipAdmin ? filteredMembers : students;
  const fallbackAmount = isMembershipAdmin
    ? (memberRoleFilter === 'abroad' ? DEFAULT_ANNUAL_FUND_AMOUNT : DEFAULT_FUND_AMOUNT)
    : DEFAULT_FEE_AMOUNT;
  const monthFees = fees.filter(f => f.month === fundPeriodKey);
  const monthFeeMap = monthFees.reduce((acc, fee) => {
    acc[fee.studentId] = fee;
    return acc;
  }, {} as Record<string, typeof monthFees[number]>);
  const feeByStudentAndMonth = useMemo(() => {
    return fees.reduce((acc, fee) => {
      acc[`${fee.studentId}:${fee.month}`] = fee;
      return acc;
    }, {} as Record<string, typeof fees[number]>);
  }, [fees]);
  const isAmountEqual = (a: number, b: number) => Math.abs(a - b) < 0.01;
  const isFullPayment = (paidAmount: number, expectedAmount: number) => (
    isMembershipAdmin
      ? paidAmount + 0.009 >= expectedAmount
      : isAmountEqual(paidAmount, expectedAmount)
  );
  const getLocalFundLedger = (personId: string) => {
    if (!isMembershipAdmin || memberRoleFilter === 'abroad' || monthStr < MONTHLY_FUND_ACCRUAL_START) {
      const record = monthFeeMap[personId];
      const expectedAmount = typeof record?.amount === 'number' && record.amount >= 0 ? record.amount : fallbackAmount;
      const paidAmount = record?.status === 'paid' ? (record.paidAmount ?? record.amount ?? expectedAmount) : 0;
      return { expectedAmount, paidAmount, isPaid: record?.status === 'paid' };
    }

    let expectedAmount = 0;
    let paidAmount = 0;
    let periodDate = new Date(`${MONTHLY_FUND_ACCRUAL_START}-01T00:00:00`);
    const endDate = new Date(`${monthStr}-01T00:00:00`);

    while (periodDate <= endDate) {
      const periodKey = format(periodDate, 'yyyy-MM');
      const record = feeByStudentAndMonth[`${personId}:${periodKey}`];
      expectedAmount += fallbackAmount;
      if (record?.status === 'paid') {
        paidAmount += record.paidAmount ?? record.amount ?? fallbackAmount;
      }
      periodDate = addMonths(periodDate, 1);
    }

    expectedAmount = Math.round(expectedAmount * 100) / 100;
    paidAmount = Math.round(paidAmount * 100) / 100;
    return { expectedAmount, paidAmount, isPaid: paidAmount > 0.009 };
  };
  const monthlyPaymentRows = activePeople.map((person) => {
    return getLocalFundLedger(person.id!);
  });
  const paidCount = monthlyPaymentRows.filter((row) => row.isPaid && isFullPayment(row.paidAmount, row.expectedAmount)).length;
  const partialPaidCount = monthlyPaymentRows.filter((row) => row.isPaid && !isFullPayment(row.paidAmount, row.expectedAmount)).length;
  const pendingCount = Math.max(activePeople.length - paidCount - partialPaidCount, 0);
  const monthlyExpectedAmount = monthlyPaymentRows.reduce((sum, row) => sum + row.expectedAmount, 0);
  const monthlyReceivedAmount = monthlyPaymentRows.reduce((sum, row) => sum + row.paidAmount, 0);

  const formatWholeAmount = (value: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

  const attendanceChartData = useMemo(() => [
    { name: 'Present', value: presentCount, color: '#16a34a' },
    { name: 'Absent', value: absentCount, color: '#dc2626' },
    { name: 'Unmarked', value: Math.max(students.length - todaysAttendance.length, 0), color: '#6b7280' },
  ], [presentCount, absentCount, students.length, todaysAttendance.length]);

  const feesChartData = useMemo(() => [
    { name: 'Paid', value: paidCount, color: '#2563eb' },
    { name: 'Partial Paid', value: partialPaidCount, color: '#f59e0b' },
    { name: 'Pending', value: Math.max(pendingCount, 0), color: '#f97316' },
  ], [paidCount, partialPaidCount, pendingCount]);

  const dueStudents = useMemo(() => {
    return activePeople
      .map((student) => {
        const { expectedAmount, paidAmount } = getLocalFundLedger(student.id!);
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
  }, [activePeople, monthFeeMap, isMembershipAdmin]);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 md:space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Dashboard</h1>
        <p className="text-gray-500">{isMembershipAdmin ? 'Overview of membership data.' : 'Overview of Sumjay Football Camp student activity.'}</p>
        </div>
        <div className="flex w-full flex-col items-stretch gap-2 md:w-auto md:flex-row md:self-auto">
          <div className="rounded-md border bg-white px-4 py-2 text-sm text-gray-700 shadow-sm md:min-w-[250px]">
            <p className="font-medium">{format(now, 'EEEE, dd MMMM yyyy')}</p>
            <p className="text-xs text-gray-500">{format(now, 'hh:mm:ss a')}</p>
          </div>
          {isMembershipAdmin && (
            <Select value={memberRoleFilter} onValueChange={(value) => setMemberRoleFilter(value as MemberRole)}>
              <SelectTrigger className="w-full bg-white shadow-sm md:w-40">
                <SelectValue placeholder="Filter role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local</SelectItem>
                <SelectItem value="abroad">Abroad</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button
            type="button"
            onClick={() => setDueDialogOpen(true)}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 md:w-auto"
          >
            Due {isMembershipAdmin ? 'Members' : 'Students'}
          </Button>
        </div>
      </div>

      <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${isMembershipAdmin ? '' : 'xl:grid-cols-4'}`}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{isMembershipAdmin ? 'Total Members' : 'Total Students'}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isMembershipAdmin ? (ml ? '...' : activePeople.length) : (sl ? '...' : students.length)}</div>
            <p className="text-xs text-muted-foreground">Registered in the system</p>
          </CardContent>
        </Card>

        {!isMembershipAdmin && <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Attendance</CardTitle>
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {al || sl ? '...' : `${presentCount} / ${students.length}`}
            </div>
            <div className="flex gap-2 mt-1">
                <span className="text-xs text-green-600 font-medium">{presentCount} Present</span>
                <span className="text-xs text-red-600 font-medium">{absentCount} Absent</span>
                <span className="text-xs text-gray-500 font-medium">{(students.length - todaysAttendance.length)} Unmarked</span>
            </div>
          </CardContent>
        </Card>}

        {!isMembershipAdmin && <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{isMembershipAdmin ? 'Fund this Month' : 'Fees this Month'}</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
                {fl ? '...' : `${paidCount} Paid`}
            </div>
            <>
              <p className="text-xs text-amber-600 font-medium">{partialPaidCount} Partial Paid</p>
              <p className="text-xs text-orange-600 font-medium">{pendingCount} Pending</p>
            </>
          </CardContent>
        </Card>}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{isMembershipAdmin && memberRoleFilter === 'abroad' ? 'Amount Received This Year' : 'Amount Received This Month'}</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">
              {fl
                ? '...'
                : `${formatWholeAmount(monthlyReceivedAmount)} / ${formatWholeAmount(monthlyExpectedAmount)}`}
            </div>
            <p className="text-xs text-muted-foreground">
              Received / total expected
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {!isMembershipAdmin && <Card>
          <CardHeader>
            <CardTitle>Attendance Distribution</CardTitle>
            <CardDescription>Today's present, absent and unmarked students</CardDescription>
          </CardHeader>
          <CardContent className="h-[100px] pt-0">
            <div className="h-[68px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <Pie data={attendanceChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={28}>
                    {attendanceChartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CompactTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px]">
              {attendanceChartData.map((entry) => (
                <span key={entry.name} className="inline-flex items-center gap-1 text-gray-600">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: entry.color }} />
                  {entry.name}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>}

        <Card>
          <CardHeader>
            <CardTitle>{isMembershipAdmin ? (memberRoleFilter === 'abroad' ? 'Fund Status This Year' : 'Fund Status This Month') : 'Fee Status This Month'}</CardTitle>
            <CardDescription>{isMembershipAdmin ? 'Paid vs pending members' : 'Paid vs pending students'}</CardDescription>
          </CardHeader>
          <CardContent className="h-[100px] pt-0">
            <div className="h-[68px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <Pie data={feesChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={28}>
                    {feesChartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CompactTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px]">
              {feesChartData.map((entry) => (
                <span key={entry.name} className="inline-flex items-center gap-1 text-gray-600">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: entry.color }} />
                  {entry.name}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {isMembershipAdmin && <Card>
            <CardHeader>
                <CardTitle>Fund Notifications</CardTitle>
                <CardDescription>Monthly fund follow-ups</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-gray-500 mb-4">
                   {todayDate > 3 ? (
                       <span className="flex items-center text-red-600 gap-1"><AlertCircle className="w-4 h-4"/> Overdue: Please notify pending fund payments.</span>
                   ) : (
                       memberRoleFilter === 'abroad' ? 'Annual fund is due by the 3rd.' : 'Fund is due by the 3rd of the month.'
                   )}
                </p>
                <Button asChild variant="secondary" className="w-full sm:w-auto">
                    <Link to="/fees">View Fund & Notify</Link>
                </Button>
            </CardContent>
        </Card>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {!isMembershipAdmin && <Card>
              <CardHeader>
                  <CardTitle>Attendance Actions</CardTitle>
                  <CardDescription>Mark attendance or send notifications</CardDescription>
              </CardHeader>
              <CardContent>
                  <p className="text-sm text-gray-500 mb-4">
                      {students.length - todaysAttendance.length} students haven't been marked for today.
                  </p>
                  <Button asChild>
                      <Link to="/attendance">Mark Attendance Now</Link>
                  </Button>
              </CardContent>
          </Card>}

          {!isMembershipAdmin && <Card>
              <CardHeader>
                  <CardTitle>Fee Reminders</CardTitle>
                  <CardDescription>Monthly fee status and follow-ups</CardDescription>
              </CardHeader>
              <CardContent>
                  <p className="text-sm text-gray-500 mb-4">
                     {todayDate > 3 ? (
                         <span className="flex items-center text-red-600 gap-1"><AlertCircle className="w-4 h-4"/> Overdue: Please notify pending payments.</span>
                     ) : (
                         "Fees are due by the 3rd of the month."
                     )}
                  </p>
                  <Button asChild variant="secondary" className="w-full sm:w-auto">
                      <Link to="/fees">View Fees & Notify</Link>
                  </Button>
              </CardContent>
          </Card>}
      </div>

      <Dialog open={dueDialogOpen} onOpenChange={setDueDialogOpen}>
        <DialogContent className="responsive-due-dialog">
          <DialogHeader>
            <DialogTitle>Due {isMembershipAdmin ? 'Members' : 'Students'} ({fundPeriodLabel})</DialogTitle>
          </DialogHeader>
          <div className="responsive-due-table max-h-[420px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="due-person-cell">{isMembershipAdmin ? 'Member' : 'Student'}</TableHead>
                  <TableHead className="due-amount-cell">Paid</TableHead>
                  <TableHead className="due-amount-cell">Balance</TableHead>
                  <TableHead className="due-status-cell">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dueStudents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-gray-500 py-8">
                      No unpaid or partial-paid {isMembershipAdmin ? 'members' : 'students'} for this month.
                    </TableCell>
                  </TableRow>
                ) : (
                  dueStudents.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="due-person-cell">
                        <div>
                          <p className="font-medium">{row.name}</p>
                          <p className="text-xs text-gray-500">{row.parentMobile}</p>
                        </div>
                      </TableCell>
                      <TableCell className="due-amount-cell text-green-700 font-medium">{formatWholeAmount(row.paidAmount)}</TableCell>
                      <TableCell className="due-amount-cell text-orange-700 font-medium">{formatWholeAmount(row.balanceAmount)}</TableCell>
                      <TableCell className="due-status-cell">
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
