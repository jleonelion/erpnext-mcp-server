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

---

### 7. `batch_create_journal_entries`

Batch create multiple journal entries with validation and error handling. This tool is ideal for importing expenses, processing multiple paychecks, or creating recurring entries.

**Parameters:**
- `entries` (required): Array of journal entry objects
- `auto_submit` (optional): Automatically submit (post) entries after creation (defaults to `false`)
- `stop_on_error` (optional): Stop processing on first error instead of continuing (defaults to `false`)

**Example - Batch import expenses:**
```json
{
  "entries": [
    {
      "posting_date": "2025-02-15",
      "company": "Personal",
      "user_remark": "Groceries - Whole Foods",
      "accounts": [
        {
          "account": "5410 - Groceries - Personal",
          "debit_in_account_currency": 125.50
        },
        {
          "account": "2112 - American Express - Personal",
          "credit_in_account_currency": 125.50
        }
      ]
    },
    {
      "posting_date": "2025-02-16",
      "company": "Personal",
      "user_remark": "Gas - Shell Station",
      "accounts": [
        {
          "account": "5310 - Fuel - Personal",
          "debit_in_account_currency": 45.00
        },
        {
          "account": "2111 - Chase United - Personal",
          "credit_in_account_currency": 45.00
        }
      ]
    }
  ],
  "auto_submit": true,
  "stop_on_error": false
}
```

**Example - Create monthly paycheck entries:**
```json
{
  "entries": [
    {
      "posting_date": "2025-01-15",
      "company": "Personal",
      "user_remark": "January paycheck",
      "accounts": [
        {"account": "4111 - Salary - Personal", "credit_in_account_currency": 5000.00},
        {"account": "5111 - Federal Withholding - Personal", "debit_in_account_currency": 800.00},
        {"account": "5113 - Social Security - Personal", "debit_in_account_currency": 310.00},
        {"account": "5114 - Medicare - Personal", "debit_in_account_currency": 72.50},
        {"account": "5131 - 401(k) Employee - Personal", "debit_in_account_currency": 317.50},
        {"account": "1111 - Checking - PMA - Personal", "debit_in_account_currency": 3500.00}
      ]
    },
    {
      "posting_date": "2025-02-15",
      "company": "Personal",
      "user_remark": "February paycheck",
      "accounts": [
        {"account": "4111 - Salary - Personal", "credit_in_account_currency": 5000.00},
        {"account": "5111 - Federal Withholding - Personal", "debit_in_account_currency": 800.00},
        {"account": "5113 - Social Security - Personal", "debit_in_account_currency": 310.00},
        {"account": "5114 - Medicare - Personal", "debit_in_account_currency": 72.50},
        {"account": "5131 - 401(k) Employee - Personal", "debit_in_account_currency": 317.50},
        {"account": "1111 - Checking - PMA - Personal", "debit_in_account_currency": 3500.00}
      ]
    }
  ],
  "auto_submit": false,
  "stop_on_error": true
}
```

**Returns:**
Detailed result object with:
- `success_count`: Number of entries created successfully
- `error_count`: Number of entries that failed
- `created_entries`: Array of created entries with names, dates, amounts, and submission status
- `errors`: Array of errors with entry index, error message, and validation details

**Workflow:**
1. For each entry:
   - Validates structure and balances (debits = credits)
   - Creates the journal entry via REST API
   - Optionally submits the entry if `auto_submit: true`
   - Captures success or error details
2. If `stop_on_error: false` (default): Continues processing all entries even if some fail
3. If `stop_on_error: true`: Aborts batch on first error
4. Returns comprehensive result with per-entry status

**Performance:**
- Approximately 100-200ms per entry (network latency)
- 50 entries: ~5-10 seconds
- Acceptable for typical personal bookkeeping batch sizes

**Error Handling:**
- **Validation errors**: Caught before API call, entry not created
- **Creation errors**: ERPNext rejects entry, error details included in results
- **Submission errors**: Entry created as draft but submission failed
- Partial success: Some entries may succeed while others fail (unless `stop_on_error: true`)

**Best Practices:**
- Use `auto_submit: false` for first-time imports to review drafts
- Set `stop_on_error: true` when testing to catch issues early
- Review error details and fix failed entries before retrying
- Keep batches under 100 entries for reasonable response times

## Integration with ERPNext API

These tools use ERPNext's native APIs:

1. **Bank Transaction Import:**
   - API: `erpnext.accounts.doctype.bank_transaction.bank_transaction_upload.create_bank_entries`
   - Same backend as UI import feature
   - Auto-submits transactions

2. **Single Journal Entry Creation:**
   - API: Standard document creation (`/api/resource/Journal Entry`)
   - Validation done client-side before submission
   - Submit via `frappe.client.submit`

3. **Batch Journal Entry Creation:**
   - Pattern: Loop-and-collect using standard REST API
   - Each entry validated and created individually
   - No ERPNext server modification required
   - Detailed per-entry error reporting

4. **Bank Transaction Search:**
   - API: Standard document listing (`/api/resource/Bank Transaction`)
   - Client-side amount filtering for precise ranges
   - Date range filtering via Frappe query syntax

## Best Practices

1. **Always validate** journal entries before creation
2. **Use batch operations** for importing 10+ entries to save time
3. **Start with auto_submit: false** when batch importing to review drafts first
4. **Search with date tolerance** (±3 days) for bank matching
5. **Check status = "Unreconciled"** when matching entries
6. **Use exact account names** including company suffix
7. **Round amounts** to 2 decimal places to avoid floating-point issues
8. **Review batch results** carefully - check both success and error counts
9. **Keep batches under 100 entries** for reasonable response times
10. **Use stop_on_error: true** during testing to catch structural issues early

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
