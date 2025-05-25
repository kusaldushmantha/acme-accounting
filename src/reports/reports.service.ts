import { Injectable, Logger } from '@nestjs/common';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { v4 as uuidV4 } from 'uuid';

type ReportScope = 'accounts' | 'yearly' | 'fs';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  private initialState: Record<ReportScope, string> = {
    accounts: 'idle',
    yearly: 'idle',
    fs: 'idle',
  };

  private statesMap: Map<string, Record<ReportScope, string>> = new Map();

  getReports(jobID: string) {
    return this.statesMap.get(jobID);
  }

  generate() {
    const parentID = uuidV4();
    this.statesMap.set(parentID, this.initialState);

    try {
      void Promise.allSettled([
        this.accounts(parentID),
        this.fs(parentID),
        this.yearly(parentID),
      ]).then((results) => {
        const stateObj = this.statesMap.get(parentID);
        if (!stateObj) {
          this.logger.warn(
            `no state associated with the parent job id: ${parentID}`,
          );
          return;
        }

        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            // Map index to state property
            if (index === 0) stateObj.accounts = result.value;
            else if (index === 1) stateObj.fs = result.value;
            else if (index === 2) stateObj.yearly = result.value;
          } else {
            // Handle rejection, e.g. store error or 'failed'
            if (index === 0) stateObj.accounts = 'failed';
            else if (index === 1) stateObj.fs = 'failed';
            else if (index === 2) stateObj.yearly = 'failed';

            console.error('Report generation error:', result.reason);
          }
        });
      });
    } catch (err) {
      this.logger.error('Unexpected error while scheduling reports', err);
    }

    return {
      jobId: parentID,
      message: 'report generation started',
    };
  }

  async accounts(parentID: string): Promise<string> {
    const stateObj = this.statesMap.get(parentID);
    if (!stateObj) {
      throw new Error(`parent job not found ${parentID}`);
    }
    stateObj.accounts = 'starting';

    const start = performance.now();
    const tmpDir = 'tmp';
    const outputFile = 'out/accounts.csv';
    const accountBalances: Record<string, number> = {};

    try {
      // Read directory asynchronously
      const files = await fs.promises.readdir(tmpDir);

      for (const file of files) {
        if (file.endsWith('.csv')) {
          const content = await fs.promises.readFile(
            path.join(tmpDir, file),
            'utf-8',
          );

          const lines = content.trim().split('\n');
          for (const line of lines) {
            const [, account, , debit, credit] = line.split(',');
            if (!accountBalances[account]) {
              accountBalances[account] = 0;
            }
            accountBalances[account] +=
              parseFloat(String(debit || 0)) - parseFloat(String(credit || 0));
          }
        }
      }

      const output = ['Account,Balance'];
      for (const [account, balance] of Object.entries(accountBalances)) {
        output.push(`${account},${balance.toFixed(2)}`);
      }

      // Write file asynchronously
      await fs.promises.writeFile(outputFile, output.join('\n'));

      const duration = ((performance.now() - start) / 1000).toFixed(2);
      return Promise.resolve(`accounts report generation ${duration}s`);
    } catch (error) {
      this.logger.error(`error while generating accounts report`, error);
      return Promise.reject(
        new Error(`error while generating accounts report`),
      );
    }
  }

  async yearly(parentID: string): Promise<string> {
    const stateObj = this.statesMap.get(parentID);
    if (!stateObj) {
      throw new Error(`parent job not found ${parentID}`);
    }
    stateObj.yearly = 'starting';

    const start = performance.now();
    const tmpDir = 'tmp';
    const outputFile = 'out/yearly.csv';
    const cashByYear: Record<string, number> = {};

    try {
      // Read directory asynchronously
      const files = await fs.promises.readdir(tmpDir);
      for (const file of files) {
        if (file.endsWith('.csv') && file !== 'yearly.csv') {
          const content = await fs.promises.readFile(
            path.join(tmpDir, file),
            'utf-8',
          );

          const lines = content.trim().split('\n');
          for (const line of lines) {
            const [date, account, , debit, credit] = line.split(',');
            if (account === 'Cash') {
              const year = new Date(date).getFullYear();
              if (!cashByYear[year]) {
                cashByYear[year] = 0;
              }
              cashByYear[year] +=
                parseFloat(String(debit || 0)) -
                parseFloat(String(credit || 0));
            }
          }
        }
      }

      const output = ['Financial Year,Cash Balance'];
      Object.keys(cashByYear)
        .sort()
        .forEach((year) => {
          output.push(`${year},${cashByYear[year].toFixed(2)}`);
        });

      // Write file asynchronously
      await fs.promises.writeFile(outputFile, output.join('\n'));

      const duration = ((performance.now() - start) / 1000).toFixed(2);
      return Promise.resolve(`yearly report generation ${duration}s`);
    } catch (error) {
      this.logger.error(`error while generating yearly report`, error);
      return Promise.reject(new Error(`error while generating yearly report`));
    }
  }

  async fs(parentID: string): Promise<string> {
    const stateObj = this.statesMap.get(parentID);
    if (!stateObj) {
      throw new Error(`parent job not found ${parentID}`);
    }
    stateObj.fs = 'starting';

    const start = performance.now();
    const tmpDir = 'tmp';
    const outputFile = 'out/fs.csv';
    const categories = {
      'Income Statement': {
        Revenues: ['Sales Revenue'],
        Expenses: [
          'Cost of Goods Sold',
          'Salaries Expense',
          'Rent Expense',
          'Utilities Expense',
          'Interest Expense',
          'Tax Expense',
        ],
      },
      'Balance Sheet': {
        Assets: [
          'Cash',
          'Accounts Receivable',
          'Inventory',
          'Fixed Assets',
          'Prepaid Expenses',
        ],
        Liabilities: [
          'Accounts Payable',
          'Loan Payable',
          'Sales Tax Payable',
          'Accrued Liabilities',
          'Unearned Revenue',
          'Dividends Payable',
        ],
        Equity: ['Common Stock', 'Retained Earnings'],
      },
    };
    const balances: Record<string, number> = {};
    for (const section of Object.values(categories)) {
      for (const group of Object.values(section)) {
        for (const account of group) {
          balances[account] = 0;
        }
      }
    }

    try {
      // Read directory asynchronously
      const files = await fs.promises.readdir(tmpDir);

      for (const file of files) {
        if (file.endsWith('.csv') && file !== 'fs.csv') {
          // Read file asynchronously
          const content = await fs.promises.readFile(
            path.join(tmpDir, file),
            'utf-8',
          );

          const lines = content.trim().split('\n');
          for (const line of lines) {
            const [, account, , debit, credit] = line.split(',');

            if (Object.prototype.hasOwnProperty.call(balances, account)) {
              balances[account] +=
                parseFloat(String(debit || 0)) -
                parseFloat(String(credit || 0));
            }
          }
        }
      }

      const output: string[] = [];
      output.push('Basic Financial Statement');
      output.push('');
      output.push('Income Statement');

      let totalRevenue = 0;
      let totalExpenses = 0;

      for (const account of categories['Income Statement']['Revenues']) {
        const value = balances[account] || 0;
        output.push(`${account},${value.toFixed(2)}`);
        totalRevenue += value;
      }

      for (const account of categories['Income Statement']['Expenses']) {
        const value = balances[account] || 0;
        output.push(`${account},${value.toFixed(2)}`);
        totalExpenses += value;
      }

      output.push(`Net Income,${(totalRevenue - totalExpenses).toFixed(2)}`);
      output.push('');
      output.push('Balance Sheet');

      let totalAssets = 0;
      let totalLiabilities = 0;
      let totalEquity = 0;

      output.push('Assets');
      for (const account of categories['Balance Sheet']['Assets']) {
        const value = balances[account] || 0;
        output.push(`${account},${value.toFixed(2)}`);
        totalAssets += value;
      }
      output.push(`Total Assets,${totalAssets.toFixed(2)}`);
      output.push('');

      output.push('Liabilities');
      for (const account of categories['Balance Sheet']['Liabilities']) {
        const value = balances[account] || 0;
        output.push(`${account},${value.toFixed(2)}`);
        totalLiabilities += value;
      }
      output.push(`Total Liabilities,${totalLiabilities.toFixed(2)}`);
      output.push('');

      output.push('Equity');
      for (const account of categories['Balance Sheet']['Equity']) {
        const value = balances[account] || 0;
        output.push(`${account},${value.toFixed(2)}`);
        totalEquity += value;
      }
      output.push(
        `Retained Earnings (Net Income),${(totalRevenue - totalExpenses).toFixed(2)}`,
      );
      totalEquity += totalRevenue - totalExpenses;
      output.push(`Total Equity,${totalEquity.toFixed(2)}`);
      output.push('');
      output.push(
        `Assets = Liabilities + Equity, ${totalAssets.toFixed(2)} = ${(totalLiabilities + totalEquity).toFixed(2)}`,
      );

      // Write file asynchronously
      await fs.promises.writeFile(outputFile, output.join('\n'));

      const duration = ((performance.now() - start) / 1000).toFixed(2);
      return Promise.resolve(`fs report generation ${duration}s`);
    } catch (error) {
      this.logger.error(`error while generating fs report`, error);
      return Promise.reject(new Error(`error while generating fs report`));
    }
  }
}
