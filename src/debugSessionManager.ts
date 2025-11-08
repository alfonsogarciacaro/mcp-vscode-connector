import * as vscode from 'vscode';
import { DebugConsentManager } from './debugConsentManager';
import { SecurityUtils } from './securityUtils';

export interface DebugSessionInfo {
  id: string;
  name: string;
  type: string;
  configuration: vscode.DebugConfiguration;
  workspaceFolder?: string;
}

export interface BreakpointInfo {
  id: string;
  file: string;
  line: number;
  column?: number;
  enabled: boolean;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
}

export interface VariableInfo {
  name: string;
  value: string;
  type?: string;
  variablesReference?: number;
  presentationHint?: string;
}

export interface LaunchConfigurationInfo {
  name: string;
  type: string;
  request: string;
  program?: string;
  args?: string[];
  cwd?: string;
  env?: { [key: string]: string };
  console?: string;
  internalConsoleOptions?: string;
  [key: string]: any;
}

export class DebugSessionManager {
  private disposables: vscode.Disposable[] = [];
  private outputChannel: vscode.OutputChannel;
  private activeSessions: Map<string, vscode.DebugSession> = new Map();

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.disposables.push(
      vscode.debug.onDidStartDebugSession(session => {
        this.activeSessions.set(session.id, session);
        this.outputChannel.appendLine(`Debug session started: ${session.name} (${session.id})`);
      }),
      vscode.debug.onDidTerminateDebugSession(session => {
        this.activeSessions.delete(session.id);
        this.outputChannel.appendLine(`Debug session terminated: ${session.name} (${session.id})`);
      }),
      vscode.debug.onDidChangeBreakpoints(event => {
        this.outputChannel.appendLine(`Breakpoints changed: ${JSON.stringify(event)}`);
      })
    );
  }

  /**
   * Get all active debug sessions
   */
  public getActiveSessions(): DebugSessionInfo[] {
    const sessions = Array.from(this.activeSessions.values());
    return sessions.map(session => this.sessionToInfo(session));
  }

  /**
   * Get the current active debug session
   */
  public getActiveSession(): DebugSessionInfo | null {
    const session = vscode.debug.activeDebugSession;
    return session ? this.sessionToInfo(session) : null;
  }

  /**
   * Get all breakpoints in the workspace
   */
  public getAllBreakpoints(): BreakpointInfo[] {
    const breakpoints: BreakpointInfo[] = [];

    vscode.debug.breakpoints.forEach(breakpoint => {
      if (breakpoint instanceof vscode.SourceBreakpoint) {
        const bp: BreakpointInfo = {
          id: this.generateBreakpointId(breakpoint),
          file: breakpoint.location.uri.fsPath,
          line: breakpoint.location.range.start.line + 1, // Convert to 1-based
          column: breakpoint.location.range.start.character + 1,
          enabled: breakpoint.enabled,
          condition: breakpoint.condition,
          hitCondition: breakpoint.hitCondition,
          logMessage: breakpoint.logMessage
        };
        breakpoints.push(bp);
      }
    });

    return breakpoints;
  }

  /**
   * Set a breakpoint in a file
   */
  public async setBreakpoint(file: string, line: number, column?: number, options?: {
    condition?: string;
    hitCondition?: string;
    logMessage?: string;
  }): Promise<BreakpointInfo> {
    try {
      // Input validation
      const fileValidation = SecurityUtils.validateFilePath(file);
      if (!fileValidation.isValid) {
        const error = SecurityUtils.createSafeError('setBreakpoint', fileValidation.error);
        this.outputChannel.appendLine(`[SECURITY] Invalid file path for breakpoint: ${fileValidation.error}`);
        throw new Error(error);
      }

      const lineValidation = SecurityUtils.validateLineNumber(line);
      if (!lineValidation.isValid) {
        const error = SecurityUtils.createSafeError('setBreakpoint', lineValidation.error);
        this.outputChannel.appendLine(`[SECURITY] Invalid line number for breakpoint: ${lineValidation.error}`);
        throw new Error(error);
      }

      let validatedColumn: number | undefined;
      if (column !== undefined) {
        const columnValidation = SecurityUtils.validateColumnNumber(column);
        if (!columnValidation.isValid) {
          const error = SecurityUtils.createSafeError('setBreakpoint', columnValidation.error);
          this.outputChannel.appendLine(`[SECURITY] Invalid column number for breakpoint: ${columnValidation.error}`);
          throw new Error(error);
        }
        validatedColumn = column;
      }

      let sanitizedCondition: string | undefined;
      if (options?.condition) {
        const conditionValidation = SecurityUtils.validateBreakpointCondition(options.condition);
        if (!conditionValidation.isValid) {
          const error = SecurityUtils.createSafeError('setBreakpoint', conditionValidation.error);
          this.outputChannel.appendLine(`[SECURITY] Invalid breakpoint condition: ${conditionValidation.error}`);
          throw new Error(error);
        }
        sanitizedCondition = conditionValidation.sanitizedCondition;
      }

      let sanitizedLogMessage: string | undefined;
      if (options?.logMessage) {
        const logValidation = SecurityUtils.validateLogMessage(options.logMessage);
        if (!logValidation.isValid) {
          const error = SecurityUtils.createSafeError('setBreakpoint', logValidation.error);
          this.outputChannel.appendLine(`[SECURITY] Invalid breakpoint log message: ${logValidation.error}`);
          throw new Error(error);
        }
        sanitizedLogMessage = logValidation.sanitizedMessage;
      }

      // Check if file exists in workspace
      const fileExists = await SecurityUtils.fileExistsInWorkspace(fileValidation.sanitizedPath);
      if (!fileExists) {
        const error = SecurityUtils.createSafeError('setBreakpoint', 'File not found in workspace');
        this.outputChannel.appendLine(`[SECURITY] Attempted to set breakpoint in non-existent file: ${fileValidation.sanitizedPath}`);
        throw new Error(error);
      }

      const uri = vscode.Uri.file(fileValidation.sanitizedPath);
      const document = await vscode.workspace.openTextDocument(uri);

      const position = new vscode.Position(
        Math.max(0, line - 1), // Convert from 1-based to 0-based
        validatedColumn ? Math.max(0, validatedColumn - 1) : 0
      );

      const location = new vscode.Location(uri, position);
      const breakpoint = new vscode.SourceBreakpoint(location, true, sanitizedCondition, options?.hitCondition, sanitizedLogMessage);

      vscode.debug.addBreakpoints([breakpoint]);

      const relativePath = SecurityUtils.getRelativePath(fileValidation.sanitizedPath);
      this.outputChannel.appendLine(`[SECURITY] Set breakpoint at ${relativePath}:${line}${validatedColumn ? ':' + validatedColumn : ''}`);

      return {
        id: this.generateBreakpointId(breakpoint),
        file: fileValidation.sanitizedPath,
        line,
        column: validatedColumn,
        enabled: true,
        condition: sanitizedCondition,
        hitCondition: options?.hitCondition,
        logMessage: sanitizedLogMessage
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('SECURITY')) {
        throw error;
      }
      // Re-throw any other errors
      this.outputChannel.appendLine(`Error setting breakpoint: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Remove a breakpoint
   */
  public async removeBreakpoint(file: string, line: number, column?: number): Promise<boolean> {
    try {
      // Input validation
      const fileValidation = SecurityUtils.validateFilePath(file);
      if (!fileValidation.isValid) {
        const error = SecurityUtils.createSafeError('removeBreakpoint', fileValidation.error);
        this.outputChannel.appendLine(`[SECURITY] Invalid file path for breakpoint removal: ${fileValidation.error}`);
        throw new Error(error);
      }

      const lineValidation = SecurityUtils.validateLineNumber(line);
      if (!lineValidation.isValid) {
        const error = SecurityUtils.createSafeError('removeBreakpoint', lineValidation.error);
        this.outputChannel.appendLine(`[SECURITY] Invalid line number for breakpoint removal: ${lineValidation.error}`);
        throw new Error(error);
      }

      let validatedColumn: number | undefined;
      if (column !== undefined) {
        const columnValidation = SecurityUtils.validateColumnNumber(column);
        if (!columnValidation.isValid) {
          const error = SecurityUtils.createSafeError('removeBreakpoint', columnValidation.error);
          this.outputChannel.appendLine(`[SECURITY] Invalid column number for breakpoint removal: ${columnValidation.error}`);
          throw new Error(error);
        }
        validatedColumn = column;
      }

      const targetUri = vscode.Uri.file(fileValidation.sanitizedPath);

      // Find the breakpoint to remove
      const breakpointsToRemove = vscode.debug.breakpoints.filter(bp => {
        if (bp instanceof vscode.SourceBreakpoint) {
          const bpFile = bp.location.uri.fsPath;
          const bpLine = bp.location.range.start.line + 1; // Convert to 1-based
          const bpColumn = bp.location.range.start.character + 1;

          return bpFile === fileValidation.sanitizedPath &&
                 bpLine === line &&
                 (!validatedColumn || bpColumn === validatedColumn);
        }
        return false;
      });

      if (breakpointsToRemove.length > 0) {
        vscode.debug.removeBreakpoints(breakpointsToRemove);
        const relativePath = SecurityUtils.getRelativePath(fileValidation.sanitizedPath);
        this.outputChannel.appendLine(`[SECURITY] Removed breakpoint at ${relativePath}:${line}${validatedColumn ? ':' + validatedColumn : ''}`);
        return true;
      }

      const relativePath = SecurityUtils.getRelativePath(fileValidation.sanitizedPath);
      this.outputChannel.appendLine(`No breakpoint found at ${relativePath}:${line}${validatedColumn ? ':' + validatedColumn : ''}`);
      return false;
    } catch (error) {
      if (error instanceof Error && error.message.includes('SECURITY')) {
        throw error;
      }
      // Re-throw any other errors
      this.outputChannel.appendLine(`Error removing breakpoint: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get variables in the current scope
   */
  public async getVariables(frameId?: number): Promise<VariableInfo[]> {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
      this.outputChannel.appendLine('No active debug session');
      return [];
    }

    try {
      // Get the current stack frame if not specified
      if (frameId === undefined) {
        const stackTrace = await session.customRequest('stackTrace', { threadId: 1 });
        if (stackTrace.stackFrames.length > 0) {
          frameId = stackTrace.stackFrames[0].id;
        }
      }

      if (frameId === undefined) {
        this.outputChannel.appendLine('No stack frame available');
        return [];
      }

      const variables = await session.customRequest('variables', {
        variablesReference: frameId
      });

      return variables.variables.map((variable: any) => ({
        name: variable.name,
        value: variable.value,
        type: variable.type,
        variablesReference: variable.variablesReference,
        presentationHint: variable.presentationHint
      }));

    } catch (error) {
      this.outputChannel.appendLine(`Error getting variables: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Step execution
   */
  public async step(stepType: 'over' | 'into' | 'out'): Promise<boolean> {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
      this.outputChannel.appendLine('No active debug session');
      return false;
    }

    try {
      await session.customRequest(`step${stepType.charAt(0).toUpperCase() + stepType.slice(1)}`, { threadId: 1 });
      this.outputChannel.appendLine(`Step ${stepType} executed`);
      return true;
    } catch (error) {
      this.outputChannel.appendLine(`Error stepping ${stepType}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Continue execution
   */
  public async continue(): Promise<boolean> {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
      this.outputChannel.appendLine('No active debug session');
      return false;
    }

    try {
      await session.customRequest('continue', { threadId: 1 });
      this.outputChannel.appendLine('Execution continued');
      return true;
    } catch (error) {
      this.outputChannel.appendLine(`Error continuing execution: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Get call stack information
   */
  public async getCallStack(): Promise<any[]> {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
      this.outputChannel.appendLine('No active debug session');
      return [];
    }

    try {
      const stackTrace = await session.customRequest('stackTrace', { threadId: 1 });
      return stackTrace.stackFrames.map((frame: any) => ({
        id: frame.id,
        name: frame.name,
        source: frame.source,
        line: frame.line,
        column: frame.column
      }));
    } catch (error) {
      this.outputChannel.appendLine(`Error getting call stack: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  
  /**
   * Get all available launch configurations from .vscode/launch.json
   */
  public async getLaunchConfigurations(): Promise<LaunchConfigurationInfo[]> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        this.outputChannel.appendLine('No workspace folders found');
        return [];
      }

      const configurations: LaunchConfigurationInfo[] = [];

      for (const folder of workspaceFolders) {
        const launchConfigs = await this.getLaunchConfigurationsForFolder(folder);
        configurations.push(...launchConfigs);
      }

      return configurations;
    } catch (error) {
      this.outputChannel.appendLine(`Error getting launch configurations: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Start debugging with a specific launch configuration
   */
  public async startDebugging(configurationName: string, workspaceFolder?: string): Promise<boolean> {
    try {
      // Input validation
      const configValidation = SecurityUtils.validateConfigurationName(configurationName);
      if (!configValidation.isValid) {
        const error = SecurityUtils.createSafeError('startDebugging', configValidation.error);
        this.outputChannel.appendLine(`[SECURITY] Invalid configuration name: ${configValidation.error}`);
        throw new Error(error);
      }

      // Check if we have consent to use this configuration
      const canUse = await DebugConsentManager.canUseConfiguration(configurationName);
      if (!canUse) {
        this.outputChannel.appendLine(`[SECURITY] Debug configuration "${configurationName}" usage denied by user consent`);
        return false;
      }

      let folder: vscode.WorkspaceFolder | undefined;

      if (workspaceFolder) {
        // Validate workspace folder path if provided
        const folderValidation = SecurityUtils.validateFilePath(workspaceFolder);
        if (!folderValidation.isValid) {
          const error = SecurityUtils.createSafeError('startDebugging', `Invalid workspace folder: ${folderValidation.error}`);
          this.outputChannel.appendLine(`[SECURITY] Invalid workspace folder: ${folderValidation.error}`);
          throw new Error(error);
        }
        folder = vscode.workspace.workspaceFolders?.find(f => f.uri.fsPath === folderValidation.sanitizedPath);
      } else {
        folder = vscode.workspace.workspaceFolders?.[0]; // Use first workspace folder
      }

      if (!folder) {
        this.outputChannel.appendLine('No workspace folder found');
        return false;
      }

      this.outputChannel.appendLine(`[SECURITY] Starting debug session with approved configuration: ${configurationName}`);
      const success = await vscode.debug.startDebugging(folder, configurationName);

      if (success) {
        this.outputChannel.appendLine(`Started debugging with configuration: ${configurationName}`);
      } else {
        this.outputChannel.appendLine(`Failed to start debugging with configuration: ${configurationName}`);
      }

      return success;
    } catch (error) {
      if (error instanceof Error && error.message.includes('SECURITY')) {
        throw error;
      }
      this.outputChannel.appendLine(`Error starting debug session: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Stop the current active debug session
   */
  public async stopDebugging(): Promise<boolean> {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
      this.outputChannel.appendLine('No active debug session to stop');
      return false;
    }

    try {
      await vscode.debug.stopDebugging(session);
      this.outputChannel.appendLine(`Stopped debug session: ${session.name}`);
      return true;
    } catch (error) {
      this.outputChannel.appendLine(`Error stopping debug session: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private async getLaunchConfigurationsForFolder(folder: vscode.WorkspaceFolder): Promise<LaunchConfigurationInfo[]> {
    try {
      const launchJsonPath = vscode.Uri.joinPath(folder.uri, '.vscode', 'launch.json');

      try {
        const launchJsonContent = await vscode.workspace.fs.readFile(launchJsonPath);
        const launchJson = JSON.parse(Buffer.from(launchJsonContent).toString('utf8'));

        if (launchJson.configurations && Array.isArray(launchJson.configurations)) {
          return launchJson.configurations.map((config: any) => ({
            name: config.name || 'Unnamed Configuration',
            type: config.type || 'unknown',
            request: config.request || 'unknown',
            program: config.program,
            args: config.args,
            cwd: config.cwd,
            env: config.env,
            console: config.console,
            internalConsoleOptions: config.internalConsoleOptions,
            ...config
          }));
        }
      } catch (readError) {
        this.outputChannel.appendLine(`Could not read launch.json for folder ${folder.name}: ${readError instanceof Error ? readError.message : String(readError)}`);
      }

      return [];
    } catch (error) {
      this.outputChannel.appendLine(`Error getting launch configurations for folder ${folder.name}: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  private sessionToInfo(session: vscode.DebugSession): DebugSessionInfo {
    return {
      id: session.id,
      name: session.name,
      type: session.type,
      configuration: session.configuration,
      workspaceFolder: session.workspaceFolder?.name
    };
  }

  private generateBreakpointId(breakpoint: vscode.SourceBreakpoint): string {
    return `${breakpoint.location.uri.fsPath}:${breakpoint.location.range.start.line}:${breakpoint.location.range.start.character}`;
  }

  public dispose() {
    this.disposables.forEach(d => d.dispose());
  }
}