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
    description: "List all active debug sessions",
  }, async () => {
    const sessions = debugManager.getActiveSessions();
    return {
      content: [{
        type: "text",
        text: JSON.stringify(sessions, null, 2)
      }]
    };
  });

  mcpServer.registerTool("get_active_session_info", {
    description: "Get information about the currently active debug session",
  }, async () => {
    const session = debugManager.getActiveSession();

    if (!session) {
      return {
        content: [{
          type: "text",
          text: "No active debug session"
        }]
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify(session, null, 2)
      }]
    };
  });

  mcpServer.registerTool("list_breakpoints", {
    description: "List all breakpoints in the workspace",
  }, async () => {
    const breakpoints = debugManager.getAllBreakpoints();
    return {
      content: [{
        type: "text",
        text: JSON.stringify(breakpoints, null, 2)
      }]
    };
  });

  mcpServer.registerTool("set_breakpoint", {
    description: "Set a breakpoint in a file",
    inputSchema: {
      file: z.string({ description: "Path to the file" }),
      line: z.number({ description: "Line number (1-based)" }),
      column: z.number({ description: "Column number (1-based)" }).optional(),
      condition: z.string({ description: "Breakpoint condition" }).optional(),
      logMessage: z.string({ description: "Log message" }).optional(),
    }
  }, async (args) => {
    const breakpoint = await debugManager.setBreakpoint(
      args.file,
      args.line,
      args.column,
      {
        condition: args.condition,
        logMessage: args.logMessage,
      }
    );

    return {
      content: [{
        type: "text",
        text: `Breakpoint set: ${JSON.stringify(breakpoint, null, 2)}`
      }]
    };
  });

  mcpServer.registerTool("remove_breakpoint", {
    description: "Remove a breakpoint",
    inputSchema: {
      file: z.string({ description: "Path to the file" }),
      line: z.number({ description: "Line number (1-based)" }),
      column: z.number({ description: "Column number (1-based)" }).optional(),
    },
  }, async (args) => {
    const success = await debugManager.removeBreakpoint(
      args.file,
      args.line,
      args.column
    );

    return {
      content: [{
        type: "text",
        text: success ? "Breakpoint removed successfully" : "Breakpoint not found"
      }]
    };
  });

  mcpServer.registerTool("inspect_variables", {
    description: "Get variables in the current debug scope",
  }, async () => {
    const variables = await debugManager.getVariables();
    return {
      content: [{
        type: "text",
        text: JSON.stringify(variables, null, 2)
      }]
    };
  });

  mcpServer.registerTool("step_execution", {
    description: "Step through code execution",
    inputSchema: {
      stepType: z.enum(["over", "into", "out"], { description: "Type of step: over (next), into (step in), or out (step out)" }),
    }
  }, async (args) => {
    const success = await debugManager.step(args.stepType);

    return {
      content: [{
        type: "text",
        text: success ? `Step ${args.stepType} executed` : `Failed to step ${args.stepType}`
      }]
    };
  });

  mcpServer.registerTool("continue_execution", {
    description: "Continue execution until next breakpoint",
  }, async () => {
    const success = await debugManager.continue();

    return {
      content: [{
        type: "text",
        text: success ? "Execution continued" : "Failed to continue execution"
      }]
    };
  });

  mcpServer.registerTool("get_call_stack", {
    description: "Get the current call stack",
  }, async () => {
    const callStack = await debugManager.getCallStack();
    return {
      content: [{
        type: "text",
        text: JSON.stringify(callStack, null, 2)
      }]
    };
  });

  mcpServer.registerTool("evaluate_expression", {
    description: "Evaluate an expression in the current debug context",
    inputSchema: {
      expression: z.string({ description: "Expression to evaluate" })
    },
  }, async (args) => {
    const result = await debugManager.evaluateExpression(args.expression);

    return {
      content: [{
        type: "text",
        text: result !== null ? `Result: ${result}` : "Failed to evaluate expression"
      }]
    };
  });

  // Set up Express and HTTP transport
  const app = express();
  app.use(express.json());

app.use((req, res, next) => {
  outputChannel.appendLine(`Intercepted request: ${req.method} ${req.url}`);
  next();
});  

  app.get('/mcp', async (_req, res) => {
    res.status(200).send();
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