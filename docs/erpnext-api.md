# ERPNext / Frappe API Reference for Accounting

This document covers the Frappe REST API patterns and ERPNext accounting doctypes relevant to personal bookkeeping workflows.

## Table of Contents

1. [Authentication](#authentication)
2. [REST API Basics](#rest-api-basics)
3. [Accounting Doctypes](#accounting-doctypes)
4. [Journal Entries](#journal-entries)
5. [Accounts & Chart of Accounts](#accounts--chart-of-accounts)
6. [Bank Transactions & Reconciliation](#bank-transactions--reconciliation)
7. [Reports API](#reports-api)
8. [Common Patterns & Examples](#common-patterns--examples)

---

## Authentication

### API Key + Secret (Recommended for MCP)

Generate keys in ERPNext: **Settings → User → API Access → Generate Keys**

```
Authorization: token api_key:api_secret
```

Example:
```bash
curl -X GET "http://localhost:8080/api/resource/Account" \
  -H "Authorization: token abc123:xyz789" \
  -H "Accept: application/json"
```

### Session-Based (Cookie)

```bash
# Login
curl -X POST "http://localhost:8080/api/method/login" \
  -H "Content-Type: application/json" \
  -d '{"usr": "Administrator", "pwd": "your-password"}'

# Response sets cookie: sid=...
# Use cookie in subsequent requests
```

### Get Current User

```
GET /api/method/frappe.auth.get_logged_user
```

---

## REST API Basics

Base URL: `http://localhost:8080` (adjust for your Docker setup)

### Required Headers

```json
{
  "Accept": "application/json",
  "Content-Type": "application/json",
  "Authorization": "token api_key:api_secret"
}
```

### CRUD Operations

| Operation | Method | Endpoint                         |
| --------- | ------ | -------------------------------- |
| List      | GET    | `/api/resource/{doctype}`        |
| Read      | GET    | `/api/resource/{doctype}/{name}` |
| Create    | POST   | `/api/resource/{doctype}`        |
| Update    | PUT    | `/api/resource/{doctype}/{name}` |
| Delete    | DELETE | `/api/resource/{doctype}/{name}` |

### Listing with Filters

```
GET /api/resource/{doctype}?filters=[[field, operator, value]]&fields=["field1","field2"]
```

**Operators:** `=`, `!=`, `>`, `<`, `>=`, `<=`, `like`, `in`, `not in`, `between`

**Pagination:**
- `limit_start` - offset (default: 0)
- `limit_page_length` - page size (default: 20)

**Sorting:**
- `order_by` - e.g., `posting_date desc`

### Example: List Journal Entries for January 2025

```bash
curl -X GET "http://localhost:8080/api/resource/Journal%20Entry" \
  -H "Authorization: token api_key:api_secret" \
  -H "Accept: application/json" \
  --data-urlencode 'filters=[["posting_date",">=","2025-01-01"],["posting_date","<=","2025-01-31"]]' \
  --data-urlencode 'fields=["name","posting_date","total_debit","user_remark"]' \
  --data-urlencode 'order_by=posting_date desc'
```

### RPC Calls (Custom Methods)

```
GET/POST /api/method/{dotted.path.to.method}
```

Example - Run a report:
```
POST /api/method/frappe.desk.query_report.run
```

---

## Accounting Doctypes

### Core Doctypes

| Doctype            | Purpose                     | Submittable |
| ------------------ | --------------------------- | ----------- |
| `Company`          | Company/entity setup        | No          |
| `Account`          | Chart of accounts nodes     | No          |
| `Journal Entry`    | Manual accounting entries   | Yes         |
| `GL Entry`         | Auto-generated ledger lines | No (system) |
| `Fiscal Year`      | Accounting periods          | No          |
| `Cost Center`      | Departmental tracking       | No          |
| `Bank Account`     | Bank account definitions    | No          |
| `Bank Transaction` | Imported bank feed items    | No          |
| `Mode of Payment`  | Payment methods             | No          |

### Docstatus Values

For submittable doctypes (like Journal Entry):
- `0` = Draft
- `1` = Submitted
- `2` = Cancelled

---

## Journal Entries

The primary doctype for recording transactions in personal bookkeeping.

### Journal Entry Fields

| Field          | Type     | Required | Description                       |
| -------------- | -------- | -------- | --------------------------------- |
| `voucher_type` | Select   | Yes      | Entry type (see below)            |
| `posting_date` | Date     | Yes      | Transaction date                  |
| `company`      | Link     | Yes      | Company name                      |
| `accounts`     | Table    | Yes      | Child table of line items         |
| `user_remark`  | Text     | No       | Description/memo                  |
| `cheque_no`    | Data     | No       | Check/reference number            |
| `cheque_date`  | Date     | No       | Check date                        |
| `title`        | Data     | No       | Auto-generated from first account |
| `total_debit`  | Currency | Auto     | Sum of debits                     |
| `total_credit` | Currency | Auto     | Sum of credits                    |

### Voucher Types

| Type                 | Use Case                      |
| -------------------- | ----------------------------- |
| `Journal Entry`      | General purpose (most common) |
| `Bank Entry`         | Bank-related transactions     |
| `Cash Entry`         | Cash transactions             |
| `Credit Card Entry`  | Credit card transactions      |
| `Opening Entry`      | Opening balances              |
| `Depreciation Entry` | Asset depreciation            |
| `Write Off Entry`    | Write-offs                    |

### Journal Entry Account (Child Table)

Each line in the `accounts` array:

| Field                        | Type     | Required | Description                           |
| ---------------------------- | -------- | -------- | ------------------------------------- |
| `account`                    | Link     | Yes      | Full account name with company suffix |
| `debit_in_account_currency`  | Currency | *        | Debit amount                          |
| `credit_in_account_currency` | Currency | *        | Credit amount                         |
| `party_type`                 | Select   | No       | Customer, Supplier, Employee, etc.    |
| `party`                      | Link     | No       | Party name (if party_type set)        |
| `cost_center`                | Link     | No       | Cost center                           |
| `project`                    | Link     | No       | Project reference                     |
| `reference_type`             | Select   | No       | Linked document type                  |
| `reference_name`             | Link     | No       | Linked document name                  |
| `user_remark`                | Text     | No       | Line-level memo                       |

*Either debit OR credit should be non-zero, not both.

### Create Journal Entry

```bash
POST /api/resource/Journal%20Entry

{
  "doctype": "Journal Entry",
  "voucher_type": "Journal Entry",
  "posting_date": "2025-01-15",
  "company": "Personal",
  "user_remark": "January 15 paycheck - net deposit",
  "accounts": [
    {
      "account": "1111 - Checking - PMA - Personal",
      "debit_in_account_currency": 3500.00,
      "credit_in_account_currency": 0
    },
    {
      "account": "4111 - Salary - Personal",
      "debit_in_account_currency": 0,
      "credit_in_account_currency": 5000.00
    },
    {
      "account": "5111 - Federal Withholding - Personal",
      "debit_in_account_currency": 800.00,
      "credit_in_account_currency": 0
    },
    {
      "account": "5113 - Social Security - Personal",
      "debit_in_account_currency": 310.00,
      "credit_in_account_currency": 0
    },
    {
      "account": "5114 - Medicare - Personal",
      "debit_in_account_currency": 72.50,
      "credit_in_account_currency": 0
    },
    {
      "account": "5131 - 401(k) Employee Contribution - Personal",
      "debit_in_account_currency": 317.50,
      "credit_in_account_currency": 0
    }
  ]
}
```

### Submit Journal Entry

After creating (docstatus=0), submit to post to GL:

```bash
POST /api/method/frappe.client.submit

{
  "doc": {
    "doctype": "Journal Entry",
    "name": "JV-2025-00001"
  }
}
```

Or use the document method:
```bash
POST /api/resource/Journal%20Entry/JV-2025-00001

{
  "docstatus": 1
}
```

### Cancel Journal Entry

```bash
POST /api/method/frappe.client.cancel

{
  "doctype": "Journal Entry",
  "name": "JV-2025-00001"
}
```

---

## Accounts & Chart of Accounts

### Account Fields

| Field              | Type   | Description                               |
| ------------------ | ------ | ----------------------------------------- |
| `account_name`     | Data   | Display name                              |
| `account_number`   | Data   | Account number (e.g., "1111")             |
| `parent_account`   | Link   | Parent in hierarchy                       |
| `root_type`        | Select | Asset, Liability, Equity, Income, Expense |
| `account_type`     | Select | Bank, Cash, Receivable, Payable, etc.     |
| `is_group`         | Check  | True if has children                      |
| `company`          | Link   | Company this account belongs to           |
| `account_currency` | Link   | Currency (default: company currency)      |
| `balance_must_be`  | Select | Debit, Credit, or empty                   |
| `report_type`      | Select | Balance Sheet or Profit and Loss          |

### Account Name Format

ERPNext account names include the company suffix:
```
{account_number} - {account_name} - {company_abbr}
```

Example: `1111 - Checking - PMA - Personal`

### List All Accounts

```bash
GET /api/resource/Account?filters=[["company","=","Personal"]]&fields=["name","account_name","account_number","parent_account","root_type","account_type","is_group"]&limit_page_length=0
```

### Get Account Balance

Use the General Ledger report or this RPC call:

```bash
POST /api/method/erpnext.accounts.utils.get_balance_on

{
  "account": "1111 - Checking - PMA - Personal",
  "date": "2025-01-31"
}
```

### Get Account Tree

```bash
POST /api/method/frappe.desk.treeview.get_children

{
  "doctype": "Account",
  "parent": "",
  "company": "Personal",
  "is_root": true
}
```

For children of a specific account:
```bash
POST /api/method/frappe.desk.treeview.get_children

{
  "doctype": "Account",
  "parent": "1100 - Current Assets - Personal",
  "company": "Personal"
}
```

---

## Bank Transactions & Reconciliation

### Bank Transaction Doctype

Represents imported bank feed items.

| Field                | Type     | Description                                |
| -------------------- | -------- | ------------------------------------------ |
| `date`               | Date     | Transaction date                           |
| `bank_account`       | Link     | ERPNext Bank Account                       |
| `deposit`            | Currency | Credit amount                              |
| `withdrawal`         | Currency | Debit amount                               |
| `description`        | Text     | Bank description                           |
| `reference_number`   | Data     | Check/reference number                     |
| `transaction_id`     | Data     | Bank's unique ID                           |
| `status`             | Select   | Pending, Settled, Unreconciled, Reconciled |
| `allocated_amount`   | Currency | Amount matched to vouchers                 |
| `unallocated_amount` | Currency | Remaining unmatched                        |
| `payment_entries`    | Table    | Linked Payment Entries                     |

### Import Bank Transactions

```bash
POST /api/resource/Bank%20Transaction

{
  "doctype": "Bank Transaction",
  "date": "2025-01-15",
  "bank_account": "Checking - PMA - Personal",
  "withdrawal": 150.00,
  "description": "AUTOPAY ELECTRICITY",
  "status": "Pending"
}
```

### Get Unreconciled Transactions

```bash
GET /api/resource/Bank%20Transaction?filters=[["status","=","Unreconciled"],["bank_account","=","Checking - PMA - Personal"]]&fields=["name","date","deposit","withdrawal","description"]
```

### Reconciliation Tool API

```bash
POST /api/method/erpnext.accounts.doctype.bank_reconciliation_tool.bank_reconciliation_tool.get_bank_transactions

{
  "bank_account": "Checking - PMA - Personal",
  "from_date": "2025-01-01",
  "to_date": "2025-01-31"
}
```

### Match Transaction to Voucher

```bash
POST /api/method/erpnext.accounts.doctype.bank_reconciliation_tool.bank_reconciliation_tool.reconcile_vouchers

{
  "bank_transaction_name": "BT-2025-00001",
  "vouchers": [
    {
      "payment_doctype": "Journal Entry",
      "payment_name": "JV-2025-00001",
      "amount": 150.00
    }
  ]
}
```

---

## Reports API

### Run Any Report

```bash
POST /api/method/frappe.desk.query_report.run

{
  "report_name": "General Ledger",
  "filters": {
    "company": "Personal",
    "from_date": "2025-01-01",
    "to_date": "2025-01-31",
    "account": "1111 - Checking - PMA - Personal"
  }
}
```

### Common Accounting Reports

| Report Name                 | Key Filters                                              |
| --------------------------- | -------------------------------------------------------- |
| `General Ledger`            | company, from_date, to_date, account, party              |
| `Trial Balance`             | company, fiscal_year, from_date, to_date                 |
| `Balance Sheet`             | company, fiscal_year, period_start_date, period_end_date |
| `Profit and Loss Statement` | company, fiscal_year, period_start_date, period_end_date |
| `Accounts Receivable`       | company, ageing_based_on, report_date                    |
| `Accounts Payable`          | company, ageing_based_on, report_date                    |
| `Bank Clearance Summary`    | from_date, to_date, bank_account                         |

### General Ledger Report

```bash
POST /api/method/frappe.desk.query_report.run

{
  "report_name": "General Ledger",
  "filters": {
    "company": "Personal",
    "from_date": "2025-01-01",
    "to_date": "2025-12-31",
    "group_by": "Group by Voucher (Consolidated)",
    "include_dimensions": 1
  }
}
```

### Trial Balance

```bash
POST /api/method/frappe.desk.query_report.run

{
  "report_name": "Trial Balance",
  "filters": {
    "company": "Personal",
    "fiscal_year": "2025",
    "from_date": "2025-01-01",
    "to_date": "2025-12-31",
    "with_period_closing_entry": 0
  }
}
```

---

## Common Patterns & Examples

### Pattern 1: Record a Simple Expense

Credit card purchase for groceries:

```json
{
  "doctype": "Journal Entry",
  "voucher_type": "Credit Card Entry",
  "posting_date": "2025-01-20",
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
}
```

### Pattern 2: Credit Card Payment

Pay off credit card from checking:

```json
{
  "doctype": "Journal Entry",
  "voucher_type": "Bank Entry",
  "posting_date": "2025-01-25",
  "company": "Personal",
  "user_remark": "Amex payment",
  "accounts": [
    {
      "account": "2112 - American Express - Personal",
      "debit_in_account_currency": 2500.00
    },
    {
      "account": "1111 - Checking - PMA - Personal",
      "credit_in_account_currency": 2500.00
    }
  ]
}
```

### Pattern 3: Transfer Between Accounts

Move money to savings:

```json
{
  "doctype": "Journal Entry",
  "voucher_type": "Bank Entry",
  "posting_date": "2025-01-15",
  "company": "Personal",
  "user_remark": "Monthly savings transfer",
  "accounts": [
    {
      "account": "1113 - Savings - Emergency Fund - Personal",
      "debit_in_account_currency": 500.00
    },
    {
      "account": "1111 - Checking - PMA - Personal",
      "credit_in_account_currency": 500.00
    }
  ]
}
```

### Pattern 4: Record Full Paycheck with Deductions

Complete paycheck processing:

```json
{
  "doctype": "Journal Entry",
  "voucher_type": "Journal Entry",
  "posting_date": "2025-01-15",
  "company": "Personal",
  "user_remark": "Pay period 2025-01-01 to 2025-01-15",
  "accounts": [
    {
      "account": "4111 - Salary - Personal",
      "credit_in_account_currency": 5769.23,
      "user_remark": "Gross salary"
    },
    {
      "account": "4113 - 401(k) Employer Match - Personal",
      "credit_in_account_currency": 288.46,
      "user_remark": "Employer 401k match"
    },
    {
      "account": "4114 - HSA Employer Match - Personal",
      "credit_in_account_currency": 50.00,
      "user_remark": "Employer HSA contribution"
    },
    {
      "account": "5111 - Federal Withholding - Personal",
      "debit_in_account_currency": 865.38
    },
    {
      "account": "5112 - State Withholding - Personal",
      "debit_in_account_currency": 461.54
    },
    {
      "account": "5113 - Social Security - Personal",
      "debit_in_account_currency": 357.69
    },
    {
      "account": "5114 - Medicare - Personal",
      "debit_in_account_currency": 83.65
    },
    {
      "account": "5121 - Health Insurance - Personal",
      "debit_in_account_currency": 250.00
    },
    {
      "account": "5131 - 401(k) Employee Contribution - Personal",
      "debit_in_account_currency": 576.92
    },
    {
      "account": "5132 - HSA Employee Contribution - Personal",
      "debit_in_account_currency": 150.00
    },
    {
      "account": "1411 - James 401(k) - Personal",
      "debit_in_account_currency": 865.38,
      "user_remark": "401k employee + employer"
    },
    {
      "account": "1141 - HSA - Fidelity - Personal",
      "debit_in_account_currency": 200.00,
      "user_remark": "HSA employee + employer"
    },
    {
      "account": "1111 - Checking - PMA - Personal",
      "debit_in_account_currency": 3024.05,
      "user_remark": "Net pay deposit"
    }
  ]
}
```

### Pattern 5: LLC K-1 Distribution

Record S-corp distribution to personal books:

```json
{
  "doctype": "Journal Entry",
  "voucher_type": "Journal Entry",
  "posting_date": "2025-03-15",
  "company": "Personal",
  "user_remark": "2024 K-1 distribution from LLC",
  "accounts": [
    {
      "account": "1111 - Checking - PMA - Personal",
      "debit_in_account_currency": 25000.00
    },
    {
      "account": "4210 - LLC K-1 Income - Personal",
      "credit_in_account_currency": 25000.00
    }
  ]
}
```

---

## Error Handling

### Common API Errors

| HTTP Status | Meaning          | Common Cause                                |
| ----------- | ---------------- | ------------------------------------------- |
| 401         | Unauthorized     | Invalid/missing API key                     |
| 403         | Forbidden        | Insufficient permissions                    |
| 404         | Not Found        | Invalid doctype or document name            |
| 409         | Conflict         | Document already exists or validation error |
| 417         | Validation Error | Missing required fields, unbalanced entry   |
| 500         | Server Error     | Internal ERPNext error                      |

### Validation Error Response

```json
{
  "exc_type": "ValidationError",
  "exception": "frappe.exceptions.ValidationError: Total Debit must be equal to Total Credit",
  "_server_messages": "[\"Total Debit must be equal to Total Credit. The difference is 100.00\"]"
}
```

---

## MCP Server Integration Notes

When building MCP tools for ERPNext:

1. **Account names must include company suffix** - Always fetch and use the full account name (e.g., `1111 - Checking - PMA - Personal`)

2. **Journal entries must balance** - Validate that total debits = total credits before submission

3. **Handle docstatus properly** - Draft (0) entries can be edited; Submitted (1) entries are locked

4. **Use filters to reduce payload** - Always specify fields and filters to minimize API response size

5. **Pagination for large datasets** - Use `limit_start` and `limit_page_length` for accounts/transactions lists

6. **Date format** - Use ISO format: `YYYY-MM-DD`

7. **Currency precision** - ERPNext typically uses 2 decimal places for currency

---

## Useful API Endpoints Quick Reference

```
# Authentication
POST /api/method/login
GET  /api/method/frappe.auth.get_logged_user

# Documents
GET  /api/resource/Account
GET  /api/resource/Journal%20Entry
GET  /api/resource/Bank%20Transaction
GET  /api/resource/GL%20Entry
GET  /api/resource/Company

# Document Operations  
POST /api/resource/{doctype}              # Create
PUT  /api/resource/{doctype}/{name}       # Update
DELETE /api/resource/{doctype}/{name}     # Delete

# Submit/Cancel
POST /api/method/frappe.client.submit
POST /api/method/frappe.client.cancel

# Reports
POST /api/method/frappe.desk.query_report.run

# Utilities
POST /api/method/erpnext.accounts.utils.get_balance_on
POST /api/method/frappe.desk.treeview.get_children
```

---

## References

- [Frappe REST API Documentation](https://frappeframework.com/docs/user/en/api/rest)
- [ERPNext User Manual - Accounting](https://docs.erpnext.com/docs/user/manual/en/accounts)
- [Journal Entry Documentation](https://docs.erpnext.com/docs/user/manual/en/journal-entry)
- [Bank Reconciliation Guide](https://docs.erpnext.com/docs/user/manual/en/bank-reconciliation)
- [Unofficial Frappe API Docs (Swagger)](https://github.com/alyf-de/frappe_api-docs)
