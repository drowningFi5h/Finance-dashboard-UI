"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from "@/components/ui/chart";
import {
  createRecord,
  deleteRecord,
  fetchDashboardSummary,
  fetchMe,
  fetchRecords,
  getFriendlyError,
  isUnauthorizedError,
  login,
  logout,
  revertRecord,
  type RecordsQuery
} from "@/lib/api-client";
import type {
  AuthUser,
  DashboardSummary,
  FinancialRecord,
  RecordStatus,
  RecordType,
  RecordsMeta,
  UserRole
} from "@/types/finance";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis } from "recharts";

const TOKEN_KEY = "finance_app_token";

const emptyMeta: RecordsMeta = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 0
};

const defaultFilters: RecordsQuery = {
  page: 1,
  limit: 10,
  type: "all",
  category: "",
  dateFrom: "",
  dateTo: "",
  status: "all"
};

const demoUsers = {
  admin: { email: "admin@student.local", password: "admin123" },
  analyst: { email: "analyst@student.local", password: "analyst123" },
  viewer: { email: "viewer@student.local", password: "viewer123" }
};

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2
});

function formatAmount(amount: number): string {
  return inrFormatter.format(amount);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}

function roleBadgeVariant(role: UserRole): "default" | "secondary" | "outline" {
  if (role === "admin") {
    return "default";
  }
  if (role === "analyst") {
    return "secondary";
  }
  return "outline";
}

function statusBadgeVariant(status: RecordStatus): "outline" | "secondary" | "destructive" {
  if (status === "active") {
    return "secondary";
  }

  if (status === "reverted") {
    return "outline";
  }

  return "destructive";
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  if (Number.isNaN(date.getTime())) {
    return monthKey;
  }

  return date.toLocaleDateString("en-IN", {
    month: "short",
    year: "2-digit"
  });
}

const monthlyChartConfig = {
  income: {
    label: "Income",
    color: "hsl(142 70% 42%)"
  },
  expenses: {
    label: "Expenses",
    color: "hsl(11 80% 56%)"
  },
  net: {
    label: "Net",
    color: "hsl(221 83% 53%)"
  }
} satisfies ChartConfig;

const categoryChartConfig = {
  net: {
    label: "Net",
    color: "hsl(221 83% 53%)"
  }
} satisfies ChartConfig;

function toCsvValue(value: unknown): string {
  const text = value == null ? "" : String(value);
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

function exportRecordsCsv(records: FinancialRecord[], page: number): void {
  if (records.length === 0) {
    return;
  }

  const headers = ["id", "date", "category", "type", "status", "amount", "notes", "isDeleted"];
  const lines = [headers.join(",")];

  for (const record of records) {
    lines.push(
      [
        toCsvValue(record.id),
        toCsvValue(record.entryDate),
        toCsvValue(record.category),
        toCsvValue(record.type),
        toCsvValue(record.status),
        toCsvValue(record.amount),
        toCsvValue(record.notes ?? ""),
        toCsvValue(record.isDeleted)
      ].join(",")
    );
  }

  const csvContent = lines.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const datePart = new Date().toISOString().slice(0, 10);
  const fileName = `records-${datePart}-page-${page}.csv`;

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function FinanceDashboardApp() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [records, setRecords] = useState<FinancialRecord[]>([]);
  const [meta, setMeta] = useState<RecordsMeta>(emptyMeta);
  const [filters, setFilters] = useState<RecordsQuery>(defaultFilters);

  const [booting, setBooting] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [isCreatingRecord, setIsCreatingRecord] = useState(false);
  const [recordActionId, setRecordActionId] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const [loginForm, setLoginForm] = useState({
    email: demoUsers.admin.email,
    password: demoUsers.admin.password
  });

  const [newRecord, setNewRecord] = useState({
    amount: "",
    type: "expense" as RecordType,
    category: "",
    entryDate: new Date().toISOString().slice(0, 10),
    notes: ""
  });

  const canReadRecords = user?.role === "analyst" || user?.role === "admin";
  const canManageRecords = user?.role === "admin";

  const totals = useMemo(() => {
    return {
      income: summary?.totals.income ?? 0,
      expenses: summary?.totals.expenses ?? 0,
      net: summary?.totals.netBalance ?? 0
    };
  }, [summary]);

  const monthlyChartData = useMemo(() => {
    return (summary?.monthlyTrends ?? []).map((item) => ({
      month: formatMonthLabel(item.month),
      income: item.income,
      expenses: item.expenses,
      net: item.net
    }));
  }, [summary]);

  const categoryChartData = useMemo(() => {
    return [...(summary?.categoryTotals ?? [])]
      .sort((first, second) => Math.abs(second.net) - Math.abs(first.net))
      .slice(0, 8)
      .map((item) => ({
        category: item.category,
        net: item.net
      }));
  }, [summary]);

  function clearSession() {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(TOKEN_KEY);
    }

    setToken(null);
    setUser(null);
    setSummary(null);
    setRecords([]);
    setMeta(emptyMeta);
    setFilters(defaultFilters);
  }

  async function handleUnauthorized(error: unknown): Promise<boolean> {
    if (!isUnauthorizedError(error)) {
      return false;
    }

    clearSession();
    setErrorMessage("Session expired or timed out. Please login again.");
    setInfoMessage(null);
    return true;
  }

  async function loadSummary(currentToken: string) {
    try {
      setIsLoadingSummary(true);
      const summaryData = await fetchDashboardSummary(currentToken);
      setSummary(summaryData);
    } catch (error) {
      const wasUnauthorized = await handleUnauthorized(error);
      if (!wasUnauthorized) {
        setErrorMessage(getFriendlyError(error));
      }
    } finally {
      setIsLoadingSummary(false);
    }
  }

  async function loadRecords(currentToken: string, query: RecordsQuery) {
    try {
      setIsLoadingRecords(true);
      const payload = await fetchRecords(currentToken, query);
      setRecords(payload.data);
      setMeta(payload.meta);
    } catch (error) {
      const wasUnauthorized = await handleUnauthorized(error);
      if (!wasUnauthorized) {
        setErrorMessage(getFriendlyError(error));
      }
    } finally {
      setIsLoadingRecords(false);
    }
  }

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const savedToken = window.sessionStorage.getItem(TOKEN_KEY);
      if (!savedToken) {
        if (active) {
          setBooting(false);
        }
        return;
      }

      try {
        const me = await fetchMe(savedToken);
        if (!active) {
          return;
        }

        setToken(savedToken);
        setUser(me);
        setInfoMessage(`Welcome back, ${me.name}.`);

        const summaryData = await fetchDashboardSummary(savedToken);
        if (!active) {
          return;
        }

        setSummary(summaryData);

        if (me.role !== "viewer") {
          const payload = await fetchRecords(savedToken, defaultFilters);
          if (!active) {
            return;
          }

          setRecords(payload.data);
          setMeta(payload.meta);
        }
      } catch (error) {
        if (!active) {
          return;
        }

        window.sessionStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
        setSummary(null);
        setRecords([]);
        setMeta(emptyMeta);
        setFilters(defaultFilters);
        setErrorMessage(getFriendlyError(error));
      } finally {
        if (active) {
          setBooting(false);
        }
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  async function onLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsLoggingIn(true);
      setErrorMessage(null);
      setInfoMessage(null);

      const payload = await login(loginForm.email, loginForm.password);
      window.sessionStorage.setItem(TOKEN_KEY, payload.token);
      setToken(payload.token);
      setUser(payload.user);
      setFilters(defaultFilters);
      setInfoMessage(`Logged in as ${payload.user.role}.`);

      await loadSummary(payload.token);
      if (payload.user.role !== "viewer") {
        await loadRecords(payload.token, defaultFilters);
      } else {
        setRecords([]);
        setMeta(emptyMeta);
      }
    } catch (error) {
      setErrorMessage(getFriendlyError(error));
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function onLogoutClick() {
    if (token) {
      try {
        await logout(token);
      } catch {
        // ignore logout failure because session may already be expired
      }
    }

    clearSession();
    setInfoMessage("Logged out.");
    setErrorMessage(null);
  }

  async function applyFilters() {
    if (!token) {
      return;
    }

    const nextQuery = { ...filters, page: 1 };
    setFilters(nextQuery);
    await loadRecords(token, nextQuery);
  }

  async function goToPage(nextPage: number) {
    if (!token || nextPage < 1) {
      return;
    }

    const nextQuery = { ...filters, page: nextPage };
    setFilters(nextQuery);
    await loadRecords(token, nextQuery);
  }

  async function onCreateRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !canManageRecords) {
      return;
    }

    const amount = Number(newRecord.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage("Amount must be a positive number.");
      return;
    }

    try {
      setIsCreatingRecord(true);
      setErrorMessage(null);

      await createRecord(token, {
        amount,
        type: newRecord.type,
        category: newRecord.category.trim(),
        entryDate: newRecord.entryDate,
        notes: newRecord.notes.trim() || undefined
      });

      setInfoMessage("Record created.");
      setNewRecord((previous) => ({
        ...previous,
        amount: "",
        category: "",
        notes: ""
      }));

      await loadSummary(token);
      await loadRecords(token, filters);
    } catch (error) {
      const wasUnauthorized = await handleUnauthorized(error);
      if (!wasUnauthorized) {
        setErrorMessage(getFriendlyError(error));
      }
    } finally {
      setIsCreatingRecord(false);
    }
  }

  async function onRevertRecord(recordId: string) {
    if (!token || !canManageRecords) {
      return;
    }

    const reason = window.prompt("Optional revert reason (leave blank to skip):") ?? "";

    try {
      setRecordActionId(recordId);
      setErrorMessage(null);

      await revertRecord(token, recordId, reason.trim() || undefined);
      setInfoMessage("Record reverted. A reversal entry is created automatically.");

      await loadSummary(token);
      await loadRecords(token, filters);
    } catch (error) {
      const wasUnauthorized = await handleUnauthorized(error);
      if (!wasUnauthorized) {
        setErrorMessage(getFriendlyError(error));
      }
    } finally {
      setRecordActionId(null);
    }
  }

  async function onDeleteRecord(recordId: string) {
    if (!token || !canManageRecords) {
      return;
    }

    const ok = window.confirm("Soft delete this record?");
    if (!ok) {
      return;
    }

    try {
      setRecordActionId(recordId);
      setErrorMessage(null);

      await deleteRecord(token, recordId);
      setInfoMessage("Record soft deleted.");

      await loadSummary(token);
      await loadRecords(token, filters);
    } catch (error) {
      const wasUnauthorized = await handleUnauthorized(error);
      if (!wasUnauthorized) {
        setErrorMessage(getFriendlyError(error));
      }
    } finally {
      setRecordActionId(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-8 md:px-8 md:py-10">
      <header className="flex flex-col justify-between gap-4 rounded-xl border border-border/70 bg-card/90 p-4 md:flex-row md:items-center">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Finance Assignment DashBoard</h1>
        </div>
        {user ? (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium leading-tight">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
            <Badge variant={roleBadgeVariant(user.role)}>{user.role}</Badge>
            <Button variant="outline" onClick={onLogoutClick}>
              Logout
            </Button>
          </div>
        ) : null}
      </header>

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Something failed</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {infoMessage ? (
        <Alert>
          <AlertTitle>Info</AlertTitle>
          <AlertDescription>{infoMessage}</AlertDescription>
        </Alert>
      ) : null}

      {booting ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">Checking saved session...</CardContent>
        </Card>
      ) : null}

      {!booting && !user ? (
        <Card className="mx-auto w-full max-w-md">
          <CardHeader>
            <CardTitle>Login</CardTitle>
            <CardDescription>
              Use seeded users and token is stored in session storage (tab close clears it).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onLoginSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={loginForm.email}
                  onChange={(event) =>
                    setLoginForm((previous) => ({
                      ...previous,
                      email: event.target.value
                    }))
                  }
                  placeholder="admin@student.local"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm((previous) => ({
                      ...previous,
                      password: event.target.value
                    }))
                  }
                  placeholder="admin123"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoggingIn}>
                {isLoggingIn ? "Signing in..." : "Sign in"}
              </Button>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => setLoginForm(demoUsers.admin)}
                >
                  Use admin demo
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => setLoginForm(demoUsers.analyst)}
                >
                  Use analyst demo
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => setLoginForm(demoUsers.viewer)}
                >
                  Use viewer demo
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {user ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardDescription>Total Income</CardDescription>
                <CardTitle>{isLoadingSummary ? "..." : formatAmount(totals.income)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Total Expenses</CardDescription>
                <CardTitle>{isLoadingSummary ? "..." : formatAmount(totals.expenses)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Net Balance</CardDescription>
                <CardTitle>{isLoadingSummary ? "..." : formatAmount(totals.net)}</CardTitle>
              </CardHeader>
            </Card>
          </section>

          {canManageRecords ? (
            <Card>
              <CardHeader>
                <CardTitle>Add New Record</CardTitle>
                <CardDescription>Admin only action.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 md:grid-cols-2" onSubmit={onCreateRecord}>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount</Label>
                    <Input
                      id="amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={newRecord.amount}
                      onChange={(event) =>
                        setNewRecord((previous) => ({
                          ...previous,
                          amount: event.target.value
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select
                      value={newRecord.type}
                      onValueChange={(value) =>
                        setNewRecord((previous) => ({
                          ...previous,
                          type: value as RecordType
                        }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="income">Income</SelectItem>
                        <SelectItem value="expense">Expense</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Input
                      id="category"
                      value={newRecord.category}
                      onChange={(event) =>
                        setNewRecord((previous) => ({
                          ...previous,
                          category: event.target.value
                        }))
                      }
                      placeholder="Food, Salary, Rent..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="entryDate">Entry Date</Label>
                    <Input
                      id="entryDate"
                      type="date"
                      value={newRecord.entryDate}
                      onChange={(event) =>
                        setNewRecord((previous) => ({
                          ...previous,
                          entryDate: event.target.value
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={newRecord.notes}
                      onChange={(event) =>
                        setNewRecord((previous) => ({
                          ...previous,
                          notes: event.target.value
                        }))
                      }
                      placeholder="Optional note"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Button type="submit" disabled={isCreatingRecord}>
                      {isCreatingRecord ? "Saving..." : "Create record"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {canReadRecords ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Analyst Insights</CardTitle>
                  <CardDescription>Quick visual insights for monthly and category trends.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-lg border border-border/70 p-3">
                    <p className="mb-2 text-sm font-medium">Income vs expenses by month</p>
                    {monthlyChartData.length ? (
                      <ChartContainer config={monthlyChartConfig} className="h-64 w-full">
                        <BarChart data={monthlyChartData} margin={{ top: 8, right: 10, left: 10, bottom: 0 }}>
                          <CartesianGrid vertical={false} />
                          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <ChartLegend content={<ChartLegendContent />} />
                          <Bar dataKey="income" fill="var(--color-income)" radius={4} />
                          <Bar dataKey="expenses" fill="var(--color-expenses)" radius={4} />
                        </BarChart>
                      </ChartContainer>
                    ) : (
                      <p className="py-12 text-center text-sm text-muted-foreground">
                        Add some records to see monthly chart.
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg border border-border/70 p-3">
                    <p className="mb-2 text-sm font-medium">Net trend by month</p>
                    {monthlyChartData.length ? (
                      <ChartContainer config={monthlyChartConfig} className="h-64 w-full">
                        <LineChart data={monthlyChartData} margin={{ top: 8, right: 10, left: 10, bottom: 0 }}>
                          <CartesianGrid vertical={false} />
                          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Line
                            type="monotone"
                            dataKey="net"
                            stroke="var(--color-net)"
                            strokeWidth={2.5}
                            dot={false}
                          />
                        </LineChart>
                      </ChartContainer>
                    ) : (
                      <p className="py-12 text-center text-sm text-muted-foreground">
                        Net trend appears when monthly data is available.
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg border border-border/70 p-3 xl:col-span-2">
                    <p className="mb-2 text-sm font-medium">Top categories by net movement</p>
                    {categoryChartData.length ? (
                      <ChartContainer config={categoryChartConfig} className="h-72 w-full">
                        <BarChart data={categoryChartData} margin={{ top: 8, right: 10, left: 10, bottom: 0 }}>
                          <CartesianGrid vertical={false} />
                          <XAxis
                            dataKey="category"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            tickFormatter={(value) =>
                              String(value).length > 12 ? `${String(value).slice(0, 12)}...` : String(value)
                            }
                          />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="net" fill="var(--color-net)" radius={6} />
                        </BarChart>
                      </ChartContainer>
                    ) : (
                      <p className="py-12 text-center text-sm text-muted-foreground">
                        Category insights appear after adding records.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Filters</CardTitle>
                  <CardDescription>Use filters then click Apply.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select
                      value={filters.type}
                      onValueChange={(value) =>
                        setFilters((previous) => ({
                          ...previous,
                          type: value as "all" | RecordType
                        }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Any type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="income">Income</SelectItem>
                        <SelectItem value="expense">Expense</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={filters.status}
                      onValueChange={(value) =>
                        setFilters((previous) => ({
                          ...previous,
                          status: value as "all" | RecordStatus
                        }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Any status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="reverted">Reverted</SelectItem>
                        <SelectItem value="reversal">Reversal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="categoryFilter">Category</Label>
                    <Input
                      id="categoryFilter"
                      placeholder="eg. food"
                      value={filters.category}
                      onChange={(event) =>
                        setFilters((previous) => ({
                          ...previous,
                          category: event.target.value
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dateFrom">Date from</Label>
                    <Input
                      id="dateFrom"
                      type="date"
                      value={filters.dateFrom}
                      onChange={(event) =>
                        setFilters((previous) => ({
                          ...previous,
                          dateFrom: event.target.value
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dateTo">Date to</Label>
                    <Input
                      id="dateTo"
                      type="date"
                      value={filters.dateTo}
                      onChange={(event) =>
                        setFilters((previous) => ({
                          ...previous,
                          dateTo: event.target.value
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Limit</Label>
                    <Select
                      value={String(filters.limit)}
                      onValueChange={(value) =>
                        setFilters((previous) => ({
                          ...previous,
                          limit: Number(value)
                        }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Limit" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2 md:col-span-3 lg:col-span-6">
                    <Button onClick={applyFilters} disabled={isLoadingRecords}>
                      {isLoadingRecords ? "Loading..." : "Apply filters"}
                    </Button>
                    {(user?.role === "analyst" || user?.role === "admin") && (
                      <Button
                        variant="secondary"
                        disabled={records.length === 0}
                        onClick={() => exportRecordsCsv(records, meta.page)}
                      >
                        Download CSV
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={async () => {
                        setFilters(defaultFilters);
                        if (token) {
                          await loadRecords(token, defaultFilters);
                        }
                      }}
                    >
                      Reset
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Records</CardTitle>
                  <CardDescription>
                    {meta.total} records found. Page {meta.page} of {meta.totalPages || 1}.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Notes</TableHead>
                        {canManageRecords ? <TableHead>Actions</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={canManageRecords ? 7 : 6} className="text-center text-muted-foreground">
                            No records for selected filters.
                          </TableCell>
                        </TableRow>
                      ) : (
                        records.map((record) => (
                          <TableRow key={record.id}>
                            <TableCell>{formatDate(record.entryDate)}</TableCell>
                            <TableCell>{record.category}</TableCell>
                            <TableCell>
                              <Badge variant={record.type === "income" ? "default" : "destructive"}>
                                {record.type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusBadgeVariant(record.status)}>{record.status}</Badge>
                            </TableCell>
                            <TableCell>{formatAmount(record.amount)}</TableCell>
                            <TableCell className="max-w-56 truncate">{record.notes || "-"}</TableCell>
                            {canManageRecords ? (
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="xs"
                                    disabled={
                                      recordActionId === record.id ||
                                      record.status !== "active" ||
                                      record.isDeleted
                                    }
                                    onClick={() => onRevertRecord(record.id)}
                                  >
                                    Revert
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="xs"
                                    disabled={
                                      recordActionId === record.id ||
                                      record.status !== "active" ||
                                      record.isDeleted
                                    }
                                    onClick={() => onDeleteRecord(record.id)}
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </TableCell>
                            ) : null}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <Button
                      variant="outline"
                      disabled={meta.page <= 1 || isLoadingRecords}
                      onClick={() => goToPage(meta.page - 1)}
                    >
                      Previous
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Page {meta.page} / {meta.totalPages || 1}
                    </p>
                    <Button
                      variant="outline"
                      disabled={meta.page >= meta.totalPages || meta.totalPages === 0 || isLoadingRecords}
                      onClick={() => goToPage(meta.page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Viewer mode</CardTitle>
                <CardDescription>
                  As viewer, you only get dashboard summary access. Records endpoints are blocked by backend.
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>From dashboard summary API.</CardDescription>
            </CardHeader>
            <CardContent>
              {summary?.recentActivity.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.recentActivity.map((activity) => (
                      <TableRow key={activity.id}>
                        <TableCell>{formatDate(activity.entryDate)}</TableCell>
                        <TableCell>{activity.category}</TableCell>
                        <TableCell>{activity.type}</TableCell>
                        <TableCell>{activity.status}</TableCell>
                        <TableCell>{formatAmount(activity.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No recent activity yet.</p>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </main>
  );
}
