import { useEffect, useMemo, useState } from 'react';
import { useStudents, useAttendance, useFees } from '../lib/hooks';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Download, FileText } from 'lucide-react';
import { SearchInput } from '../components/SearchInput';
import { Pagination } from '../components/Pagination';
import {
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { downloadCsvFile, downloadPdfTable } from '../lib/reportExport';
import { Fee, MemberRole } from '../types';
import { useAuth } from '../lib/AuthContext';
import { useMemberRoleFilter } from '../lib/memberRoleFilter';

type FilterType = 'day' | 'week' | 'month' | 'year';
const DEFAULT_FEE_AMOUNT = 1000;
const DEFAULT_FUND_AMOUNT = 100;
const DEFAULT_ANNUAL_FUND_AMOUNT = DEFAULT_FUND_AMOUNT * 12;
const PAGE_SIZE = 10;

function getDateRange(filterType: FilterType) {
  const now = new Date();
  if (filterType === 'day') return { start: startOfDay(now), end: endOfDay(now) };
  if (filterType === 'week') return { start: startOfWeek(now), end: endOfWeek(now) };
  if (filterType === 'month') return { start: startOfMonth(now), end: endOfMonth(now) };
  return { start: startOfYear(now), end: endOfYear(now) };
}

function isInRange(date: Date, start: Date, end: Date) {
  const value = date.getTime();
  return value >= start.getTime() && value <= end.getTime();
}

function getFeeRecordDate(fee: Fee) {
  if (fee.paidOn) {
    const paidOnDate = parseISO(fee.paidOn);
    if (isValid(paidOnDate)) return paidOnDate;
  }
  if (typeof fee.updatedAt === 'number') {
    const updatedDate = new Date(fee.updatedAt);
    if (isValid(updatedDate)) return updatedDate;
  }
  if (typeof fee.createdAt === 'number') {
    const createdDate = new Date(fee.createdAt);
    if (isValid(createdDate)) return createdDate;
  }
  const monthDate = parseISO(`${fee.month}-01`);
  return isValid(monthDate) ? monthDate : null;
}

export default function Reports() {
  const { isMembershipAdmin } = useAuth();
  const { students } = useStudents(isMembershipAdmin ? 'members' : 'students');
  const { attendance } = useAttendance();
  const { fees } = useFees();
  const [filterType, setFilterType] = useState<FilterType>('month');
  const [attendanceSearchTerm, setAttendanceSearchTerm] = useState('');
  const [feesSearchTerm, setFeesSearchTerm] = useState('');
  const { memberRoleFilter, setMemberRoleFilter } = useMemberRoleFilter();
  const [attendancePage, setAttendancePage] = useState(1);
  const [feesPage, setFeesPage] = useState(1);
  const defaultAmount = isMembershipAdmin
    ? (memberRoleFilter === 'abroad' ? DEFAULT_ANNUAL_FUND_AMOUNT : DEFAULT_FUND_AMOUNT)
    : DEFAULT_FEE_AMOUNT;

  const reportStudents = useMemo(() => {
    if (!isMembershipAdmin) return students;
    return students.filter((student) => (student.memberRole === 'abroad' ? 'abroad' : 'local') === memberRoleFilter);
  }, [students, isMembershipAdmin, memberRoleFilter]);

  const reportStudentIds = useMemo(() => new Set(reportStudents.map((student) => student.id).filter(Boolean) as string[]), [reportStudents]);

  const studentMap = reportStudents.reduce((acc, s) => {
    acc[s.id!] = s;
    return acc;
  }, {} as Record<string, any>);

  const { start, end } = useMemo(() => getDateRange(filterType), [filterType]);

  const filteredAttendance = useMemo(() => {
    return attendance.filter((entry) => {
      const date = parseISO(entry.date);
      return isValid(date) && isInRange(date, start, end);
    });
  }, [attendance, start, end]);

  const attendanceRows = useMemo(() => {
    const studentDateStatusMap = filteredAttendance.reduce((acc, entry) => {
      if (!acc[entry.studentId]) {
        acc[entry.studentId] = {};
      }
      acc[entry.studentId][entry.date] = entry.status.toUpperCase();
      return acc;
    }, {} as Record<string, Record<string, string>>);

    const relevantStudentIds = reportStudents.map((student) => student.id).filter(Boolean) as string[];

    if (filterType === 'day') {
      const dayHeader = format(start, 'dd MMM yyyy');
      return relevantStudentIds.map((studentId) => ({
        Name: studentMap[studentId]?.name || 'Unknown',
        [dayHeader]: studentDateStatusMap[studentId]?.[format(start, 'yyyy-MM-dd')] || '-',
      }));
    }

    if (filterType === 'week') {
      const days = eachDayOfInterval({ start, end });
      return relevantStudentIds.map((studentId) => {
        const row: Record<string, string> = {
          Name: studentMap[studentId]?.name || 'Unknown',
        };
        days.forEach((day) => {
          const dayKey = format(day, 'EEEE');
          const dateKey = format(day, 'yyyy-MM-dd');
          row[dayKey] = studentDateStatusMap[studentId]?.[dateKey] || '-';
        });
        return row;
      });
    }

    if (filterType === 'month') {
      const days = eachDayOfInterval({ start, end });
      return relevantStudentIds.map((studentId) => {
        const row: Record<string, string> = {
          Name: studentMap[studentId]?.name || 'Unknown',
        };
        days.forEach((day) => {
          const dayKey = format(day, 'dd MMM');
          const dateKey = format(day, 'yyyy-MM-dd');
          row[dayKey] = studentDateStatusMap[studentId]?.[dateKey] || '-';
        });
        return row;
      });
    }

    return relevantStudentIds.map((studentId) => {
      const row: Record<string, string> = {
        Name: studentMap[studentId]?.name || 'Unknown',
      };
      for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
        const monthKey = format(new Date(start.getFullYear(), monthIndex, 1), 'MMM');
        const presentCount = filteredAttendance.filter((entry) => {
          if (entry.studentId !== studentId) return false;
          const entryDate = parseISO(entry.date);
          return isValid(entryDate) && entryDate.getMonth() === monthIndex && entry.status === 'present';
        }).length;
        row[monthKey] = String(presentCount);
      }
      return row;
    });
  }, [filteredAttendance, studentMap, start, end, filterType, reportStudents]);

  const attendancePdfRows = useMemo(() => {
    return filteredAttendance
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || a.studentId.localeCompare(b.studentId))
      .map((entry) => ({
        Date: format(parseISO(entry.date), 'yyyy-MM-dd'),
        Name: studentMap[entry.studentId]?.name || 'Unknown',
        Status: entry.status.toUpperCase(),
      }));
  }, [filteredAttendance, studentMap]);

  const filteredFees = useMemo(() => {
    return fees.filter((fee) => {
      if (!reportStudentIds.has(fee.studentId)) return false;
      const date = getFeeRecordDate(fee);
      if (!date) return false;
      return isInRange(date, start, end);
    });
  }, [fees, start, end, reportStudentIds]);

  const feesRows = useMemo(() => {
    return filteredFees.map((fee) => {
      const recordDate = getFeeRecordDate(fee);
      const normalizedStatus = String(fee.status || '').toLowerCase();
      const expectedAmount = typeof fee.amount === 'number' && fee.amount >= 0 ? fee.amount : defaultAmount;
      const paidAmount = normalizedStatus === 'paid'
        ? (typeof fee.paidAmount === 'number' && fee.paidAmount >= 0 ? fee.paidAmount : expectedAmount)
        : 0;
      const balanceAmount = Math.max(expectedAmount - paidAmount, 0);
      const isFullPaid = normalizedStatus === 'paid' && (
        isMembershipAdmin && memberRoleFilter === 'abroad'
          ? paidAmount + 0.009 >= expectedAmount
          : Math.abs(paidAmount - expectedAmount) < 0.01
      );
      const displayStatus = normalizedStatus === 'paid'
        ? (isFullPaid ? 'PAID' : 'PARTIAL PAID')
        : 'UNPAID';
      return {
        Date: recordDate ? format(recordDate, 'yyyy-MM-dd') : '',
        Name: studentMap[fee.studentId]?.name || 'Unknown',
        Paid: paidAmount,
        Balance: balanceAmount,
        Status: displayStatus,
      };
    });
  }, [filteredFees, studentMap, defaultAmount]);

  const feesSummary = useMemo(() => {
    const totalExpected = filteredFees.reduce((sum, fee) => {
      const amount = typeof fee.amount === 'number' && fee.amount >= 0 ? fee.amount : defaultAmount;
      return sum + amount;
    }, 0);
    const totalCollected = filteredFees.reduce((sum, fee) => {
      const normalizedStatus = String(fee.status || '').toLowerCase();
      if (normalizedStatus !== 'paid') return sum;
      const expectedAmount = typeof fee.amount === 'number' && fee.amount >= 0 ? fee.amount : defaultAmount;
      const paidAmount = typeof fee.paidAmount === 'number' && fee.paidAmount >= 0 ? fee.paidAmount : expectedAmount;
      return sum + paidAmount;
    }, 0);
    const totalPending = filteredFees.reduce((sum, fee) => {
      const expectedAmount = typeof fee.amount === 'number' && fee.amount >= 0 ? fee.amount : defaultAmount;
      const normalizedStatus = String(fee.status || '').toLowerCase();
      const paidAmount = normalizedStatus === 'paid'
        ? (typeof fee.paidAmount === 'number' && fee.paidAmount >= 0 ? fee.paidAmount : expectedAmount)
        : 0;
      return sum + Math.max(expectedAmount - paidAmount, 0);
    }, 0);
    return { totalExpected, totalCollected, totalPending };
  }, [filteredFees, defaultAmount]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
  const formatPdfAmount = (value: number) =>
    `INR ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value)}`;

  const attendanceHeaders = useMemo(
    () => (attendanceRows.length > 0 ? Object.keys(attendanceRows[0]) : ['Name']),
    [attendanceRows],
  );
  const feesHeaders = useMemo(
    () => (feesRows.length > 0 ? Object.keys(feesRows[0]) : ['Date', 'Name', 'Paid', 'Balance', 'Status']),
    [feesRows],
  );

  const filteredAttendanceRows = useMemo(() => {
    const query = attendanceSearchTerm.trim().toLowerCase();
    if (!query) return attendanceRows;
    return attendanceRows.filter((row) =>
      Object.values(row).some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [attendanceRows, attendanceSearchTerm]);

  const filteredFeesRows = useMemo(() => {
    const query = feesSearchTerm.trim().toLowerCase();
    if (!query) return feesRows;
    return feesRows.filter((row) =>
      Object.values(row).some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [feesRows, feesSearchTerm]);

  useEffect(() => {
    setAttendancePage(1);
  }, [attendanceSearchTerm, attendanceRows.length, filterType, memberRoleFilter]);

  useEffect(() => {
    setFeesPage(1);
  }, [feesSearchTerm, feesRows.length, filterType, memberRoleFilter]);

  const paginatedAttendanceRows = useMemo(() => {
    const startIndex = (attendancePage - 1) * PAGE_SIZE;
    return filteredAttendanceRows.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredAttendanceRows, attendancePage]);

  const paginatedFeesRows = useMemo(() => {
    const startIndex = (feesPage - 1) * PAGE_SIZE;
    return filteredFeesRows.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredFeesRows, feesPage]);

  const downloadReport = (type: 'attendance' | 'fees', formatType: 'csv' | 'pdf') => {
    const dateSuffix = format(new Date(), 'yyyyMMdd');

    if (type === 'attendance') {
      const filename = `attendance_report_${filterType}_${dateSuffix}.${formatType}`;
      if (formatType === 'csv') {
        downloadCsvFile(attendanceRows, filename);
      } else {
        const presentCount = attendancePdfRows.filter((row) => row.Status === 'PRESENT').length;
        const absentCount = attendancePdfRows.filter((row) => row.Status === 'ABSENT').length;
        const summaryLines = [
          `Present Entries: ${presentCount}`,
          `Absent Entries: ${absentCount}`,
        ];
        downloadPdfTable(attendancePdfRows, filename, `Attendance Report (${filterType})`, summaryLines);
      }
      return;
    }

    const filename = `fees_report_${filterType}_${dateSuffix}.${formatType}`;
    const summaryLines = [
      `Total Expected: ${formatPdfAmount(feesSummary.totalExpected)}`,
      `Total Collected: ${formatPdfAmount(feesSummary.totalCollected)}`,
      `Balance Pending: ${formatPdfAmount(feesSummary.totalPending)}`,
    ];
    if (formatType === 'csv') {
      const feesCsvRows = feesRows.map((row) => ({
        ...row,
        // Force Excel to treat date as text to avoid ####### display.
        Date: row.Date ? `'${row.Date}` : '',
      }));
      const summaryRows = [
        { Date: '', Name: '', Paid: '', Balance: '', Status: '' },
        { Date: '', Name: 'Total Amount Got', Paid: feesSummary.totalCollected, Balance: '', Status: '' },
        { Date: '', Name: 'Balance Pending', Paid: '', Balance: feesSummary.totalPending, Status: '' },
      ];
      downloadCsvFile([...feesCsvRows, ...summaryRows], filename);
    } else {
      downloadPdfTable(feesRows, filename, `Fees Report (${filterType})`, summaryLines);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Reports</h1>
        <p className="text-gray-500">{isMembershipAdmin ? 'Download membership fees reports as CSV or PDF.' : 'Download attendance and fees reports as CSV or PDF.'}</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-lg border shadow-sm">
        <label className="text-sm font-medium text-gray-700">Filter By:</label>
        <Select value={filterType} onValueChange={(value) => setFilterType(value as FilterType)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
          </SelectContent>
        </Select>
        {isMembershipAdmin && (
          <>
            <label className="text-sm font-medium text-gray-700">Role:</label>
            <Select value={memberRoleFilter} onValueChange={(value) => setMemberRoleFilter(value as MemberRole)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local</SelectItem>
                <SelectItem value="abroad">Abroad</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      <div className={`grid grid-cols-1 ${isMembershipAdmin ? 'md:grid-cols-1' : 'md:grid-cols-2'} gap-6`}>
        {!isMembershipAdmin && <Card className="h-full">
          <CardHeader>
            <CardTitle>Attendance Report</CardTitle>
            <CardDescription>Download the report in CSV or PDF format</CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => downloadReport('attendance', 'csv')}
                className="flex-1 min-w-[140px] gap-2 justify-center"
              >
                <Download className="w-4 h-4" />
                Download CSV
              </Button>
              <Button
                onClick={() => downloadReport('attendance', 'pdf')}
                className="flex-1 min-w-[140px] gap-2 justify-center"
                variant="secondary"
              >
                <FileText className="w-4 h-4" />
                Download PDF
              </Button>
            </div>
          </CardContent>
        </Card>}

        <Card className="h-full">
          <CardHeader>
            <CardTitle>{isMembershipAdmin ? 'Membership Fees Report' : 'Fees Report'}</CardTitle>
            <CardDescription>Download the report in CSV or PDF format</CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => downloadReport('fees', 'csv')}
                className="flex-1 min-w-[140px] gap-2 justify-center"
              >
                <Download className="w-4 h-4" />
                Download CSV
              </Button>
              <Button
                onClick={() => downloadReport('fees', 'pdf')}
                className="flex-1 min-w-[140px] gap-2 justify-center"
                variant="secondary"
              >
                <FileText className="w-4 h-4" />
                Download PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {!isMembershipAdmin && <Card>
          <CardHeader>
            <CardTitle>Attendance Report Table</CardTitle>
            <CardDescription>Preview of attendance report data for selected filter</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <SearchInput
                value={attendanceSearchTerm}
                onChange={setAttendanceSearchTerm}
                placeholder="Search attendance report"
              />
              <Table>
                <TableHeader>
                  <TableRow>
                    {attendanceHeaders.map((header) => (
                      <TableHead key={header} className="whitespace-nowrap">
                        {header}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAttendanceRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={attendanceHeaders.length} className="text-center text-gray-500">
                        No attendance records for selected filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedAttendanceRows.map((row, index) => (
                      <TableRow key={`${row.Name}-${index}`}>
                        {attendanceHeaders.map((header) => (
                          <TableCell key={`${header}-${index}`} className="whitespace-nowrap">
                            {row[header] ?? '-'}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <Pagination
                currentPage={attendancePage}
                pageSize={PAGE_SIZE}
                totalItems={filteredAttendanceRows.length}
                onPageChange={setAttendancePage}
              />
            </div>
          </CardContent>
        </Card>}

        <Card>
          <CardHeader>
            <CardTitle>Fees Report Table</CardTitle>
            <CardDescription>Preview of fees report data for selected filter</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <SearchInput
                value={feesSearchTerm}
                onChange={setFeesSearchTerm}
                placeholder="Search fees report"
              />
              <Table>
                <TableHeader>
                  <TableRow>
                    {feesHeaders.map((header) => (
                      <TableHead key={header} className="whitespace-nowrap">
                        {header}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFeesRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={feesHeaders.length} className="text-center text-gray-500">
                        No fees records for selected filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedFeesRows.map((row, index) => (
                      <TableRow key={`${row.Name}-${row.Date}-${index}`}>
                        {feesHeaders.map((header) => (
                          <TableCell key={`${header}-${index}`} className="whitespace-nowrap">
                            {header === 'Paid' || header === 'Balance'
                              ? formatCurrency(Number(row[header] ?? 0))
                              : (row[header] ?? '-')}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <Pagination
                currentPage={feesPage}
                pageSize={PAGE_SIZE}
                totalItems={filteredFeesRows.length}
                onPageChange={setFeesPage}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
