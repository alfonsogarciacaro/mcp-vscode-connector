import * as vscode from 'vscode';

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
    const uri = vscode.Uri.file(file);
    const document = await vscode.workspace.openTextDocument(uri);

    const position = new vscode.Position(
      Math.max(0, line - 1), // Convert from 1-based to 0-based
      column ? Math.max(0, column - 1) : 0
    );

    const location = new vscode.Location(uri, position);
    const breakpoint = new vscode.SourceBreakpoint(location, true, options?.condition, options?.hitCondition, options?.logMessage);

    vscode.debug.addBreakpoints([breakpoint]);

    this.outputChannel.appendLine(`Set breakpoint at ${file}:${line}${column ? ':' + column : ''}`);

    return {
      id: this.generateBreakpointId(breakpoint),
      file,
      line,
      column,
      enabled: true,
      condition: options?.condition,
      hitCondition: options?.hitCondition,
      logMessage: options?.logMessage
    };
  }

  /**
   * Remove a breakpoint
   */
  public async removeBreakpoint(file: string, line: number, column?: number): Promise<boolean> {
    const targetUri = vscode.Uri.file(file);

    // Find the breakpoint to remove
    const breakpointsToRemove = vscode.debug.breakpoints.filter(bp => {
      if (bp instanceof vscode.SourceBreakpoint) {
        const bpFile = bp.location.uri.fsPath;
        const bpLine = bp.location.range.start.line + 1; // Convert to 1-based
        const bpColumn = bp.location.range.start.character + 1;

        return bpFile === file &&
               bpLine === line &&
               (!column || bpColumn === column);
      }
      return false;
    });

    if (breakpointsToRemove.length > 0) {
      vscode.debug.removeBreakpoints(breakpointsToRemove);
      this.outputChannel.appendLine(`Removed breakpoint at ${file}:${line}${column ? ':' + column : ''}`);
      return true;
    }

    this.outputChannel.appendLine(`No breakpoint found at ${file}:${line}${column ? ':' + column : ''}`);
    return false;
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
   * Evaluate an expression in the current debug context
   */
  public async evaluateExpression(expression: string): Promise<string | null> {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
      this.outputChannel.appendLine('No active debug session');
      return null;
    }

    try {
      const result = await session.customRequest('evaluate', {
        expression,
        frameId: 0, // Use the top frame
        context: 'repl'
      });

      this.outputChannel.appendLine(`Evaluated expression: ${expression} = ${result.result}`);
      return result.result;
    } catch (error) {
      this.outputChannel.appendLine(`Error evaluating expression '${expression}': ${error instanceof Error ? error.message : String(error)}`);
      return null;
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