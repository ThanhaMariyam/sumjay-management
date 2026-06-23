import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import {
  endOfDay,
  endOfMonth,
  endOfYear,
  format,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfYear,
} from 'date-fns';
import { Edit, Plus, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { db, handleFirestoreError } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { useExpenses, useFees, useStudents } from '../lib/hooks';
import { Expense, Fee } from '../types';

type FilterType = 'day' | 'month' | 'year';
type EntryType = 'income' | 'expense';

const EXPENSE_CATEGORIES = ['Travel', 'Purchase', 'Equipment', 'Ground', 'Refreshment', 'Medical', 'Other'];
const INCOME_CATEGORIES = ['Sponsor', 'Programme', 'Donation', 'Match Day', 'Other'];

function getDateRange(filterType: FilterType) {
  const now = new Date();
  if (filterType === 'day') return { start: startOfDay(now), end: endOfDay(now) };
  if (filterType === 'month') return { start: startOfMonth(now), end: endOfMonth(now) };
  return { start: startOfYear(now), end: endOfYear(now) };
}

function isInRange(date: Date, start: Date, end: Date) {
  const value = date.getTime();
  return value >= start.getTime() && value <= end.getTime();
}

function getFeePaidDate(fee: Fee) {
  if (fee.paidOn) {
    const paidOnDate = parseISO(fee.paidOn);
    if (isValid(paidOnDate)) return paidOnDate;
  }
  if (typeof fee.paidAt === 'number') {
    const paidAtDate = new Date(fee.paidAt);
    if (isValid(paidAtDate)) return paidAtDate;
  }
  if (typeof fee.updatedAt === 'number') {
    const updatedDate = new Date(fee.updatedAt);
    if (isValid(updatedDate)) return updatedDate;
  }
  return null;
}

function getEntryDate(entry: Expense) {
  const spentOnDate = parseISO(entry.spentOn);
  if (isValid(spentOnDate)) return spentOnDate;
  if (typeof entry.createdAt === 'number') {
    const createdDate = new Date(entry.createdAt);
    if (isValid(createdDate)) return createdDate;
  }
  return null;
}

function getEntryType(entry: Expense): EntryType {
  return entry.type === 'income' ? 'income' : 'expense';
}

export default function Expenses() {
  const { user, isMembershipAdmin } = useAuth();
  const { students, loading: studentsLoading } = useStudents(isMembershipAdmin ? 'members' : 'students');
  const { fees, loading: feesLoading } = useFees();
  const { expenses, loading: entriesLoading } = useExpenses();
  const [filterType, setFilterType] = useState<FilterType>('month');
  const [entryType, setEntryType] = useState<EntryType>('expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [spentOn, setSpentOn] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [editingEntry, setEditingEntry] = useState<Expense | null>(null);
  const [saving, setSaving] = useState(false);

  const { start, end } = useMemo(() => getDateRange(filterType), [filterType]);
  const activeCategories = entryType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const periodEntries = useMemo(() => {
    return expenses.filter((entry) => {
      const date = getEntryDate(entry);
      return date ? isInRange(date, start, end) : false;
    });
  }, [expenses, start, end]);

  const feeOwnerIds = useMemo(() => {
    return new Set(students.map((student) => student.id).filter(Boolean));
  }, [students]);

  const feeIncome = useMemo(() => {
    return fees.reduce((sum, fee) => {
      if (fee.status !== 'paid') return sum;
      if (!feeOwnerIds.has(fee.studentId)) return sum;
      const paidDate = getFeePaidDate(fee);
      if (!paidDate || !isInRange(paidDate, start, end)) return sum;
      const paidAmount = typeof fee.paidAmount === 'number' && fee.paidAmount >= 0
        ? fee.paidAmount
        : (typeof fee.amount === 'number' && fee.amount >= 0 ? fee.amount : 0);
      return sum + paidAmount;
    }, 0);
  }, [fees, feeOwnerIds, start, end]);

  const manualIncome = useMemo(() => {
    return periodEntries
      .filter((entry) => getEntryType(entry) === 'income')
      .reduce((sum, entry) => sum + entry.amount, 0);
  }, [periodEntries]);

  const manualIncomeByCategory = useMemo(() => {
    return periodEntries
      .filter((entry) => getEntryType(entry) === 'income')
      .reduce((acc, entry) => {
        acc[entry.category] = (acc[entry.category] ?? 0) + entry.amount;
        return acc;
      }, {} as Record<string, number>);
  }, [periodEntries]);

  const totalExpense = useMemo(() => {
    return periodEntries
      .filter((entry) => getEntryType(entry) === 'expense')
      .reduce((sum, entry) => sum + entry.amount, 0);
  }, [periodEntries]);

  const categoryTotals = useMemo(() => {
    return periodEntries.reduce((acc, entry) => {
      const key = `${getEntryType(entry) === 'income' ? 'Income' : 'Expense'} - ${entry.category}`;
      acc[key] = (acc[key] ?? 0) + entry.amount;
      return acc;
    }, {} as Record<string, number>);
  }, [periodEntries]);

  const totalIncome = feeIncome + manualIncome;
  const incomeSources = useMemo(() => {
    return [
      {
        label: isMembershipAdmin ? 'Members Fund' : 'Student Fees',
        amount: feeIncome,
      },
      ...(Object.entries(manualIncomeByCategory) as Array<[string, number]>).map(([label, amount]) => ({
        label,
        amount,
      })),
    ];
  }, [feeIncome, manualIncomeByCategory, isMembershipAdmin]);

  const formatAmount = (value: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(value);

  const resetForm = () => {
    setEntryType('expense');
    setAmount('');
    setNote('');
    setCategory(EXPENSE_CATEGORIES[0]);
    setSpentOn(format(new Date(), 'yyyy-MM-dd'));
    setEditingEntry(null);
  };

  const handleEntryTypeChange = (value: EntryType) => {
    setEntryType(value);
    setCategory(value === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
  };

  const openEdit = (entry: Expense) => {
    const nextType = getEntryType(entry);
    setEditingEntry(entry);
    setEntryType(nextType);
    setAmount(String(entry.amount));
    setNote(entry.note);
    setCategory(entry.category || (nextType === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]));
    setSpentOn(entry.spentOn);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error(`Please enter an ${entryType} amount greater than 0.`);
      return;
    }
    if (!note.trim()) {
      toast.error(`Please add a note for this ${entryType}.`);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        adminId: editingEntry?.adminId ?? user.adminId,
        type: entryType,
        amount: Math.round(parsedAmount * 100) / 100,
        note: note.trim(),
        category,
        spentOn,
        createdAt: editingEntry?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      } satisfies Omit<Expense, 'id'>;

      if (editingEntry?.id) {
        await updateDoc(doc(db, 'expenses', editingEntry.id), payload);
        toast.success(`${entryType === 'income' ? 'Income' : 'Expense'} updated.`);
      } else {
        await addDoc(collection(db, 'expenses'), payload);
        toast.success(`${entryType === 'income' ? 'Income' : 'Expense'} added.`);
      }
      resetForm();
    } catch (error) {
      toast.error(`Failed to save ${entryType}. Please check Firestore rules and try again.`);
      try {
        handleFirestoreError(error, 'write' as any, 'expenses');
      } catch (loggedError) {
        console.error(loggedError);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry: Expense) => {
    if (!entry.id || !confirm(`Delete this ${getEntryType(entry)}?`)) return;
    try {
      await deleteDoc(doc(db, 'expenses', entry.id));
      if (editingEntry?.id === entry.id) resetForm();
      toast.success(`${getEntryType(entry) === 'income' ? 'Income' : 'Expense'} deleted.`);
    } catch (error) {
      toast.error(`Failed to delete ${getEntryType(entry)}.`);
      try {
        handleFirestoreError(error, 'delete' as any, `expenses/${entry.id}`);
      } catch (loggedError) {
        console.error(loggedError);
      }
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">Expenses</h1>
          <p className="text-gray-500">Track club spending and extra income against {isMembershipAdmin ? 'fund' : 'fee'} income.</p>
        </div>
        <Select value={filterType} onValueChange={(value) => setFilterType(value as FilterType)}>
          <SelectTrigger className="w-full bg-white md:w-44">
            <SelectValue placeholder="Filter period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Today</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Amount Got</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{feesLoading || studentsLoading ? '...' : formatAmount(totalIncome)}</div>
            <p className="text-xs text-muted-foreground">
              {formatAmount(feeIncome)} {isMembershipAdmin ? 'members fund' : 'student fees'} + {formatAmount(manualIncome)} other income
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">{entriesLoading ? '...' : formatAmount(totalExpense)}</div>
            <p className="text-xs text-muted-foreground">Total spending</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Balance</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalIncome - totalExpense >= 0 ? 'text-primary' : 'text-red-700'}`}>
              {feesLoading || entriesLoading ? '...' : formatAmount(totalIncome - totalExpense)}
            </div>
            <p className="text-xs text-muted-foreground">Income minus expenses</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{editingEntry ? `Edit ${entryType === 'income' ? 'Income' : 'Expense'}` : `Add ${entryType === 'income' ? 'Income' : 'Expense'}`}</CardTitle>
            <CardDescription>Record sponsor money, programme income, travel, purchase, and other club entries.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={entryType} onValueChange={(value) => handleEntryTypeChange(value as EntryType)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input type="number" min={0} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Enter amount" />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeCategories.map((item) => (
                      <SelectItem key={item} value={item}>{item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={spentOn} onChange={(event) => setSpentOn(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Note</Label>
                <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Short note" />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button type="submit" className="gap-2" disabled={saving}>
                  <Plus className="h-4 w-4" />
                  {saving ? 'Saving...' : editingEntry ? 'Update' : 'Add'}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Clear
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Income Source Breakdown</CardTitle>
              <CardDescription>Amount received by source for the selected period.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {incomeSources.map((source) => (
                  <div key={source.label} className="rounded-md border bg-green-50/60 p-3">
                    <p className="text-sm font-medium text-gray-700">{source.label}</p>
                    <p className="text-lg font-semibold text-green-700">{formatAmount(source.amount)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Category Summary</CardTitle>
              <CardDescription>Income and spending grouped for the selected period.</CardDescription>
            </CardHeader>
            <CardContent>
              {Object.keys(categoryTotals).length === 0 ? (
                <p className="text-sm text-gray-500">No manual entries for this period.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(Object.entries(categoryTotals) as Array<[string, number]>).map(([item, value]) => (
                    <div key={item} className="rounded-md border bg-gray-50 p-3">
                      <p className="text-sm font-medium text-gray-700">{item}</p>
                      <p className={`text-lg font-semibold ${item.startsWith('Income') ? 'text-green-700' : 'text-red-700'}`}>{formatAmount(value)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Finance History</CardTitle>
              <CardDescription>Manual income and expense entries for the selected period.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entriesLoading ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
                    ) : periodEntries.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-gray-500 py-8">No manual entries for this period.</TableCell></TableRow>
                    ) : (
                      periodEntries.map((entry) => {
                        const type = getEntryType(entry);
                        return (
                          <TableRow key={entry.id}>
                            <TableCell className="whitespace-nowrap">{entry.spentOn}</TableCell>
                            <TableCell className={type === 'income' ? 'font-medium text-green-700' : 'font-medium text-red-700'}>
                              {type === 'income' ? 'Income' : 'Expense'}
                            </TableCell>
                            <TableCell>{entry.category}</TableCell>
                            <TableCell className="max-w-[220px] break-words">{entry.note}</TableCell>
                            <TableCell className={type === 'income' ? 'font-medium text-green-700' : 'font-medium text-red-700'}>{formatAmount(entry.amount)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(entry)}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                  onClick={() => handleDelete(entry)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
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
      </div>
    </div>
  );
}
