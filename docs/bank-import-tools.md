# Bank Import and Journal Entry Tools

This document describes the bank import and journal entry creation tools added to the ERPNext MCP Server.

## Overview

These tools enable:
1. **Batch importing bank transactions** from CSV/Excel files
2. **Searching bank transactions** with flexible filters for reconciliation
3. **Creating and validating journal entries** with automatic debit/credit balancing
4. **Managing bank accounts** across companies

## New Tools

### 1. `get_bank_accounts`

Get a list of bank accounts configured in ERPNext.

**Parameters:**
- `company` (optional): Filter by company name

**Example:**
```json
{
  "company": "Personal"
}
```

**Returns:**
Array of bank accounts with details including account name, GL account link, bank, account number, IBAN, etc.

---

### 2. `search_bank_transactions`

Search for bank transactions with flexible filtering - essential for reconciliation and transaction matching.

**Parameters:**
- `bank_account` (optional): Bank account name
- `company` (optional): Company name
- `status` (optional): "Unreconciled", "Reconciled", "Settled", "Pending"
- `from_date` (optional): Start date (YYYY-MM-DD)
- `to_date` (optional): End date (YYYY-MM-DD)
- `min_amount` (optional): Minimum transaction amount
- `max_amount` (optional): Maximum transaction amount

**Example - Find unreconciled transactions in a date range:**
```json
{
  "company": "Personal",
  "status": "Unreconciled",
  "from_date": "2025-02-01",
  "to_date": "2025-02-28",
  "min_amount": 100.00,
  "max_amount": 1000.00
}
```

**Returns:**
Array of matching bank transactions with deposit/withdrawal amounts, dates, descriptions, and status.

---

### 3. `batch_import_bank_transactions`

Batch import bank transactions using ERPNext's native `create_bank_entries` API.

**Parameters:**
- `columns` (required): Array of column headers from CSV
- `data` (required): Array of data rows
- `bank_account` (required): Bank account name to associate transactions with

**Example - Import transactions from bank statement:**
```json
{
  "columns": ["Date", "Deposits", "Withdrawals", "Description"],
  "data": [
    ["2/28/25", "1500.00", "", "Salary Deposit"],
    ["2/15/25", "", "250.00", "Utility Payment"],
    ["2/10/25", "", "45.50", "Grocery Store"]
  ],
  "bank_account": "Primary Checking - Main Bank"
}
```

**Returns:**
Result object with success/error counts and details about created transactions.

**Notes:**
- ERPNext will auto-submit the bank transactions
- This uses the same backend API as ERPNext's UI bank import feature
- Errors are logged per-row but don't stop the entire import

---

### 4. `validate_journal_entry`

Validate a journal entry before creation - checks that debits equal credits and all required fields are present.

**Parameters:**
- `journal_entry` (required): Journal entry object

**Example:**
```json
{
  "journal_entry": {
    "doctype": "Journal Entry",
    "posting_date": "2025-02-28",
    "company": "Personal",
    "accounts": [
      {
        "account": "1111 - Checking - Personal",
        "debit_in_account_currency": 1500.00,
        "credit_in_account_currency": 0
      },
      {
        "account": "4100 - Salary Income - Personal",
        "debit_in_account_currency": 0,
        "credit_in_account_currency": 1500.00
      }
    ],
    "user_remark": "Monthly Salary"
  }
}
```

**Returns:**
Validation summary with:
- `is_valid`: true/false
- `total_debit`: Sum of all debits
- `total_credit`: Sum of all credits
- `difference`: Debit - Credit (should be 0)
- `errors`: Array of error messages
- `warnings`: Array of warnings

**Common Validations:**
- Posting date is required
- Company is required
- At least 2 account entries required
- Each entry must have an account name
- Debits must equal credits (within 0.01 tolerance)
- Each line should have either debit OR credit, not both

---

### 5. `create_journal_entry`

Create a journal entry with optional validation and submission.

**Parameters:**
- `journal_entry` (required): Journal entry object
- `skip_validation` (optional): Skip validation if already validated (default: false)
- `submit` (optional): Auto-submit after creation (default: false)

**Example - Create and submit:**
```json
{
  "journal_entry": {
    "doctype": "Journal Entry",
    "posting_date": "2025-02-15",
    "company": "Personal",
    "accounts": [
      {
        "account": "5200 - Utilities - Personal",
        "debit_in_account_currency": 250.00,
        "credit_in_account_currency": 0
      },
      {
        "account": "1111 - Checking - Personal",
        "debit_in_account_currency": 0,
        "credit_in_account_currency": 250.00
      }
    ],
    "user_remark": "Monthly utility payment"
  },
  "submit": true
}
```

**Returns:**
Created journal entry with name (e.g., "JV-2025-00001") and full document details.

**Workflow:**
1. Validates entry (unless `skip_validation: true`)
2. Creates draft journal entry in ERPNext
3. Optionally submits (posts) the entry if `submit: true`
4. Returns the created document

---

### 6. `submit_journal_entry`

Submit (post) a draft journal entry.

**Parameters:**
- `journal_entry_name` (required): Name/ID of the journal entry (e.g., "JV-2025-00001")

**Example:**
```json
{
  "journal_entry_name": "JV-2025-00001"
}
```

**Returns:**
Confirmation of submission.

**Note:** Once submitted, journal entries cannot be edited - only cancelled and recreated.

## Integration with ERPNext API

These tools use ERPNext's native APIs:

1. **Bank Transaction Import:**
   - API: `erpnext.accounts.doctype.bank_transaction.bank_transaction_upload.create_bank_entries`
   - Same backend as UI import feature
   - Auto-submits transactions

2. **Journal Entry Creation:**
   - API: Standard document creation (`/api/resource/Journal Entry`)
   - Validation done client-side before submission
   - Submit via `frappe.client.submit`

3. **Bank Transaction Search:**
   - API: Standard document listing (`/api/resource/Bank Transaction`)
   - Client-side amount filtering for precise ranges
   - Date range filtering via Frappe query syntax

## Best Practices

1. **Always validate** journal entries before creation
2. **Search with date tolerance** (±3 days) for bank matching
3. **Check status = "Unreconciled"** when matching EveryDollar entries
4. **Use exact account names** including company suffix
5. **Round amounts** to 2 decimal places to avoid floating-point issues
6. **Review discrepancies** before batch creation
7. **Test with draft entries** before submitting

## Future Enhancements

Potential additions for enhanced functionality:

1. **CSV Parser Tool:** Direct CSV upload and parsing
2. **Account Matching:** Automated account suggestion based on transaction descriptions
3. **Reconciliation Report:** Advanced reconciliation reporting
4. **Batch Journal Entry Validation:** Validate multiple entries at once
5. **Transaction Rules:** Define rules for automatic journal entry creation
6. **Bank Statement Templates:** Support for common bank statement formats

## References

- [ERPNext API Documentation](https://docs.erpnext.com/docs/user/en/api)
- [Journal Entry DocType](https://docs.erpnext.com/docs/user/manual/en/accounts/journal-entry)
- [Bank Transaction DocType](https://docs.erpnext.com/docs/user/manual/en/accounts/bank-transaction)
- [Frappe Framework API](https://frappeframework.com/docs/user/en/api)
