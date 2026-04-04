export type UserRole = "viewer" | "analyst" | "admin";
export type UserStatus = "active" | "inactive";
export type RecordType = "income" | "expense";
export type RecordStatus = "active" | "reverted" | "reversal";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
};

export type LoginPayload = {
  token: string;
  expiresAt: string;
  user: AuthUser;
};

export type DashboardSummary = {
  totals: {
    income: number;
    expenses: number;
    netBalance: number;
  };
  categoryTotals: Array<{
    category: string;
    income: number;
    expenses: number;
    net: number;
  }>;
  monthlyTrends: Array<{
    month: string;
    income: number;
    expenses: number;
    net: number;
  }>;
  recentActivity: Array<{
    id: string;
    amount: number;
    type: RecordType;
    category: string;
    entryDate: string;
    notes: string | null;
    status: RecordStatus;
    createdAt: string;
  }>;
};

export type FinancialRecord = {
  id: string;
  amount: number;
  type: RecordType;
  category: string;
  entryDate: string;
  notes: string | null;
  status: RecordStatus;
  reversalOf: string | null;
  createdBy: string;
  updatedBy: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedBy: string | null;
  revertedAt: string | null;
  revertedBy: string | null;
  revertReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecordsMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
