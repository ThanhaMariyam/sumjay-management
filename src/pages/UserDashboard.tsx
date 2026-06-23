import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addMonths, format } from 'date-fns';
import { ChevronDown, Crown, Flame, IndianRupee } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { useCurrentMemberProfile, useFees, useMemberFees, useStudents } from '../lib/hooks';
import { MemberRole } from '../types';
import { cn } from '../lib/utils';

const DEFAULT_FUND_AMOUNT = 100;
const DEFAULT_ANNUAL_FUND_AMOUNT = DEFAULT_FUND_AMOUNT * 12;
const MONTHLY_FUND_ACCRUAL_START = '2026-06';

const formatAmount = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

export default function UserDashboard() {
  const { member, loading: profileLoading } = useCurrentMemberProfile();
  const { fees, loading: feesLoading } = useMemberFees(member?.id);
  const { students: allMembers, loading: membersLoading } = useStudents('members');
  const { fees: allFees, loading: allFeesLoading } = useFees();
  const [memberRoleFilter, setMemberRoleFilter] = useState<MemberRole>('local');
  const [allPaymentsOpen, setAllPaymentsOpen] = useState(false);
  const isAbroadMember = member?.memberRole === 'abroad';
  const currentMonth = format(new Date(), 'yyyy-MM');
  const currentYear = format(new Date(), 'yyyy');
  const currentPeriodKey = isAbroadMember ? `${currentYear}-01` : currentMonth;
  const currentPeriodLabel = isAbroadMember ? currentYear : format(new Date(`${currentMonth}-01`), 'MMMM yyyy');
  const feeByMonth = useMemo(() => {
    return fees.reduce((acc, fee) => {
      acc[fee.month] = fee;
      return acc;
    }, {} as Record<string, typeof fees[number]>);
  }, [fees]);
  const currentFee = feeByMonth[currentPeriodKey];
  const expectedAmount = currentFee?.amount ?? (isAbroadMember ? DEFAULT_ANNUAL_FUND_AMOUNT : DEFAULT_FUND_AMOUNT);
  const paidAmount = currentFee?.status === 'paid'
    ? (currentFee.paidAmount ?? currentFee.amount ?? expectedAmount)
    : 0;
  const balanceAmount = useMemo(() => {
    if (isAbroadMember) return Math.max(expectedAmount - paidAmount, 0);

    let expected = 0;
    let paid = 0;
    let periodDate = new Date(`${MONTHLY_FUND_ACCRUAL_START}-01T00:00:00`);
    const endDate = new Date(`${currentPeriodKey}-01T00:00:00`);

    while (periodDate <= endDate) {
      const periodKey = format(periodDate, 'yyyy-MM');
      const record = feeByMonth[periodKey];
      const amount = record?.amount ?? DEFAULT_FUND_AMOUNT;
      expected += amount;
      if (record?.status === 'paid') {
        paid += record.paidAmount ?? record.amount ?? amount;
      }
      periodDate = addMonths(periodDate, 1);
    }

    return Math.max(Math.round((expected - paid) * 100) / 100, 0);
  }, [isAbroadMember, expectedAmount, paidAmount, currentPeriodKey, feeByMonth]);
  const filteredMembers = useMemo(() => {
    return allMembers.filter((row) => (row.memberRole === 'abroad' ? 'abroad' : 'local') === memberRoleFilter);
  }, [allMembers, memberRoleFilter]);
  const selectedRoleMinimum = memberRoleFilter === 'abroad' ? DEFAULT_ANNUAL_FUND_AMOUNT : DEFAULT_FUND_AMOUNT;
  const selectedRolePeriodKey = memberRoleFilter === 'abroad' ? `${currentYear}-01` : currentMonth;
  const paymentByMemberId = useMemo(() => {
    return allFees
      .filter((fee) => fee.month === selectedRolePeriodKey)
      .reduce((acc, fee) => {
        acc[fee.studentId] = fee;
        return acc;
      }, {} as Record<string, typeof allFees[number]>);
  }, [allFees, selectedRolePeriodKey]);
  const paymentRows = useMemo(() => {
    const rows = filteredMembers.map((row) => {
      const payment = paymentByMemberId[row.id!];
      const expected = payment?.amount ?? selectedRoleMinimum;
      const paid = payment?.status === 'paid' ? (payment.paidAmount ?? payment.amount ?? expected) : 0;
      const balance = Math.max(expected - paid, 0);
      const paidDate = payment?.paidOn
        ? format(new Date(`${payment.paidOn}T00:00:00`), 'dd MMM yyyy')
        : typeof payment?.paidAt === 'number'
          ? format(new Date(payment.paidAt), 'dd MMM yyyy')
          : '-';
      return {
        id: row.id!,
        name: row.name,
        paid,
        balance,
        paidDate,
        isAboveMinimum: paid > selectedRoleMinimum + 0.009,
        status: paid + 0.009 >= selectedRoleMinimum ? 'PAID' : paid > 0 ? 'PARTIAL PAID' : 'UNPAID',
      };
    });

    return rows.sort((a, b) => b.paid - a.paid);
  }, [filteredMembers, paymentByMemberId, selectedRoleMinimum]);
  const topExtraPaidMembers = useMemo(() => {
    return paymentRows
      .filter((row) => row.isAboveMinimum)
      .slice(0, 3)
      .reduce((acc, row, index) => {
        acc.set(row.id, index + 1);
        return acc;
      }, new Map<string, number>());
  }, [paymentRows]);

  if (profileLoading) {
    return <div className="max-w-5xl mx-auto text-gray-500">Loading...</div>;
  }

  if (!member) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Dashboard</h1>
        <Card>
          <CardHeader>
            <CardTitle>Create your member profile</CardTitle>
            <CardDescription>Your profile will appear in the membership admin member list after you save it.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/user/profile">Create Profile</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Dashboard</h1>
          <p className="text-gray-500">Your profile and member payment details.</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/user/profile">Edit Profile</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Member</CardTitle>
            <Avatar className="h-10 w-10">
              <AvatarImage src={member.photoURL} />
              <AvatarFallback>{member.name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
          </CardHeader>
          <CardContent>
            <div className="break-words text-2xl font-bold">{member.name}</div>
            <p className="text-xs text-muted-foreground">{member.phoneNumber}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{isAbroadMember ? 'Paid This Year' : 'Paid This Month'}</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="break-words text-2xl font-bold text-green-700">{feesLoading ? '...' : formatAmount(paidAmount)}</div>
            <p className="text-xs text-muted-foreground">{currentPeriodLabel}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Balance</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="break-words text-2xl font-bold text-orange-700">{feesLoading ? '...' : formatAmount(balanceAmount)}</div>
            <p className="text-xs text-muted-foreground">{isAbroadMember ? 'Yearly fund status' : 'Monthly fund status'}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile Details</CardTitle>
          <CardDescription>These details match the member admin directory.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 md:flex-row md:items-start">
          <Avatar className="h-28 w-28 shrink-0">
            <AvatarImage src={member.photoURL} />
            <AvatarFallback className="text-3xl">{member.name.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 flex-1 gap-3 text-sm md:grid-cols-2">
            <p><span className="font-medium text-gray-700">Date of Birth:</span> {member.dob}</p>
            <p><span className="font-medium text-gray-700">Email:</span> {member.email || '-'}</p>
            <p><span className="font-medium text-gray-700">Place:</span> {member.place}</p>
            <p><span className="font-medium text-gray-700">Phone Number:</span> {member.phoneNumber}</p>
            <p><span className="font-medium text-gray-700">Role:</span> {isAbroadMember ? 'Abroad' : 'Local'}</p>
            <p><span className="font-medium text-gray-700">Blood Group:</span> {member.bloodGroup}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment History</CardTitle>
          <CardDescription>{isAbroadMember ? 'Yearly fund entries recorded by membership admin.' : 'Monthly fund entries recorded by membership admin.'}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isAbroadMember ? 'Year' : 'Month'}</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feesLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : fees.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-gray-500 py-8">No payment records found.</TableCell></TableRow>
                ) : (
                  fees.map((fee) => {
                    const amount = fee.amount ?? (isAbroadMember ? DEFAULT_ANNUAL_FUND_AMOUNT : DEFAULT_FUND_AMOUNT);
                    const paid = fee.status === 'paid' ? (fee.paidAmount ?? fee.amount ?? amount) : 0;
                    const balance = Math.max(amount - paid, 0);
                    return (
                      <TableRow key={fee.id}>
                        <TableCell>{isAbroadMember ? format(new Date(`${fee.month}-01`), 'yyyy') : format(new Date(`${fee.month}-01`), 'MMMM yyyy')}</TableCell>
                        <TableCell className="text-green-700 font-medium">{formatAmount(paid)}</TableCell>
                        <TableCell className="text-orange-700 font-medium">{formatAmount(balance)}</TableCell>
                        <TableCell className={balance <= 0 ? 'text-green-700 font-medium' : 'text-amber-600 font-medium'}>
                          {balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL PAID' : 'UNPAID'}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={() => setAllPaymentsOpen((open) => !open)}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>All Member Payments</CardTitle>
              <CardDescription>Member fund details sorted by amount paid.</CardDescription>
            </div>
            <ChevronDown className={cn('h-5 w-5 transition-transform', allPaymentsOpen && 'rotate-180')} />
          </div>
        </CardHeader>
        {allPaymentsOpen && (
          <CardContent className="space-y-4">
            <div className="w-full md:w-44">
              <Select value={memberRoleFilter} onValueChange={(value) => setMemberRoleFilter(value as MemberRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="abroad">Abroad</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Amount Paid</TableHead>
                    <TableHead>Payment Status</TableHead>
                    <TableHead>Paid Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {membersLoading || allFeesLoading ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8">Loading...</TableCell></TableRow>
                  ) : paymentRows.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-gray-500 py-8">No members found.</TableCell></TableRow>
                  ) : (
                    paymentRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            {row.name}
                            {topExtraPaidMembers.has(row.id) && (
                              <Crown
                                className="h-4 w-4"
                                style={{
                                  color:
                                    topExtraPaidMembers.get(row.id) === 1
                                      ? '#d97706'
                                      : topExtraPaidMembers.get(row.id) === 2
                                        ? '#64748b'
                                        : '#b45309',
                                }}
                              />
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-green-700 font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            {formatAmount(row.paid)}
                            {row.isAboveMinimum && <Flame className="h-4 w-4 fill-orange-500 text-orange-500" />}
                          </span>
                        </TableCell>
                        <TableCell className={row.status === 'PAID' ? 'text-green-700 font-medium' : row.status === 'PARTIAL PAID' ? 'text-amber-600 font-medium' : 'text-red-600 font-medium'}>
                          {row.status}
                        </TableCell>
                        <TableCell>{row.paidDate}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
