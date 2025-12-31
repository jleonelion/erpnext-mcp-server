/**
 * Bank transaction and import utilities for ERPNext MCP Server
 */

import {
  BankTransaction,
  JournalEntry
} from './types.js';

/**
 * Parse date from various formats to YYYY-MM-DD
 */
export function parseDate(dateStr: string): string {
  // Handle common date formats: M/D/YY, MM/DD/YYYY, YYYY-MM-DD
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Parse amount from string, handling negative values and currency symbols
 */
export function parseAmount(amountStr: string | number): number {
  if (typeof amountStr === 'number') {
    return Math.abs(amountStr);
  }

  // Remove currency symbols, commas, and whitespace
  const cleaned = amountStr.replace(/[$,\s]/g, '');
  const amount = parseFloat(cleaned);

  if (isNaN(amount)) {
    throw new Error(`Invalid amount format: ${amountStr}`);
  }

  return Math.abs(amount);
}

/**
 * Determine if amount is deposit or withdrawal based on sign
 */
export function categorizeAmount(amount: number | string): { deposit: number; withdrawal: number } {
  const numAmount = typeof amount === 'string' ? parseFloat(amount.replace(/[$,\s]/g, '')) : amount;

  if (numAmount >= 0) {
    return { deposit: Math.abs(numAmount), withdrawal: 0 };
  } else {
    return { deposit: 0, withdrawal: Math.abs(numAmount) };
  }
}

/**
 * Create a journal entry for a transaction
 * Utility function to help create properly formatted journal entries
 */
export function createJournalEntryForTransaction(
  transactionType: 'income' | 'expense',
  amount: number,
  incomeOrExpenseAccount: string,
  bankAccount: string,
  date: string,
  company: string,
  description: string
): JournalEntry {
  const accounts: any[] = [];

  if (transactionType === 'income') {
    // Income: Debit Bank, Credit Income Account
    accounts.push({
      account: bankAccount,
      debit_in_account_currency: amount,
      credit_in_account_currency: 0,
      user_remark: description
    });
    accounts.push({
      account: incomeOrExpenseAccount,
      debit_in_account_currency: 0,
      credit_in_account_currency: amount,
      user_remark: description
    });
  } else {
    // Expense: Debit Expense Account, Credit Bank
    accounts.push({
      account: incomeOrExpenseAccount,
      debit_in_account_currency: amount,
      credit_in_account_currency: 0,
      user_remark: description
    });
    accounts.push({
      account: bankAccount,
      debit_in_account_currency: 0,
      credit_in_account_currency: amount,
      user_remark: description
    });
  }

  return {
    doctype: 'Journal Entry',
    voucher_type: 'Journal Entry',
    posting_date: date,
    company: company,
    accounts: accounts,
    user_remark: description
  };
}
