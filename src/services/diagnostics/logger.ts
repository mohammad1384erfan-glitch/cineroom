export type LogCategory = 'SYSTEM' | 'REALTIME' | 'WEBRTC' | 'ERROR';

export interface LogEntry {
  timestamp: string;
  category: LogCategory;
  message: string;
  data?: any;
}

type LogListener = (entry: LogEntry) => void;

class DiagnosticsLogger {
  private logs: LogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private maxLogs = 200;

  private log(category: LogCategory, message: string, data?: any) {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    const entry: LogEntry = { timestamp, category, message, data };
    
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    
    this.listeners.forEach((listener) => {
      try {
        listener(entry);
      } catch (e) {
        console.error('Error in logger listener:', e);
      }
    });

    // Mirror to standard developer console in clean format
    const consoleColor = {
      SYSTEM: 'color: #9ca3af',
      REALTIME: 'color: #3b82f6',
      WEBRTC: 'color: #10b981',
      ERROR: 'color: #ef4444; font-weight: bold',
    }[category];

    console.log(`%c[${timestamp}] [${category}] ${message}`, consoleColor, data ? data : '');
  }

  public info(message: string, data?: any) {
    this.log('SYSTEM', message, data);
  }

  public realtime(message: string, data?: any) {
    this.log('REALTIME', message, data);
  }

  public webrtc(message: string, data?: any) {
    this.log('WEBRTC', message, data);
  }

  public error(message: string, data?: any) {
    this.log('ERROR', message, data);
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public clear() {
    this.logs = [];
    this.info('Diagnostics logs cleared.');
  }
}

export const logger = new DiagnosticsLogger();
export default logger;
