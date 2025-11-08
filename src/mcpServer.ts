import * as vscode from 'vscode';
import express from "express";
import { z } from 'zod';
import { Server } from 'http';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { DebugSessionManager } from './debugSessionManager';

export function createMcpServer(outputChannel: vscode.OutputChannel, port: number): Promise<Server> {
  const debugManager = new DebugSessionManager(outputChannel);

  const mcpServer = new McpServer({
    name: "vscode-connector",
    version: "0.0.1"
  }, {
    capabilities: {
      tools: {},
      logging: {
        level: 'info'
      }
    },
  });

  // Add debugging tools
  mcpServer.registerTool("list_debug_sessions", {
    description: "List all active debug sessions (SECURE: Read-only operation)",
  }, async () => {
    const sessions = debugManager.getActiveSessions();
    outputChannel.appendLine(`[AUDIT] AI agent requested active debug sessions list. Found ${sessions.length} sessions.`);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(sessions, null, 2)
      }]
    };
  });

  mcpServer.registerTool("get_active_session_info", {
    description: "Get information about the currently active debug session (SECURE: Read-only operation)",
  }, async () => {
    const session = debugManager.getActiveSession();

    if (!session) {
      outputChannel.appendLine(`[AUDIT] AI agent requested active session info - no active session found`);
      return {
        content: [{
          type: "text",
          text: "No active debug session"
        }]
      };
    }

    outputChannel.appendLine(`[AUDIT] AI agent requested active session info for session: ${session.name} (${session.id})`);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(session, null, 2)
      }]
    };
  });

  mcpServer.registerTool("list_breakpoints", {
    description: "List all breakpoints in the workspace (SECURE: Read-only operation)",
  }, async () => {
    const breakpoints = debugManager.getAllBreakpoints();
    outputChannel.appendLine(`[AUDIT] AI agent requested breakpoints list. Found ${breakpoints.length} breakpoints.`);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(breakpoints, null, 2)
      }]
    };
  });

  mcpServer.registerTool("set_breakpoint", {
    description: "Set a breakpoint in a file (SECURE: Path validated, requires valid workspace file)",
    inputSchema: {
      file: z.string({ description: "Path to the file" }),
      line: z.number({ description: "Line number (1-based)" }),
      column: z.number({ description: "Column number (1-based)" }).optional(),
      condition: z.string({ description: "Breakpoint condition" }).optional(),
      logMessage: z.string({ description: "Log message" }).optional(),
    }
  }, async (args) => {
    outputChannel.appendLine(`[AUDIT] AI agent requested to set breakpoint at ${args.file}:${args.line}${args.column ? ':' + args.column : ''}`);

    try {
      const breakpoint = await debugManager.setBreakpoint(
        args.file,
        args.line,
        args.column,
        {
          condition: args.condition,
          logMessage: args.logMessage,
        }
      );

      outputChannel.appendLine(`[AUDIT] Successfully set breakpoint at ${breakpoint.file}:${breakpoint.line}${breakpoint.column ? ':' + breakpoint.column : ''}`);
      return {
        content: [{
          type: "text",
          text: `Breakpoint set: ${JSON.stringify(breakpoint, null, 2)}`
        }]
      };
    } catch (error) {
      outputChannel.appendLine(`[AUDIT] Failed to set breakpoint: ${error instanceof Error ? error.message : String(error)}`);
      return {
        content: [{
          type: "text",
          text: `Failed to set breakpoint: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  });

  mcpServer.registerTool("remove_breakpoint", {
    description: "Remove a breakpoint (SECURE: Path validated)",
    inputSchema: {
      file: z.string({ description: "Path to the file" }),
      line: z.number({ description: "Line number (1-based)" }),
      column: z.number({ description: "Column number (1-based)" }).optional(),
    },
  }, async (args) => {
    outputChannel.appendLine(`[AUDIT] AI agent requested to remove breakpoint at ${args.file}:${args.line}${args.column ? ':' + args.column : ''}`);

    try {
      const success = await debugManager.removeBreakpoint(
        args.file,
        args.line,
        args.column
      );

      if (success) {
        outputChannel.appendLine(`[AUDIT] Successfully removed breakpoint at ${args.file}:${args.line}${args.column ? ':' + args.column : ''}`);
      } else {
        outputChannel.appendLine(`[AUDIT] Breakpoint not found for removal at ${args.file}:${args.line}${args.column ? ':' + args.column : ''}`);
      }

      return {
        content: [{
          type: "text",
          text: success ? "Breakpoint removed successfully" : "Breakpoint not found"
        }]
      };
    } catch (error) {
      outputChannel.appendLine(`[AUDIT] Failed to remove breakpoint: ${error instanceof Error ? error.message : String(error)}`);
      return {
        content: [{
          type: "text",
          text: `Failed to remove breakpoint: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  });

  mcpServer.registerTool("inspect_variables", {
    description: "Get variables in the current debug scope (SECURE: Read-only operation, alternative to removed evaluate_expression)",
  }, async () => {
    outputChannel.appendLine(`[AUDIT] AI agent requested variable inspection`);
    const variables = await debugManager.getVariables();
    outputChannel.appendLine(`[AUDIT] Variable inspection returned ${variables.length} variables`);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(variables, null, 2)
      }]
    };
  });

  mcpServer.registerTool("step_execution", {
    description: "Step through code execution (SECURE: Requires active debug session, execution control)",
    inputSchema: {
      stepType: z.enum(["over", "into", "out"], { description: "Type of step: over (next), into (step in), or out (step out)" }),
    }
  }, async (args) => {
    outputChannel.appendLine(`[AUDIT] AI agent requested to step execution: ${args.stepType}`);

    try {
      const success = await debugManager.step(args.stepType);

      if (success) {
        outputChannel.appendLine(`[AUDIT] Successfully executed step: ${args.stepType}`);
      } else {
        outputChannel.appendLine(`[AUDIT] Failed to execute step: ${args.stepType}`);
      }

      return {
        content: [{
          type: "text",
          text: success ? `Step ${args.stepType} executed` : `Failed to step ${args.stepType}`
        }]
      };
    } catch (error) {
      outputChannel.appendLine(`[AUDIT] Error during step execution: ${error instanceof Error ? error.message : String(error)}`);
      return {
        content: [{
          type: "text",
          text: `Error during step ${args.stepType}: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  });

  mcpServer.registerTool("continue_execution", {
    description: "Continue execution until next breakpoint (SECURE: Requires active debug session, execution control)",
  }, async () => {
    outputChannel.appendLine(`[AUDIT] AI agent requested to continue execution`);

    try {
      const success = await debugManager.continue();

      if (success) {
        outputChannel.appendLine(`[AUDIT] Successfully continued execution`);
      } else {
        outputChannel.appendLine(`[AUDIT] Failed to continue execution`);
      }

      return {
        content: [{
          type: "text",
          text: success ? "Execution continued" : "Failed to continue execution"
        }]
      };
    } catch (error) {
      outputChannel.appendLine(`[AUDIT] Error continuing execution: ${error instanceof Error ? error.message : String(error)}`);
      return {
        content: [{
          type: "text",
          text: `Error continuing execution: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  });

  mcpServer.registerTool("get_call_stack", {
    description: "Get the current call stack (SECURE: Read-only operation)",
  }, async () => {
    outputChannel.appendLine(`[AUDIT] AI agent requested call stack information`);

    try {
      const callStack = await debugManager.getCallStack();
      outputChannel.appendLine(`[AUDIT] Call stack information returned ${callStack.length} frames`);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(callStack, null, 2)
        }]
      };
    } catch (error) {
      outputChannel.appendLine(`[AUDIT] Error getting call stack: ${error instanceof Error ? error.message : String(error)}`);
      return {
        content: [{
          type: "text",
          text: `Error getting call stack: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  });

  
  mcpServer.registerTool("list_launch_configurations", {
    description: "List all available launch configurations from .vscode/launch.json (SECURE: Read-only operation)",
  }, async () => {
    const configurations = await debugManager.getLaunchConfigurations();
    return {
      content: [{
        type: "text",
        text: JSON.stringify(configurations, null, 2)
      }]
    };
  });

  mcpServer.registerTool("start_debugging", {
    description: "Start debugging with a specific launch configuration (SECURE: Requires user consent for first-time use)",
    inputSchema: {
      configurationName: z.string({ description: "Name of the launch configuration to start" }),
      workspaceFolder: z.string({ description: "Workspace folder path (optional)" }).optional(),
    }
  }, async (args) => {
    outputChannel.appendLine(`[AUDIT] AI agent requested to start debug session with configuration: ${args.configurationName}${args.workspaceFolder ? ` in ${args.workspaceFolder}` : ''}`);

    try {
      const success = await debugManager.startDebugging(args.configurationName, args.workspaceFolder);

      if (success) {
        outputChannel.appendLine(`[AUDIT] Successfully started debug session with configuration: ${args.configurationName}`);
      } else {
        outputChannel.appendLine(`[AUDIT] Failed to start debug session with configuration: ${args.configurationName}`);
      }

      return {
        content: [{
          type: "text",
          text: success ? `Debug session started for configuration: ${args.configurationName}` : `Failed to start debug session for configuration: ${args.configurationName}`
        }]
      };
    } catch (error) {
      outputChannel.appendLine(`[AUDIT] Error starting debug session: ${error instanceof Error ? error.message : String(error)}`);
      return {
        content: [{
          type: "text",
          text: `Error starting debug session: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  });

  mcpServer.registerTool("stop_debugging", {
    description: "Stop the current active debug session (SECURE: Session control operation)",
  }, async () => {
    outputChannel.appendLine(`[AUDIT] AI agent requested to stop debug session`);

    try {
      const success = await debugManager.stopDebugging();

      if (success) {
        outputChannel.appendLine(`[AUDIT] Successfully stopped debug session`);
      } else {
        outputChannel.appendLine(`[AUDIT] No active debug session to stop`);
      }

      return {
        content: [{
          type: "text",
          text: success ? "Debug session stopped successfully" : "No active debug session to stop"
        }]
      };
    } catch (error) {
      outputChannel.appendLine(`[AUDIT] Error stopping debug session: ${error instanceof Error ? error.message : String(error)}`);
      return {
        content: [{
          type: "text",
          text: `Error stopping debug session: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  });

  // Set up Express and HTTP transport
  const app = express();
  app.use(express.json());

// Enhanced HTTP request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const userAgent = req.get('User-Agent') || 'Unknown';
  const contentLength = req.get('Content-Length') || '0';

  outputChannel.appendLine(`[HTTP] ${timestamp} - ${req.method} ${req.url} - Agent: ${userAgent} - Size: ${contentLength} bytes`);

  // Log response when it finishes
  res.on('finish', () => {
    outputChannel.appendLine(`[HTTP] ${timestamp} - ${req.method} ${req.url} - Response: ${res.statusCode} ${res.statusMessage}`);
  });

  next();
});  

  app.get('/mcp', async (_req, _res) => {
    _res.status(200).send();
  });

  app.post('/mcp', async (req, res) => {
    // Create a new transport for each request to prevent request ID collisions
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    res.on('close', () => {
      transport.close();
    });

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => resolve(server)).on('error', error => reject(error))
  });
}