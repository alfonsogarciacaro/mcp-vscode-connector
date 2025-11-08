import * as vscode from 'vscode';
import * as path from 'path';

export class SecurityUtils {
  private static readonly MAX_FILE_PATH_LENGTH = 4096;
  private static readonly MAX_LINE_NUMBER = 1000000;
  private static readonly MAX_COLUMN_NUMBER = 1000;
  private static readonly MAX_CONDITION_LENGTH = 1000;
  private static readonly MAX_LOG_MESSAGE_LENGTH = 500;

  /**
   * Validate and sanitize a file path to prevent directory traversal attacks
   */
  public static validateFilePath(filePath: string): { isValid: boolean; sanitizedPath: string; error?: string } {
    if (!filePath || typeof filePath !== 'string') {
      return {
        isValid: false,
        sanitizedPath: '',
        error: 'File path must be a non-empty string'
      };
    }

    if (filePath.length > this.MAX_FILE_PATH_LENGTH) {
      return {
        isValid: false,
        sanitizedPath: '',
        error: 'File path too long'
      };
    }

    // Check for directory traversal patterns
    const normalizedPath = path.normalize(filePath);

    if (normalizedPath.includes('..') || normalizedPath.includes('~')) {
      return {
        isValid: false,
        sanitizedPath: '',
        error: 'Path traversal detected'
      };
    }

    // Additional security checks
    if (filePath.includes('\0') || filePath.includes('\r') || filePath.includes('\n')) {
      return {
        isValid: false,
        sanitizedPath: '',
        error: 'Invalid characters in path'
      };
    }

    // If it's a relative path, make it absolute relative to workspace root
    if (!path.isAbsolute(normalizedPath)) {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        const absolutePath = path.join(workspaceFolder.uri.fsPath, normalizedPath);
        return { isValid: true, sanitizedPath: absolutePath };
      }
    }

    return { isValid: true, sanitizedPath: normalizedPath };
  }

  /**
   * Validate line number
   */
  public static validateLineNumber(lineNumber: number): { isValid: boolean; error?: string } {
    if (!Number.isInteger(lineNumber) || lineNumber < 1) {
      return {
        isValid: false,
        error: 'Line number must be a positive integer'
      };
    }

    if (lineNumber > this.MAX_LINE_NUMBER) {
      return {
        isValid: false,
        error: 'Line number too large'
      };
    }

    return { isValid: true };
  }

  /**
   * Validate column number
   */
  public static validateColumnNumber(columnNumber: number): { isValid: boolean; error?: string } {
    if (!Number.isInteger(columnNumber) || columnNumber < 1) {
      return {
        isValid: false,
        error: 'Column number must be a positive integer'
      };
    }

    if (columnNumber > this.MAX_COLUMN_NUMBER) {
      return {
        isValid: false,
        error: 'Column number too large'
      };
    }

    return { isValid: true };
  }

  /**
   * Validate and sanitize breakpoint condition
   */
  public static validateBreakpointCondition(condition: string): { isValid: boolean; sanitizedCondition: string; error?: string } {
    if (!condition || typeof condition !== 'string') {
      return { isValid: true, sanitizedCondition: '' };
    }

    if (condition.length > this.MAX_CONDITION_LENGTH) {
      return {
        isValid: false,
        sanitizedCondition: '',
        error: 'Breakpoint condition too long'
      };
    }

    // Remove potentially dangerous characters
    const sanitized = condition
      .replace(/[\r\n]/g, '') // Remove line breaks
      .replace(/[<>]/g, '')   // Remove potential HTML-like injection
      .trim();

    return { isValid: true, sanitizedCondition: sanitized };
  }

  /**
   * Validate and sanitize log message
   */
  public static validateLogMessage(logMessage: string): { isValid: boolean; sanitizedMessage: string; error?: string } {
    if (!logMessage || typeof logMessage !== 'string') {
      return { isValid: true, sanitizedMessage: '' };
    }

    if (logMessage.length > this.MAX_LOG_MESSAGE_LENGTH) {
      return {
        isValid: false,
        sanitizedMessage: '',
        error: 'Log message too long'
      };
    }

    // Remove potentially dangerous characters
    const sanitized = logMessage
      .replace(/[\r\n]/g, '') // Remove line breaks
      .replace(/[<>]/g, '')   // Remove potential HTML-like injection
      .trim();

    return { isValid: true, sanitizedMessage: sanitized };
  }

  /**
   * Validate debug configuration name
   */
  public static validateConfigurationName(configName: string): { isValid: boolean; error?: string } {
    if (!configName || typeof configName !== 'string') {
      return {
        isValid: false,
        error: 'Configuration name must be a non-empty string'
      };
    }

    if (configName.length > 100) {
      return {
        isValid: false,
        error: 'Configuration name too long'
      };
    }

    // Check for dangerous characters
    if (/[\0\r\n<>]/.test(configName)) {
      return {
        isValid: false,
        error: 'Invalid characters in configuration name'
      };
    }

    return { isValid: true };
  }

  /**
   * Create a safe error message that doesn't leak sensitive information
   */
  public static createSafeError(operation: string, detailedError?: string): string {
    // Log the detailed error for debugging purposes
    if (detailedError) {
      console.error(`[MCP Debug Security] ${operation} failed: ${detailedError}`);
    }

    // Return a generic error message to the client
    return `Operation "${operation}" failed due to invalid input or security restrictions`;
  }

  /**
   * Check if a file exists within the workspace
   */
  public static async fileExistsInWorkspace(filePath: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(filePath);
      // Check if the file is within any workspace folder
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
      if (!workspaceFolder) {
        return false;
      }

      // Check if file exists
      const stat = await vscode.workspace.fs.stat(uri);
      return stat.type === vscode.FileType.File;
    } catch {
      return false;
    }
  }

  /**
   * Get the relative path from workspace root for logging
   */
  public static getRelativePath(filePath: string): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      return path.relative(workspaceFolder.uri.fsPath, filePath);
    }
    return filePath;
  }
}