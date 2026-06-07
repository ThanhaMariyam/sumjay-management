import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { IndianRupee } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { useCurrentMemberProfile, useMemberFees } from '../lib/hooks';

const DEFAULT_FUND_AMOUNT = 100;
const DEFAULT_ANNUAL_FUND_AMOUNT = DEFAULT_FUND_AMOUNT * 12;

const formatAmount = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

export default function UserDashboard() {
  const { member, loading: profileLoading } = useCurrentMemberProfile();
  const { fees, loading: feesLoading } = useMemberFees(member?.id);
  const isAbroadMember = member?.memberRole === 'abroad';
  const currentMonth = format(new Date(), 'yyyy-MM');
  const currentYear = format(new Date(), 'yyyy');
  const currentPeriodKey = isAbroadMember ? `${currentYear}-01` : currentMonth;
  const currentPeriodLabel = isAbroadMember ? currentYear : format(new Date(`${currentMonth}-01`), 'MMMM yyyy');
  const currentFee = fees.find((fee) => fee.month === currentPeriodKey);
  const expectedAmount = currentFee?.amount ?? (isAbroadMember ? DEFAULT_ANNUAL_FUND_AMOUNT : DEFAULT_FUND_AMOUNT);
  const paidAmount = currentFee?.status === 'paid'
    ? (currentFee.paidAmount ?? currentFee.amount ?? expectedAmount)
    : 0;
  const balanceAmount = Math.max(expectedAmount - paidAmount, 0);

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
    <div className="space-y-6 max-w-5xl mx-auto">
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
            <div className="text-2xl font-bold">{member.name}</div>
            <p className="text-xs text-muted-foreground">{member.phoneNumber}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{isAbroadMember ? 'Paid This Year' : 'Paid This Month'}</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{feesLoading ? '...' : formatAmount(paidAmount)}</div>
            <p className="text-xs text-muted-foreground">{currentPeriodLabel}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Balance</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-700">{feesLoading ? '...' : formatAmount(balanceAmount)}</div>
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
          <div className="grid flex-1 gap-3 text-sm md:grid-cols-2">
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
    </div>
  );
}
