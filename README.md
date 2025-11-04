# MCP Connector

A VSCode extension that acts as an MCP (Model Context Protocol) server to allow AI code agents to interact with debug sessions.

## Features

- **Start/Stop MCP Connector**: Simple commands to control the MCP server
- **Session Management**: List and monitor active debug sessions
- **Breakpoint Control**: Set, remove, and list breakpoints
- **Variable Inspection**: Examine variables in the current debug scope
- **Execution Control**: Step through code and continue execution
- **Call Stack**: Get current call stack information
- **Expression Evaluation**: Evaluate expressions in debug context

## MCP Tools Available

1. `list_debug_sessions` - List all active debug sessions
2. `get_active_session_info` - Get current session details
3. `list_breakpoints` - Get all breakpoints in workspace
4. `set_breakpoint` - Set breakpoint with optional conditions
5. `remove_breakpoint` - Remove specific breakpoints
6. `inspect_variables` - Get variables in current scope
7. `step_execution` - Step control (over/into/out)
8. `continue_execution` - Resume until next breakpoint
9. `get_call_stack` - Get current call stack
10. `evaluate_expression` - Evaluate expressions in debug context

## Usage

1. Start a debug session in VSCode (Python, TypeScript/Node.js, etc.)
2. Open Command Palette (Ctrl+Shift+P or Cmd+Shift+P)
3. Run "Start MCP Connector"
4. Connect your AI agent to the MCP server
5. Use the MCP tools to interact with debug sessions

## Security

- The extension works with existing debug sessions (AI cannot start sessions independently)
- All actions are logged to the "MCP Connector" output channel
- AI has read access by default, with configurable control permissions

## Installation

This extension is currently in development. To install:

1. Clone this repository
2. Run `npm install`
3. Run `npm run compile`
4. Press F5 in VSCode to launch a new Extension Development Host window
5. Or package the extension using `vsce package`

To install the mcp in Claude: `claude mcp add --transport sse mcp-vscode-connector http://localhost:8743/mcp/sse`

## Development

- TypeScript based VSCode extension
- Uses VSCode Debug API for language-agnostic debugging
- MCP server implementation using official SDK
- Comprehensive logging for debugging and monitoring

## Requirements

- VSCode 1.104.0 or higher
- Node.js for TypeScript compilation