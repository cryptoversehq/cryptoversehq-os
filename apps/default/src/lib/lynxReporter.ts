/**
 * lynxReporter.ts - Lynx AI Smart Reporting System
 * Generates detailed, access-level-aware reports for each department.
 */

import { realDataConnector } from './realDataConnector';
import { canAccessSection } from './accessControl';
import { deepSeekChat } from './deepSeekClient';

type ReportPeriod = 'today' | 'week' | 'month';

class LynxReporter {
  /** Generate a report for a specific section and period */
  async generateReport(
    section: string,
    accessLevel: string,
    userId: string,
    period: ReportPeriod = 'today',
  ): Promise<string> {
    // Access check
    if (!canAccessSection(accessLevel, section)) {
      return `Access Denied: Your level (${accessLevel}) does not have permission to view ${section} reports.`;
    }

    const data = this.getSectionData(section, accessLevel);
    if (!data) {
      return `No data available for section: ${section}`;
    }

    try {
      const prompt = `Generate a ${period} report for the "${section}" section.

Data: ${JSON.stringify(data).substring(0, 4000)}

Format the report as:

📊 ${section.charAt(0).toUpperCase() + section.slice(1)} Report - ${period}

📈 Key Metrics: (2-3 bullet points with numbers)
📉 Trends: (1-2 observations)
💡 Insights: (1-2 actionable insights)
🎯 Recommendations: (1-2 specific recommendations)

Be concise. Use emojis. Do not fabricate numbers not present in the data.`;

      const response = await deepSeekChat([{ role: 'user', content: prompt }]);
      return response?.content || response || 'Unable to generate report at this time.';
    } catch {
      // Fallback: generate a basic report from raw data
      return this.generateFallbackReport(section, data, period);
    }
  }

  /** Get section-specific data filtered by access level */
  private getSectionData(section: string, accessLevel: string): any {
    const allData = realDataConnector.getAllData();

    switch (section) {
      case 'users':
        return accessLevel === 'super_admin' ? allData.auth : null;
      case 'revenue':
        return accessLevel === 'super_admin' ? allData.subscription : null;
      case 'trading':
        return allData.trading;
      case 'academy':
        return allData.academy;
      case 'portfolio':
        return allData.balance;
      case 'cp':
        return allData.cp;
      case 'exchange':
        return accessLevel !== 'user' ? allData.exchange : null;
      case 'nft':
        return accessLevel !== 'user' ? allData.nft : null;
      case 'security':
        return accessLevel !== 'user' ? allData.sentiment : null;
      case 'system':
        return accessLevel !== 'user'
          ? { auth: allData.auth, trading: allData.trading, academy: allData.academy }
          : null;
      default:
        return allData;
    }
  }

  /** Fallback report when AI is unavailable */
  private generateFallbackReport(section: string, data: any, period: string): string {
    const lines: string[] = [
      `📊 ${section.charAt(0).toUpperCase() + section.slice(1)} Report - ${period}`,
      '',
      '📈 Key Metrics:',
    ];

    // Extract some basic metrics from the data
    if (data) {
      const keys = Object.keys(data).slice(0, 5);
      for (const key of keys) {
        const val = data[key];
        if (typeof val === 'number') {
          lines.push(`  • ${key}: ${val.toLocaleString()}`);
        } else if (typeof val === 'string') {
          lines.push(`  • ${key}: ${val}`);
        }
      }
    } else {
      lines.push('  • No data available');
    }

    lines.push('', '💡 Note: AI analysis is currently unavailable. Basic metrics shown above.');
    return lines.join('\n');
  }

  /** Generate a report for the command console by natural language command */
  parseCommand(command: string): { section: string; period: ReportPeriod } | null {
    const lower = command.toLowerCase();

    // Match patterns like "report trading today" or "show me weekly report for academy"
    const sections = ['trading', 'academy', 'portfolio', 'cp', 'users', 'revenue', 'security', 'system', 'exchange', 'nft'];
    const periods: ReportPeriod[] = ['today', 'week', 'month'];

    const foundSection = sections.find((s) => lower.includes(s)) || 'trading';
    const foundPeriod = periods.find((p) => lower.includes(p)) || 'today';

    return { section: foundSection, period: foundPeriod };
  }
}

export const lynxReporter = new LynxReporter();
