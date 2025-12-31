#!/usr/bin/env node

/**
 * ERPNext MCP Server
 * This server provides integration with the ERPNext/Frappe API, allowing:
 * - Authentication with ERPNext
 * - Fetching documents from ERPNext
 * - Querying lists of documents
 * - Creating and updating documents
 * - Running reports
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";
import {
  BankTransaction,
  BankAccount,
  JournalEntry,
  JournalEntryValidation
} from './types.js';

// ERPNext API client configuration
class ERPNextClient {
  private baseUrl: string;
  private axiosInstance: AxiosInstance;
  private authenticated: boolean = false;

  constructor() {
    // Get ERPNext configuration from environment variables
    this.baseUrl = process.env.ERPNEXT_URL || '';
    
    // Validate configuration
    if (!this.baseUrl) {
      throw new Error("ERPNEXT_URL environment variable is required");
    }
    
    // Remove trailing slash if present
    this.baseUrl = this.baseUrl.replace(/\/$/, '');
    
    // Initialize axios instance
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    // Configure authentication if credentials provided
    const apiKey = process.env.ERPNEXT_API_KEY;
    const apiSecret = process.env.ERPNEXT_API_SECRET;
    
    if (apiKey && apiSecret) {
      this.axiosInstance.defaults.headers.common['Authorization'] = 
        `token ${apiKey}:${apiSecret}`;
      this.authenticated = true;
    }
  }

  isAuthenticated(): boolean {
    return this.authenticated;
  }

  // Get a document by doctype and name
  async getDocument(doctype: string, name: string): Promise<any> {
    try {
      const response = await this.axiosInstance.get(`/api/resource/${doctype}/${name}`);
      return response.data.data;
    } catch (error: any) {
      throw new Error(`Failed to get ${doctype} ${name}: ${error?.message || 'Unknown error'}`);
    }
  }

  // Get list of documents for a doctype
  async getDocList(doctype: string, filters?: Record<string, any>, fields?: string[], limit?: number): Promise<any[]> {
    try {
      let params: Record<string, any> = {};
      
      if (fields && fields.length) {
        params['fields'] = JSON.stringify(fields);
      }
      
      if (filters) {
        params['filters'] = JSON.stringify(filters);
      }
      
      if (limit) {
        params['limit_page_length'] = limit;
      }
      
      const response = await this.axiosInstance.get(`/api/resource/${doctype}`, { params });
      return response.data.data;
    } catch (error: any) {
      throw new Error(`Failed to get ${doctype} list: ${error?.message || 'Unknown error'}`);
    }
  }

  // Create a new document
  async createDocument(doctype: string, doc: Record<string, any>): Promise<any> {
    try {
      const response = await this.axiosInstance.post(`/api/resource/${doctype}`, {
        data: doc
      });
      return response.data.data;
    } catch (error: any) {
      throw new Error(`Failed to create ${doctype}: ${error?.message || 'Unknown error'}`);
    }
  }

  // Update an existing document
  async updateDocument(doctype: string, name: string, doc: Record<string, any>): Promise<any> {
    try {
      const response = await this.axiosInstance.put(`/api/resource/${doctype}/${name}`, {
        data: doc
      });
      return response.data.data;
    } catch (error: any) {
      throw new Error(`Failed to update ${doctype} ${name}: ${error?.message || 'Unknown error'}`);
    }
  }

  // Run a report
  async runReport(reportName: string, filters?: Record<string, any>): Promise<any> {
    try {
      const response = await this.axiosInstance.get(`/api/method/frappe.desk.query_report.run`, {
        params: {
          report_name: reportName,
          filters: filters ? JSON.stringify(filters) : undefined
        }
      });
      return response.data.message;
    } catch (error: any) {
      throw new Error(`Failed to run report ${reportName}: ${error?.message || 'Unknown error'}`);
    }
  }

  // Get all available DocTypes
  async getAllDocTypes(): Promise<string[]> {
    try {
      // Use the standard REST API to fetch DocTypes
      const response = await this.axiosInstance.get('/api/resource/DocType', {
        params: {
          fields: JSON.stringify(["name"]),
          limit_page_length: 500 // Get more doctypes at once
        }
      });
      
      if (response.data && response.data.data) {
        return response.data.data.map((item: any) => item.name);
      }
      
      return [];
    } catch (error: any) {
      console.error("Failed to get DocTypes:", error?.message || 'Unknown error');
      
      // Try an alternative approach if the first one fails
      try {
        // Try using the method API to get doctypes
        const altResponse = await this.axiosInstance.get('/api/method/frappe.desk.search.search_link', {
          params: {
            doctype: 'DocType',
            txt: '',
            limit: 500
          }
        });
        
        if (altResponse.data && altResponse.data.results) {
          return altResponse.data.results.map((item: any) => item.value);
        }
        
        return [];
      } catch (altError: any) {
        console.error("Alternative DocType fetch failed:", altError?.message || 'Unknown error');
        
        // Fallback: Return a list of common DocTypes
        return [
          "Customer", "Supplier", "Item", "Sales Order", "Purchase Order",
          "Sales Invoice", "Purchase Invoice", "Employee", "Lead", "Opportunity",
          "Quotation", "Payment Entry", "Journal Entry", "Stock Entry"
        ];
      }
    }
  }

  // Generic RPC method caller for ERPNext/Frappe methods
  async callMethod(methodPath: string, params: Record<string, any>): Promise<any> {
    try {
      const response = await this.axiosInstance.post(`/api/method/${methodPath}`, params);
      return response.data.message || response.data;
    } catch (error: any) {
      throw new Error(`Failed to call method ${methodPath}: ${error?.message || 'Unknown error'}`);
    }
  }

  // Get all companies with parent-subsidiary relationships
  async getCompanies(): Promise<any[]> {
    try {
      return await this.getDocList('Company', {}, ['name', 'abbr', 'parent_company', 'default_currency']);
    } catch (error: any) {
      throw new Error(`Failed to get companies: ${error?.message || 'Unknown error'}`);
    }
  }

  // Get account tree children for a company (one level at a time)
  async getAccountTree(company: string, parent?: string, includeBalances?: boolean): Promise<any> {
    try {
      const params: Record<string, any> = {
        doctype: 'Account',
        company: company
      };

      if (parent === undefined || parent === '') {
        params.parent = '';
        params.is_root = true;
      } else {
        params.parent = parent;
      }

      const children = await this.callMethod('frappe.desk.treeview.get_children', params);

      // includeBalances parameter reserved for Phase 2 enhancement
      return children;
    } catch (error: any) {
      throw new Error(`Failed to get account tree for ${company}: ${error?.message || 'Unknown error'}`);
    }
  }

  // Get account balance as of a specific date
  async getAccountBalance(account: string, date?: string): Promise<any> {
    try {
      const balanceDate = date || new Date().toISOString().split('T')[0];

      const params = {
        account: account,
        date: balanceDate
      };

      return await this.callMethod('erpnext.accounts.utils.get_balance_on', params);
    } catch (error: any) {
      throw new Error(`Failed to get balance for ${account}: ${error?.message || 'Unknown error'}`);
    }
  }

  // Get trial balance for a company and date range (simplified wrapper around run_report)
  async getTrialBalance(company: string, asOfDate?: string, showZeroBalances: boolean = false): Promise<any> {
    try {
      const date = asOfDate || new Date().toISOString().split('T')[0];

      // Determine fiscal year from date (simple assumption: fiscal year = calendar year)
      const fiscalYear = new Date(date).getFullYear().toString();

      const filters = {
        company: company,
        fiscal_year: fiscalYear,
        from_date: `${fiscalYear}-01-01`,
        to_date: date,
        with_period_closing_entry: 0
      };

      const result = await this.runReport('Trial Balance', filters);

      // Filter out zero balances if requested
      if (!showZeroBalances && result.result) {
        result.result = result.result.filter((row: any) => {
          const debit = parseFloat(row.debit) || 0;
          const credit = parseFloat(row.credit) || 0;
          return debit !== 0 || credit !== 0;
        });
      }

      return result;
    } catch (error: any) {
      throw new Error(`Failed to get trial balance for ${company}: ${error?.message || 'Unknown error'}`);
    }
  }

  // Search accounts by number or name (fuzzy search)
  async searchAccounts(company: string, query: string, limit: number = 10): Promise<any[]> {
    try {
      // Search in both account_name and account_number fields using 'like' operator
      const filters = {
        company: company,
        // Use OR logic: match either name or number
        name: ['like', `%${query}%`]
      };

      const accounts = await this.getDocList(
        'Account',
        filters,
        ['name', 'account_name', 'account_number', 'account_type', 'is_group', 'parent_account'],
        limit
      );

      return accounts;
    } catch (error: any) {
      throw new Error(`Failed to search accounts for ${company}: ${error?.message || 'Unknown error'}`);
    }
  }

  // List accounts filtered by type or root type
  async listAccountsByType(
    company: string,
    accountType?: string,
    rootType?: string,
    includeGroups: boolean = false
  ): Promise<any[]> {
    try {
      const filters: Record<string, any> = { company: company };

      if (accountType) {
        filters.account_type = accountType;
      }

      if (rootType) {
        filters.root_type = rootType;
      }

      if (!includeGroups) {
        filters.is_group = 0;
      }

      const accounts = await this.getDocList(
        'Account',
        filters,
        ['name', 'account_name', 'account_number', 'account_type', 'root_type', 'is_group'],
        0  // No limit, get all matching accounts
      );

      return accounts;
    } catch (error: any) {
      throw new Error(`Failed to list accounts by type for ${company}: ${error?.message || 'Unknown error'}`);
    }
  }

  // Get all bank accounts for a company
  async getBankAccounts(company?: string): Promise<BankAccount[]> {
    try {
      const filters: Record<string, any> = {};

      if (company) {
        filters.company = company;
      }

      const accounts = await this.getDocList(
        'Bank Account',
        filters,
        ['name', 'account_name', 'account', 'bank', 'is_company_account', 'company', 'bank_account_no', 'iban', 'is_default', 'disabled'],
        0
      );

      return accounts as BankAccount[];
    } catch (error: any) {
      throw new Error(`Failed to get bank accounts: ${error?.message || 'Unknown error'}`);
    }
  }

  // Search bank transactions with filters
  async searchBankTransactions(
    bankAccount?: string,
    company?: string,
    status?: string,
    fromDate?: string,
    toDate?: string,
    minAmount?: number,
    maxAmount?: number
  ): Promise<BankTransaction[]> {
    try {
      const filters: Record<string, any> = {};

      if (bankAccount) {
        filters.bank_account = bankAccount;
      }

      if (company) {
        filters.company = company;
      }

      if (status) {
        filters.status = status;
      }

      if (fromDate) {
        filters.date = ['>=', fromDate];
      }

      if (toDate) {
        if (filters.date) {
          filters.date = ['between', [fromDate, toDate]];
        } else {
          filters.date = ['<=', toDate];
        }
      }

      const transactions = await this.getDocList(
        'Bank Transaction',
        filters,
        ['name', 'date', 'deposit', 'withdrawal', 'description', 'reference_number', 'transaction_id', 'bank_account', 'company', 'currency', 'status'],
        0
      );

      // Filter by amount if specified (client-side filtering since ERPNext doesn't support range queries easily)
      let filtered = transactions as BankTransaction[];

      if (minAmount !== undefined || maxAmount !== undefined) {
        filtered = filtered.filter(t => {
          const amount = t.deposit || t.withdrawal || 0;
          if (minAmount !== undefined && amount < minAmount) return false;
          if (maxAmount !== undefined && amount > maxAmount) return false;
          return true;
        });
      }

      return filtered;
    } catch (error: any) {
      throw new Error(`Failed to search bank transactions: ${error?.message || 'Unknown error'}`);
    }
  }

  // Batch import bank transactions using ERPNext's create_bank_entries API
  async batchImportBankTransactions(
    columns: string[],
    data: any[][],
    bankAccount: string
  ): Promise<any> {
    try {
      return await this.callMethod(
        'erpnext.accounts.doctype.bank_transaction.bank_transaction_upload.create_bank_entries',
        {
          columns: JSON.stringify(columns),
          data: JSON.stringify(data),
          bank_account: bankAccount
        }
      );
    } catch (error: any) {
      throw new Error(`Failed to batch import bank transactions: ${error?.message || 'Unknown error'}`);
    }
  }

  // Validate journal entry (check that debits equal credits)
  async validateJournalEntry(journalEntry: JournalEntry): Promise<JournalEntryValidation> {
    const validation: JournalEntryValidation = {
      is_valid: true,
      total_debit: 0,
      total_credit: 0,
      difference: 0,
      errors: [],
      warnings: []
    };

    // Check required fields
    if (!journalEntry.posting_date) {
      validation.errors.push('posting_date is required');
      validation.is_valid = false;
    }

    if (!journalEntry.company) {
      validation.errors.push('company is required');
      validation.is_valid = false;
    }

    if (!journalEntry.accounts || journalEntry.accounts.length === 0) {
      validation.errors.push('At least one account entry is required');
      validation.is_valid = false;
      return validation;
    }

    if (journalEntry.accounts.length < 2) {
      validation.errors.push('Journal entry must have at least 2 account entries');
      validation.is_valid = false;
    }

    // Calculate totals
    for (const account of journalEntry.accounts) {
      if (!account.account) {
        validation.errors.push('Account name is required for all entries');
        validation.is_valid = false;
        continue;
      }

      const debit = account.debit_in_account_currency || 0;
      const credit = account.credit_in_account_currency || 0;

      validation.total_debit += debit;
      validation.total_credit += credit;

      // Check that each line has either debit or credit, not both
      if (debit > 0 && credit > 0) {
        validation.warnings.push(`Account ${account.account} has both debit and credit - this is unusual`);
      }

      if (debit === 0 && credit === 0) {
        validation.errors.push(`Account ${account.account} has neither debit nor credit`);
        validation.is_valid = false;
      }
    }

    // Round to 2 decimal places for comparison
    validation.total_debit = Math.round(validation.total_debit * 100) / 100;
    validation.total_credit = Math.round(validation.total_credit * 100) / 100;
    validation.difference = Math.round((validation.total_debit - validation.total_credit) * 100) / 100;

    // Check if debits equal credits (allowing for small rounding errors)
    if (Math.abs(validation.difference) > 0.01) {
      validation.errors.push(`Debits (${validation.total_debit}) do not equal credits (${validation.total_credit}). Difference: ${validation.difference}`);
      validation.is_valid = false;
    }

    return validation;
  }

  // Create journal entry with validation
  async createJournalEntry(journalEntry: JournalEntry, skipValidation: boolean = false): Promise<any> {
    try {
      // Validate first unless skipped
      if (!skipValidation) {
        const validation = await this.validateJournalEntry(journalEntry);
        if (!validation.is_valid) {
          throw new Error(`Journal entry validation failed: ${validation.errors.join(', ')}`);
        }
      }

      // Create the journal entry
      const result = await this.createDocument('Journal Entry', journalEntry);

      return result;
    } catch (error: any) {
      throw new Error(`Failed to create journal entry: ${error?.message || 'Unknown error'}`);
    }
  }

  // Submit (post) a journal entry
  async submitJournalEntry(journalEntryName: string): Promise<any> {
    try {
      return await this.callMethod('frappe.client.submit', {
        doc: JSON.stringify({
          doctype: 'Journal Entry',
          name: journalEntryName
        })
      });
    } catch (error: any) {
      throw new Error(`Failed to submit journal entry ${journalEntryName}: ${error?.message || 'Unknown error'}`);
    }
  }
}

// Cache for doctype metadata
const doctypeCache = new Map<string, any>();

// Initialize ERPNext client
const erpnext = new ERPNextClient();

// Create an MCP server with capabilities for resources and tools
const server = new Server(
  {
    name: "erpnext-server",
    version: "0.1.0"
  },
  {
    capabilities: {
      resources: {},
      tools: {}
    }
  }
);

/**
 * Handler for listing available ERPNext resources.
 * Exposes DocTypes list as a resource and common doctypes as individual resources.
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  // List of common DocTypes to expose as individual resources
  const commonDoctypes = [
    "Customer",
    "Supplier",
    "Item",
    "Sales Order",
    "Purchase Order",
    "Sales Invoice",
    "Purchase Invoice",
    "Employee"
  ];

  const resources = [
    // Add a resource to get all doctypes
    {
      uri: "erpnext://DocTypes",
      name: "All DocTypes",
      mimeType: "application/json",
      description: "List of all available DocTypes in the ERPNext instance"
    },
    {
      uri: "erpnext://companies",
      name: "Company List",
      mimeType: "application/json",
      description: "List of all companies with parent-subsidiary relationships"
    }
  ];

  return {
    resources
  };
});

/**
 * Handler for resource templates.
 * Allows querying ERPNext documents by doctype and name.
 */
server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
  const resourceTemplates = [
    {
      uriTemplate: "erpnext://{doctype}/{name}",
      name: "ERPNext Document",
      mimeType: "application/json",
      description: "Fetch an ERPNext document by doctype and name"
    }
  ];

  return { resourceTemplates };
});

/**
 * Handler for reading ERPNext resources.
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (!erpnext.isAuthenticated()) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      "Not authenticated with ERPNext. Please configure API key authentication."
    );
  }

  const uri = request.params.uri;
  let result: any;

  // Handle special resource: erpnext://companies
  if (uri === "erpnext://companies") {
    try {
      const companies = await erpnext.getCompanies();
      result = { companies };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch companies: ${error?.message || 'Unknown error'}`
      );
    }
  } else if (uri === "erpnext://DocTypes") {
    // Handle special resource: erpnext://DocTypes (list of all doctypes)
    try {
      const doctypes = await erpnext.getAllDocTypes();
      result = { doctypes };
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch DocTypes: ${error?.message || 'Unknown error'}`
      );
    }
  } else {
    // Handle document access: erpnext://{doctype}/{name}
    const documentMatch = uri.match(/^erpnext:\/\/([^\/]+)\/(.+)$/);
    if (documentMatch) {
      const doctype = decodeURIComponent(documentMatch[1]);
      const name = decodeURIComponent(documentMatch[2]);

      try {
        result = await erpnext.getDocument(doctype, name);
      } catch (error: any) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Failed to fetch ${doctype} ${name}: ${error?.message || 'Unknown error'}`
        );
      }
    }
  }

  if (!result) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Invalid ERPNext resource URI: ${uri}`
    );
  }

  return {
    contents: [{
      uri: request.params.uri,
      mimeType: "application/json",
      text: JSON.stringify(result, null, 2)
    }]
  };
});

/**
 * Handler that lists available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_doctypes",
        description: "Get a list of all available DocTypes",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "get_doctype_fields",
        description: "Get fields list for a specific DocType",
        inputSchema: {
          type: "object",
          properties: {
            doctype: {
              type: "string",
              description: "ERPNext DocType (e.g., Customer, Item)"
            }
          },
            required: ["doctype"]
        }
      },
      {
        name: "get_documents",
        description: "Get a list of documents for a specific doctype",
        inputSchema: {
          type: "object",
          properties: {
            doctype: {
              type: "string",
              description: "ERPNext DocType (e.g., Customer, Item)"
            },
            fields: {
              type: "array",
              items: {
                type: "string"
              },
              description: "Fields to include (optional)"
            },
            filters: {
              type: "object",
              additionalProperties: true,
              description: "Filters in the format {field: value} (optional)"
            },
            limit: {
              type: "number",
              description: "Maximum number of documents to return (optional)"
            }
          },
          required: ["doctype"]
        }
      },
      {
        name: "create_document",
        description: "Create a new document in ERPNext",
        inputSchema: {
          type: "object",
          properties: {
            doctype: {
              type: "string",
              description: "ERPNext DocType (e.g., Customer, Item)"
            },
            data: {
              type: "object",
              additionalProperties: true,
              description: "Document data"
            }
          },
          required: ["doctype", "data"]
        }
      },
      {
        name: "update_document",
        description: "Update an existing document in ERPNext",
        inputSchema: {
          type: "object",
          properties: {
            doctype: {
              type: "string",
              description: "ERPNext DocType (e.g., Customer, Item)"
            },
            name: {
              type: "string",
              description: "Document name/ID"
            },
            data: {
              type: "object",
              additionalProperties: true,
              description: "Document data to update"
            }
          },
          required: ["doctype", "name", "data"]
        }
      },
      {
        name: "run_report",
        description: "Run an ERPNext report",
        inputSchema: {
          type: "object",
          properties: {
            report_name: {
              type: "string",
              description: "Name of the report"
            },
            filters: {
              type: "object",
              additionalProperties: true,
              description: "Report filters (optional)"
            }
          },
          required: ["report_name"]
        }
      },
      {
        name: "get_companies",
        description: "List all companies in ERPNext with parent-subsidiary relationships",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "get_account_tree",
        description: "Get hierarchical chart of accounts tree for a company",
        inputSchema: {
          type: "object",
          properties: {
            company: {
              type: "string",
              description: "Company name (e.g., 'Personal', 'LLC')"
            },
            parent_account: {
              type: "string",
              description: "Parent account name to get children of (leave empty for root accounts)"
            },
            include_balances: {
              type: "boolean",
              description: "Include current balances for accounts (not implemented in Phase 1)"
            }
          },
          required: ["company"]
        }
      },
      {
        name: "get_account_balance",
        description: "Get balance for an account as of a specific date",
        inputSchema: {
          type: "object",
          properties: {
            account: {
              type: "string",
              description: "Full account name including company suffix (e.g., '1111 - Checking - PMA - Personal')"
            },
            date: {
              type: "string",
              description: "Date for balance in YYYY-MM-DD format (optional, defaults to today)"
            }
          },
          required: ["account"]
        }
      },
      {
        name: "get_trial_balance",
        description: "Get trial balance report for a company as of a specific date",
        inputSchema: {
          type: "object",
          properties: {
            company: {
              type: "string",
              description: "Company name (e.g., 'Personal', 'LLC')"
            },
            as_of_date: {
              type: "string",
              description: "Date for trial balance in YYYY-MM-DD format (optional, defaults to today)"
            },
            show_zero_balances: {
              type: "boolean",
              description: "Include accounts with zero balances (optional, defaults to false)"
            }
          },
          required: ["company"]
        }
      },
      {
        name: "search_accounts",
        description: "Search accounts by account number or name (fuzzy search)",
        inputSchema: {
          type: "object",
          properties: {
            company: {
              type: "string",
              description: "Company name (e.g., 'Personal', 'LLC')"
            },
            query: {
              type: "string",
              description: "Search term (account number like '1111' or partial name like 'Checking')"
            },
            limit: {
              type: "number",
              description: "Maximum number of results to return (optional, defaults to 10)"
            }
          },
          required: ["company", "query"]
        }
      },
      {
        name: "list_accounts_by_type",
        description: "List accounts filtered by account type or root type",
        inputSchema: {
          type: "object",
          properties: {
            company: {
              type: "string",
              description: "Company name (e.g., 'Personal', 'LLC')"
            },
            account_type: {
              type: "string",
              description: "Filter by account type: Bank, Cash, Receivable, Payable, Stock, Tax, etc. (optional)"
            },
            root_type: {
              type: "string",
              description: "Filter by root type: Asset, Liability, Equity, Income, Expense (optional)"
            },
            include_groups: {
              type: "boolean",
              description: "Include group/parent accounts (optional, defaults to false)"
            }
          },
          required: ["company"]
        }
      },
      {
        name: "get_bank_accounts",
        description: "Get list of bank accounts for a company",
        inputSchema: {
          type: "object",
          properties: {
            company: {
              type: "string",
              description: "Company name to filter bank accounts (optional)"
            }
          }
        }
      },
      {
        name: "search_bank_transactions",
        description: "Search bank transactions with various filters for matching against EveryDollar entries or reconciliation",
        inputSchema: {
          type: "object",
          properties: {
            bank_account: {
              type: "string",
              description: "Bank account name to filter (optional)"
            },
            company: {
              type: "string",
              description: "Company name to filter (optional)"
            },
            status: {
              type: "string",
              description: "Transaction status: Unreconciled, Reconciled, Settled, Pending (optional)"
            },
            from_date: {
              type: "string",
              description: "Start date in YYYY-MM-DD format (optional)"
            },
            to_date: {
              type: "string",
              description: "End date in YYYY-MM-DD format (optional)"
            },
            min_amount: {
              type: "number",
              description: "Minimum transaction amount (optional)"
            },
            max_amount: {
              type: "number",
              description: "Maximum transaction amount (optional)"
            }
          }
        }
      },
      {
        name: "batch_import_bank_transactions",
        description: "Batch import bank transactions from CSV/Excel data using ERPNext's create_bank_entries API",
        inputSchema: {
          type: "object",
          properties: {
            columns: {
              type: "array",
              items: { type: "string" },
              description: "Column headers from CSV (e.g., ['Date', 'Deposits', 'Withdrawals', 'Description'])"
            },
            data: {
              type: "array",
              items: {
                type: "array",
                items: {}
              },
              description: "Array of data rows matching the columns"
            },
            bank_account: {
              type: "string",
              description: "Bank account name to associate transactions with"
            }
          },
          required: ["columns", "data", "bank_account"]
        }
      },
      {
        name: "validate_journal_entry",
        description: "Validate a journal entry to ensure debits equal credits before submission",
        inputSchema: {
          type: "object",
          properties: {
            journal_entry: {
              type: "object",
              description: "Journal entry object with posting_date, company, and accounts array"
            }
          },
          required: ["journal_entry"]
        }
      },
      {
        name: "create_journal_entry",
        description: "Create a journal entry with validation. Optionally skip validation if already validated.",
        inputSchema: {
          type: "object",
          properties: {
            journal_entry: {
              type: "object",
              description: "Journal entry object with posting_date, company, accounts array, and optional user_remark"
            },
            skip_validation: {
              type: "boolean",
              description: "Skip validation if the entry was already validated (optional, defaults to false)"
            },
            submit: {
              type: "boolean",
              description: "Automatically submit (post) the journal entry after creation (optional, defaults to false)"
            }
          },
          required: ["journal_entry"]
        }
      },
      {
        name: "submit_journal_entry",
        description: "Submit (post) a draft journal entry",
        inputSchema: {
          type: "object",
          properties: {
            journal_entry_name: {
              type: "string",
              description: "Name/ID of the journal entry to submit (e.g., 'JV-2025-00001')"
            }
          },
          required: ["journal_entry_name"]
        }
      }
    ]
  };
});

/**
 * Handler for tool calls.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "get_documents": {
      if (!erpnext.isAuthenticated()) {
        return {
          content: [{
            type: "text",
            text: "Not authenticated with ERPNext. Please configure API key authentication."
          }],
          isError: true
        };
      }
      
      const doctype = String(request.params.arguments?.doctype);
      const fields = request.params.arguments?.fields as string[] | undefined;
      const filters = request.params.arguments?.filters as Record<string, any> | undefined;
      const limit = request.params.arguments?.limit as number | undefined;
      
      if (!doctype) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Doctype is required"
        );
      }
      
      try {
        const documents = await erpnext.getDocList(doctype, filters, fields, limit);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(documents, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Failed to get ${doctype} documents: ${error?.message || 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
    
    case "create_document": {
      if (!erpnext.isAuthenticated()) {
        return {
          content: [{
            type: "text",
            text: "Not authenticated with ERPNext. Please configure API key authentication."
          }],
          isError: true
        };
      }
      
      const doctype = String(request.params.arguments?.doctype);
      const data = request.params.arguments?.data as Record<string, any> | undefined;
      
      if (!doctype || !data) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Doctype and data are required"
        );
      }
      
      try {
        const result = await erpnext.createDocument(doctype, data);
        return {
          content: [{
            type: "text",
            text: `Created ${doctype}: ${result.name}\n\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Failed to create ${doctype}: ${error?.message || 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
    
    case "update_document": {
      if (!erpnext.isAuthenticated()) {
        return {
          content: [{
            type: "text",
            text: "Not authenticated with ERPNext. Please configure API key authentication."
          }],
          isError: true
        };
      }
      
      const doctype = String(request.params.arguments?.doctype);
      const name = String(request.params.arguments?.name);
      const data = request.params.arguments?.data as Record<string, any> | undefined;
      
      if (!doctype || !name || !data) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Doctype, name, and data are required"
        );
      }
      
      try {
        const result = await erpnext.updateDocument(doctype, name, data);
        return {
          content: [{
            type: "text",
            text: `Updated ${doctype} ${name}\n\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Failed to update ${doctype} ${name}: ${error?.message || 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
    
    case "run_report": {
      if (!erpnext.isAuthenticated()) {
        return {
          content: [{
            type: "text",
            text: "Not authenticated with ERPNext. Please configure API key authentication."
          }],
          isError: true
        };
      }
      
      const reportName = String(request.params.arguments?.report_name);
      const filters = request.params.arguments?.filters as Record<string, any> | undefined;
      
      if (!reportName) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Report name is required"
        );
      }
      
      try {
        const result = await erpnext.runReport(reportName, filters);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Failed to run report ${reportName}: ${error?.message || 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
    
    case "get_doctype_fields": {
      if (!erpnext.isAuthenticated()) {
        return {
          content: [{
            type: "text",
            text: "Not authenticated with ERPNext. Please configure API key authentication."
          }],
          isError: true
        };
      }
      
      const doctype = String(request.params.arguments?.doctype);
      
      if (!doctype) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Doctype is required"
        );
      }
      
      try {
        // Get a sample document to understand the fields
        const documents = await erpnext.getDocList(doctype, {}, ["*"], 1);
        
        if (!documents || documents.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No documents found for ${doctype}. Cannot determine fields.`
            }],
            isError: true
          };
        }
        
        // Extract field names from the first document
        const sampleDoc = documents[0];
        const fields = Object.keys(sampleDoc).map(field => ({
          fieldname: field,
          value: typeof sampleDoc[field],
          sample: sampleDoc[field]?.toString()?.substring(0, 50) || null
        }));
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(fields, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Failed to get fields for ${doctype}: ${error?.message || 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
    
    case "get_doctypes": {
      if (!erpnext.isAuthenticated()) {
        return {
          content: [{
            type: "text",
            text: "Not authenticated with ERPNext. Please configure API key authentication."
          }],
          isError: true
        };
      }
      
      try {
        const doctypes = await erpnext.getAllDocTypes();
        return {
          content: [{
            type: "text",
            text: JSON.stringify(doctypes, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Failed to get DocTypes: ${error?.message || 'Unknown error'}`
          }],
          isError: true
        };
      }
    }

    case "get_companies": {
      if (!erpnext.isAuthenticated()) {
        return {
          content: [{
            type: "text",
            text: "Not authenticated with ERPNext. Please configure API key authentication."
          }],
          isError: true
        };
      }

      try {
        const companies = await erpnext.getCompanies();
        return {
          content: [{
            type: "text",
            text: JSON.stringify(companies, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Failed to get companies: ${error?.message || 'Unknown error'}`
          }],
          isError: true
        };
      }
    }

    case "get_account_tree": {
      if (!erpnext.isAuthenticated()) {
        return {
          content: [{
            type: "text",
            text: "Not authenticated with ERPNext. Please configure API key authentication."
          }],
          isError: true
        };
      }

      const company = String(request.params.arguments?.company);
      const parentAccount = request.params.arguments?.parent_account as string | undefined;
      const includeBalances = request.params.arguments?.include_balances as boolean | undefined;

      if (!company) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Company is required"
        );
      }

      try {
        const tree = await erpnext.getAccountTree(company, parentAccount, includeBalances);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(tree, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Failed to get account tree for ${company}: ${error?.message || 'Unknown error'}`
          }],
          isError: true
        };
      }
    }

    case "get_account_balance": {
      if (!erpnext.isAuthenticated()) {
        return {
          content: [{
            type: "text",
            text: "Not authenticated with ERPNext. Please configure API key authentication."
          }],
          isError: true
        };
      }

      const account = String(request.params.arguments?.account);
      const date = request.params.arguments?.date as string | undefined;

      if (!account) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Account is required"
        );
      }

      try {
        const balance = await erpnext.getAccountBalance(account, date);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              account,
              balance,
              date: date || new Date().toISOString().split('T')[0]
            }, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Failed to get balance for ${account}: ${error?.message || 'Unknown error'}`
          }],
          isError: true
        };
      }
    }

    case "get_trial_balance": {
      if (!erpnext.isAuthenticated()) {
        return {
          content: [{
            type: "text",
            text: "Not authenticated with ERPNext. Please configure API key authentication."
          }],
          isError: true
        };
      }

      const company = String(request.params.arguments?.company);
      const asOfDate = request.params.arguments?.as_of_date as string | undefined;
      const showZeroBalances = request.params.arguments?.show_zero_balances as boolean | undefined || false;

      if (!company) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Company is required"
        );
      }

      try {
        const trialBalance = await erpnext.getTrialBalance(company, asOfDate, showZeroBalances);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(trialBalance, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Failed to get trial balance for ${company}: ${error?.message || 'Unknown error'}`
          }],
          isError: true
        };
      }
    }

    case "search_accounts": {
      if (!erpnext.isAuthenticated()) {
        return {
          content: [{
            type: "text",
            text: "Not authenticated with ERPNext. Please configure API key authentication."
          }],
          isError: true
        };
      }

      const company = String(request.params.arguments?.company);
      const query = String(request.params.arguments?.query);
      const limit = request.params.arguments?.limit as number | undefined || 10;

      if (!company || !query) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Company and query are required"
        );
      }

      try {
        const accounts = await erpnext.searchAccounts(company, query, limit);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(accounts, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Failed to search accounts for ${company}: ${error?.message || 'Unknown error'}`
          }],
          isError: true
        };
      }
    }

    case "list_accounts_by_type": {
      if (!erpnext.isAuthenticated()) {
        return {
          content: [{
            type: "text",
            text: "Not authenticated with ERPNext. Please configure API key authentication."
          }],
          isError: true
        };
      }

      const company = String(request.params.arguments?.company);
      const accountType = request.params.arguments?.account_type as string | undefined;
      const rootType = request.params.arguments?.root_type as string | undefined;
      const includeGroups = request.params.arguments?.include_groups as boolean | undefined || false;

      if (!company) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Company is required"
        );
      }

      try {
        const accounts = await erpnext.listAccountsByType(company, accountType, rootType, includeGroups);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(accounts, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Failed to list accounts by type for ${company}: ${error?.message || 'Unknown error'}`
          }],
          isError: true
        };
      }
    }

    case "get_bank_accounts": {
      if (!erpnext.isAuthenticated()) {
        return {
          content: [{
            type: "text",
            text: "Not authenticated with ERPNext. Please configure API key authentication."
          }],
          isError: true
        };
      }

      const company = request.params.arguments?.company as string | undefined;

      try {
        const accounts = await erpnext.getBankAccounts(company);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(accounts, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Failed to get bank accounts: ${error?.message || 'Unknown error'}`
          }],
          isError: true
        };
      }
    }

    case "search_bank_transactions": {
      if (!erpnext.isAuthenticated()) {
        return {
          content: [{
            type: "text",
            text: "Not authenticated with ERPNext. Please configure API key authentication."
          }],
          isError: true
        };
      }

      const bankAccount = request.params.arguments?.bank_account as string | undefined;
      const company = request.params.arguments?.company as string | undefined;
      const status = request.params.arguments?.status as string | undefined;
      const fromDate = request.params.arguments?.from_date as string | undefined;
      const toDate = request.params.arguments?.to_date as string | undefined;
      const minAmount = request.params.arguments?.min_amount as number | undefined;
      const maxAmount = request.params.arguments?.max_amount as number | undefined;

      try {
        const transactions = await erpnext.searchBankTransactions(
          bankAccount,
          company,
          status,
          fromDate,
          toDate,
          minAmount,
          maxAmount
        );
        return {
          content: [{
            type: "text",
            text: JSON.stringify(transactions, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Failed to search bank transactions: ${error?.message || 'Unknown error'}`
          }],
          isError: true
        };
      }
    }

    case "batch_import_bank_transactions": {
      if (!erpnext.isAuthenticated()) {
        return {
          content: [{
            type: "text",
            text: "Not authenticated with ERPNext. Please configure API key authentication."
          }],
          isError: true
        };
      }

      const columns = request.params.arguments?.columns as string[] | undefined;
      const data = request.params.arguments?.data as any[][] | undefined;
      const bankAccount = request.params.arguments?.bank_account as string | undefined;

      if (!columns || !data || !bankAccount) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "columns, data, and bank_account are required"
        );
      }

      try {
        const result = await erpnext.batchImportBankTransactions(columns, data, bankAccount);
        return {
          content: [{
            type: "text",
            text: `Bank transactions imported successfully:\n\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Failed to import bank transactions: ${error?.message || 'Unknown error'}`
          }],
          isError: true
        };
      }
    }

    case "validate_journal_entry": {
      if (!erpnext.isAuthenticated()) {
        return {
          content: [{
            type: "text",
            text: "Not authenticated with ERPNext. Please configure API key authentication."
          }],
          isError: true
        };
      }

      const journalEntry = request.params.arguments?.journal_entry as JournalEntry | undefined;

      if (!journalEntry) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "journal_entry is required"
        );
      }

      try {
        const validation = await erpnext.validateJournalEntry(journalEntry);

        let summary = `Journal Entry Validation Result:\n\n`;
        summary += `Valid: ${validation.is_valid ? 'Yes' : 'No'}\n`;
        summary += `Total Debit: ${validation.total_debit.toFixed(2)}\n`;
        summary += `Total Credit: ${validation.total_credit.toFixed(2)}\n`;
        summary += `Difference: ${validation.difference.toFixed(2)}\n\n`;

        if (validation.errors.length > 0) {
          summary += `Errors:\n${validation.errors.map(e => `  - ${e}`).join('\n')}\n\n`;
        }

        if (validation.warnings.length > 0) {
          summary += `Warnings:\n${validation.warnings.map(w => `  - ${w}`).join('\n')}\n`;
        }

        return {
          content: [{
            type: "text",
            text: summary
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Failed to validate journal entry: ${error?.message || 'Unknown error'}`
          }],
          isError: true
        };
      }
    }

    case "create_journal_entry": {
      if (!erpnext.isAuthenticated()) {
        return {
          content: [{
            type: "text",
            text: "Not authenticated with ERPNext. Please configure API key authentication."
          }],
          isError: true
        };
      }

      const journalEntry = request.params.arguments?.journal_entry as JournalEntry | undefined;
      const skipValidation = request.params.arguments?.skip_validation as boolean | undefined || false;
      const submit = request.params.arguments?.submit as boolean | undefined || false;

      if (!journalEntry) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "journal_entry is required"
        );
      }

      try {
        const result = await erpnext.createJournalEntry(journalEntry, skipValidation);

        let message = `Journal Entry created successfully: ${result.name}\n\n`;

        if (submit) {
          await erpnext.submitJournalEntry(result.name);
          message += `Journal Entry submitted (posted) successfully.\n\n`;
        }

        message += JSON.stringify(result, null, 2);

        return {
          content: [{
            type: "text",
            text: message
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Failed to create journal entry: ${error?.message || 'Unknown error'}`
          }],
          isError: true
        };
      }
    }

    case "submit_journal_entry": {
      if (!erpnext.isAuthenticated()) {
        return {
          content: [{
            type: "text",
            text: "Not authenticated with ERPNext. Please configure API key authentication."
          }],
          isError: true
        };
      }

      const journalEntryName = request.params.arguments?.journal_entry_name as string | undefined;

      if (!journalEntryName) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "journal_entry_name is required"
        );
      }

      try {
        const result = await erpnext.submitJournalEntry(journalEntryName);
        return {
          content: [{
            type: "text",
            text: `Journal Entry ${journalEntryName} submitted successfully:\n\n${JSON.stringify(result, null, 2)}`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Failed to submit journal entry ${journalEntryName}: ${error?.message || 'Unknown error'}`
          }],
          isError: true
        };
      }
    }

    default:
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${request.params.name}`
      );
  }
});

/**
 * Start the server using stdio transport.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ERPNext MCP server running on stdio');
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
