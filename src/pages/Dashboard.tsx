import { useEffect, useMemo, useState } from 'react';
import { useStudents, useAttendance, useFees } from '../lib/hooks';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Users, CalendarCheck, IndianRupee, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

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

export default function Dashboard() {
  const { students, loading: sl } = useStudents();
  const { attendance, loading: al } = useAttendance();
  const { fees, loading: fl } = useFees();
  const [now, setNow] = useState(new Date());
  const [dueDialogOpen, setDueDialogOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const monthStr = format(new Date(), 'yyyy-MM');
  const todayDate = new Date().getDate();

  const todaysAttendance = attendance.filter(a => a.date === todayStr);
  const presentCount = todaysAttendance.filter(a => a.status === 'present').length;
  const absentCount = todaysAttendance.filter(a => a.status === 'absent').length;
  // Unmarked could be students.length - todaysAttendance.length

  const monthFees = fees.filter(f => f.month === monthStr);
  const monthFeeMap = monthFees.reduce((acc, fee) => {
    acc[fee.studentId] = fee;
    return acc;
  }, {} as Record<string, typeof monthFees[number]>);
  const isAmountEqual = (a: number, b: number) => Math.abs(a - b) < 0.01;
  const paidCount = monthFees.filter((fee) => {
    if (fee.status !== 'paid') return false;
    const expectedAmount = typeof fee.amount === 'number' ? fee.amount : 0;
    const paidAmount = typeof fee.paidAmount === 'number' ? fee.paidAmount : expectedAmount;
    return isAmountEqual(paidAmount, expectedAmount);
  }).length;
  const partialPaidCount = monthFees.filter((fee) => {
    if (fee.status !== 'paid') return false;
    const expectedAmount = typeof fee.amount === 'number' ? fee.amount : 0;
    const paidAmount = typeof fee.paidAmount === 'number' ? fee.paidAmount : expectedAmount;
    return !isAmountEqual(paidAmount, expectedAmount);
  }).length;
  const pendingCount = Math.max(students.length - paidCount - partialPaidCount, 0);
  const monthlyReceivedAmount = monthFees.reduce((sum, fee) => {
    if (fee.status !== 'paid') return sum;
    const amount = typeof fee.paidAmount === 'number' ? fee.paidAmount : (fee.amount ?? 0);
    return sum + amount;
  }, 0);

  const formatAmount = (value: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);

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
    return students
      .map((student) => {
        const record = monthFeeMap[student.id!];
        const expectedAmount = typeof record?.amount === 'number' && record.amount >= 0 ? record.amount : DEFAULT_FEE_AMOUNT;
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
  }, [students, monthFeeMap]);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
        <h1 className="text-3xl font-bold tracking-tight text-purple-600">Dashboard</h1>
        <p className="text-gray-500">Overview of Sumjay Football Camp student activity.</p>
        </div>
        <div className="flex items-stretch gap-2 self-start md:self-auto">
          <div className="rounded-md border bg-white px-4 py-2 text-sm text-gray-700 shadow-sm min-w-[250px]">
            <p className="font-medium">{format(now, 'EEEE, dd MMMM yyyy')}</p>
            <p className="text-xs text-gray-500">{format(now, 'hh:mm:ss a')}</p>
          </div>
          <Button
            type="button"
            onClick={() => setDueDialogOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Due Students
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sl ? '...' : students.length}</div>
            <p className="text-xs text-muted-foreground">Registered in the system</p>
          </CardContent>
        </Card>

        <Card>
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
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fees this Month</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
                {fl || sl ? '...' : `${paidCount} Paid`}
            </div>
            <p className="text-xs text-amber-600 font-medium">{partialPaidCount} Partial Paid</p>
            <p className="text-xs text-orange-600 font-medium">{pendingCount} Pending</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Amount Received This Month</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">
              {fl ? '...' : formatAmount(monthlyReceivedAmount)}
            </div>
            <p className="text-xs text-muted-foreground">Collection tracked from fee records</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
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
            <div className="mt-1 flex items-center justify-center gap-3 text-[11px]">
              {attendanceChartData.map((entry) => (
                <span key={entry.name} className="inline-flex items-center gap-1 text-gray-600">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: entry.color }} />
                  {entry.name}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fee Status This Month</CardTitle>
            <CardDescription>Paid vs pending students</CardDescription>
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
            <div className="mt-1 flex items-center justify-center gap-3 text-[11px]">
              {feesChartData.map((entry) => (
                <span key={entry.name} className="inline-flex items-center gap-1 text-gray-600">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: entry.color }} />
                  {entry.name}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
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
          </Card>

          <Card>
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
          </Card>
      </div>

      <Dialog open={dueDialogOpen} onOpenChange={setDueDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Due Students ({format(new Date(`${monthStr}-01`), 'MMMM yyyy')})</DialogTitle>
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
