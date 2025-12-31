/**
 * Type definitions for ERPNext MCP Server
 */

// Bank Transaction Types
export interface BankTransaction {
  name?: string;
  date: string;
  deposit?: number;
  withdrawal?: number;
  description: string;
  reference_number?: string;
  transaction_id?: string;
  bank_account: string;
  company?: string;
  currency?: string;
  status?: 'Unreconciled' | 'Reconciled' | 'Settled' | 'Pending' | 'Cancelled';
  bank_party_name?: string;
  bank_party_account_number?: string;
  bank_party_iban?: string;
}

export interface BankAccount {
  name: string;
  account_name: string;
  account: string; // GL Account link
  bank: string;
  is_company_account: number;
  company: string;
  bank_account_no?: string;
  iban?: string;
  branch_code?: string;
  is_default?: number;
  disabled?: number;
}

// Journal Entry Types
export interface JournalEntryAccount {
  account: string;
  debit_in_account_currency?: number;
  credit_in_account_currency?: number;
  user_remark?: string;
  reference_type?: string;
  reference_name?: string;
}

export interface JournalEntry {
  doctype: 'Journal Entry';
  voucher_type?: string;
  posting_date: string;
  company: string;
  accounts: JournalEntryAccount[];
  user_remark?: string;
  cheque_no?: string;
  cheque_date?: string;
}

export interface JournalEntryValidation {
  is_valid: boolean;
  total_debit: number;
  total_credit: number;
  difference: number;
  errors: string[];
  warnings: string[];
}

// Account Types
export interface Account {
  name: string;
  account_name: string;
  account_number?: string;
  account_type?: string;
  root_type?: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
  is_group: number;
  parent_account?: string;
  company: string;
}

// Bank Import Types
export interface BankImportColumn {
  field_name: string;
  column_index: number;
}

export interface BankImportMapping {
  date: BankImportColumn;
  deposit?: BankImportColumn;
  withdrawal?: BankImportColumn;
  description: BankImportColumn;
  reference?: BankImportColumn;
}

export interface BankImportResult {
  success_count: number;
  error_count: number;
  created_transactions: string[];
  errors: Array<{
    row_index: number;
    error: string;
    data: any;
  }>;
}
