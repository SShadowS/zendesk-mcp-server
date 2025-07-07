// Logger utility for MCP server debug output
// Outputs to stderr to match MCP server conventions

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private debugEnabled: boolean;
  private prefix: string;

  constructor(prefix: string = 'zendesk-mcp') {
    this.prefix = prefix;
    // Check for DEBUG environment variable
    this.debugEnabled = process.env.DEBUG === 'true' || 
                       process.env.DEBUG === '1' ||
                       process.env.DEBUG === 'zendesk' ||
                       process.env.DEBUG === '*' ||
                       false;
  }

  private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ') : '';
    
    return `[${timestamp}] [${level.toUpperCase()}] ${this.prefix}: ${message}${formattedArgs}`;
  }

  private log(level: LogLevel, message: string, ...args: any[]): void {
    const formatted = this.formatMessage(level, message, ...args);
    
    // Always output to stderr for MCP servers
    if (level === 'error') {
      console.error(formatted);
    } else if (level === 'warn') {
      console.error(formatted);
    } else if (level === 'info') {
      console.error(formatted);
    } else if (level === 'debug' && this.debugEnabled) {
      console.error(formatted);
    }
  }

  debug(message: string, ...args: any[]): void {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.log('error', message, ...args);
  }

  // Check if debug is enabled
  isDebugEnabled(): boolean {
    return this.debugEnabled;
  }
}

// Export singleton instance
export const logger = new Logger();