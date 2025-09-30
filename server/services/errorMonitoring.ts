import { emailService } from './email';

interface ErrorDetails {
  error: Error;
  context?: {
    userId?: string;
    username?: string;
    endpoint?: string;
    method?: string;
    projectId?: string;
    [key: string]: any;
  };
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

interface ErrorLog {
  timestamp: Date;
  count: number;
}

class ErrorMonitoringService {
  private errorCache: Map<string, ErrorLog> = new Map();
  private readonly RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
  private readonly MAX_EMAILS_PER_WINDOW = 5; // Max 5 emails per error type per hour
  private adminEmail: string;

  constructor() {
    this.adminEmail = process.env.ADMIN_EMAIL || 'admin@neonvideo.ai';
    this.cleanupOldErrors();
  }

  private cleanupOldErrors() {
    // Clean up old error logs every hour
    setInterval(() => {
      const now = Date.now();
      for (const [key, log] of this.errorCache.entries()) {
        if (now - log.timestamp.getTime() > this.RATE_LIMIT_WINDOW) {
          this.errorCache.delete(key);
        }
      }
    }, this.RATE_LIMIT_WINDOW);
  }

  private getErrorKey(error: Error, context?: any): string {
    // Create a unique key for this error type
    return `${error.name}:${error.message.substring(0, 50)}:${context?.endpoint || 'unknown'}`;
  }

  private shouldSendEmail(errorKey: string): boolean {
    const log = this.errorCache.get(errorKey);
    const now = new Date();

    if (!log) {
      this.errorCache.set(errorKey, { timestamp: now, count: 1 });
      return true;
    }

    const timeSinceFirst = now.getTime() - log.timestamp.getTime();
    
    if (timeSinceFirst > this.RATE_LIMIT_WINDOW) {
      // Reset the counter after the window expires
      this.errorCache.set(errorKey, { timestamp: now, count: 1 });
      return true;
    }

    if (log.count < this.MAX_EMAILS_PER_WINDOW) {
      log.count++;
      return true;
    }

    // Rate limit exceeded
    return false;
  }

  private formatErrorEmail(details: ErrorDetails): { subject: string; html: string } {
    const { error, context, severity = 'medium' } = details;
    const timestamp = new Date().toISOString();

    const severityEmoji = {
      low: '⚠️',
      medium: '🔴',
      high: '🚨',
      critical: '💥'
    };

    const subject = `${severityEmoji[severity]} Error Alert: ${error.name} - NeonVideo.ai`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none; }
            .error-box { background: #fff; border-left: 4px solid #dc2626; padding: 15px; margin: 15px 0; }
            .context-box { background: #fff; border-left: 4px solid #2563eb; padding: 15px; margin: 15px 0; }
            .stack-trace { background: #1e293b; color: #e2e8f0; padding: 15px; border-radius: 4px; overflow-x: auto; font-family: monospace; font-size: 12px; }
            .severity { display: inline-block; padding: 5px 10px; border-radius: 4px; font-weight: bold; }
            .severity-critical { background: #dc2626; color: white; }
            .severity-high { background: #ea580c; color: white; }
            .severity-medium { background: #f59e0b; color: white; }
            .severity-low { background: #10b981; color: white; }
            .metadata { color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">🚨 Application Error Detected</h1>
              <p style="margin: 5px 0 0 0;">NeonVideo.ai Error Monitoring</p>
            </div>
            <div class="content">
              <p class="metadata"><strong>Timestamp:</strong> ${timestamp}</p>
              <p class="metadata"><strong>Severity:</strong> <span class="severity severity-${severity}">${severity.toUpperCase()}</span></p>
              
              <div class="error-box">
                <h2 style="margin-top: 0; color: #dc2626;">Error Details</h2>
                <p><strong>Type:</strong> ${error.name}</p>
                <p><strong>Message:</strong> ${error.message}</p>
              </div>

              ${context ? `
              <div class="context-box">
                <h2 style="margin-top: 0; color: #2563eb;">Context Information</h2>
                ${context.userId ? `<p><strong>User ID:</strong> ${context.userId}</p>` : ''}
                ${context.username ? `<p><strong>Username:</strong> ${context.username}</p>` : ''}
                ${context.endpoint ? `<p><strong>Endpoint:</strong> ${context.endpoint}</p>` : ''}
                ${context.method ? `<p><strong>Method:</strong> ${context.method}</p>` : ''}
                ${context.projectId ? `<p><strong>Project ID:</strong> ${context.projectId}</p>` : ''}
                ${Object.entries(context)
                  .filter(([key]) => !['userId', 'username', 'endpoint', 'method', 'projectId'].includes(key))
                  .map(([key, value]) => `<p><strong>${key}:</strong> ${JSON.stringify(value)}</p>`)
                  .join('')}
              </div>
              ` : ''}

              ${error.stack ? `
              <div>
                <h3>Stack Trace</h3>
                <div class="stack-trace">${error.stack.replace(/\n/g, '<br>')}</div>
              </div>
              ` : ''}

              <div style="margin-top: 20px; padding: 15px; background: #fef3c7; border-radius: 4px;">
                <p style="margin: 0;"><strong>⚡ Quick Actions:</strong></p>
                <ul style="margin: 10px 0 0 0;">
                  <li>Check application logs for more details</li>
                  <li>Review recent deployments</li>
                  <li>Monitor user impact</li>
                </ul>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    return { subject, html };
  }

  async notifyError(details: ErrorDetails): Promise<void> {
    try {
      const { error, context, severity = 'medium' } = details;
      
      // Log to console first
      console.error('🚨 ERROR CAUGHT BY MONITORING:', {
        name: error.name,
        message: error.message,
        severity,
        context,
        stack: error.stack
      });

      // Check if we should send email based on rate limiting
      const errorKey = this.getErrorKey(error, context);
      if (!this.shouldSendEmail(errorKey)) {
        console.log(`📧 Email rate limit reached for error: ${errorKey}`);
        return;
      }

      // Format and send email
      const { subject, html } = this.formatErrorEmail(details);
      
      await emailService.sendEmail({
        to: this.adminEmail,
        subject,
        html
      });

      console.log(`📧 Error notification email sent to ${this.adminEmail}`);
    } catch (emailError) {
      // Don't let email failures break the application
      console.error('Failed to send error notification email:', emailError);
    }
  }

  // Specific error handlers for different scenarios
  async notifyAPIError(error: Error, endpoint: string, method: string, context?: any): Promise<void> {
    await this.notifyError({
      error,
      context: { ...context, endpoint, method },
      severity: 'high'
    });
  }

  async notifyPaymentError(error: Error, context?: any): Promise<void> {
    await this.notifyError({
      error,
      context: { ...context, errorType: 'payment' },
      severity: 'critical'
    });
  }

  async notifyVideoGenerationError(error: Error, projectId: string, context?: any): Promise<void> {
    await this.notifyError({
      error,
      context: { ...context, projectId, errorType: 'video_generation' },
      severity: 'medium'
    });
  }

  async notifyDatabaseError(error: Error, context?: any): Promise<void> {
    await this.notifyError({
      error,
      context: { ...context, errorType: 'database' },
      severity: 'critical'
    });
  }

  async notifyExternalServiceError(error: Error, service: string, context?: any): Promise<void> {
    await this.notifyError({
      error,
      context: { ...context, service, errorType: 'external_service' },
      severity: 'high'
    });
  }
}

export const errorMonitoring = new ErrorMonitoringService();
