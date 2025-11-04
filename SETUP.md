# Setup and Usage Guide

## Project Structure
```
mcp-vscode-connector/
├── src/
│   ├── extension.ts           # Main extension entry point
│   ├── mcpServer.ts          # MCP server implementation with tools
│   └── debugSessionManager.ts # VSCode debug API abstraction layer
├── test-files/
│   ├── sample.py             # Python debug test file
│   └── sample.ts             # TypeScript debug test file
├── .vscode/
│   ├── launch.json           # Debug configurations
│   └── tasks.json            # Build tasks
├── out/                      # Compiled JavaScript output
└── package.json              # Extension manifest
```

## Installation and Testing

### 1. Install Dependencies
```bash
npm install
```

### 2. Compile the Extension
```bash
npm run compile
```

### 3. Run the Extension in Development
1. Open VSCode
2. Press F5 (Run Extension) or use "Run Extension" debug configuration
3. This opens a new Extension Development Host window

### 4. Test Debug Session Interaction
1. In the Extension Development Host window, open a test file:
   - `test-files/sample.py` for Python debugging
   - `test-files/sample.ts` for TypeScript/Node.js debugging

2. Start a debug session (F5 or using the Run and Debug panel)

3. Open Command Palette (Ctrl+Shift+P) and run:
   - "Start MCP Connector" to start the MCP server
   - "Stop MCP Connector" to stop it

4. Monitor the "MCP Connector" output channel for logs

## MCP Tools Available

Once the MCP connector is running, AI agents can use these tools:

1. **list_debug_sessions** - Lists all active debug sessions
2. **get_active_session_info** - Gets current session details
3. **list_breakpoints** - Lists all breakpoints
4. **set_breakpoint** - Sets breakpoints with optional conditions
5. **remove_breakpoint** - Removes specific breakpoints
6. **inspect_variables** - Gets variables in current scope
7. **step_execution** - Step control (over/into/out)
8. **continue_execution** - Continues execution
9. **get_call_stack** - Gets current call stack
10. **evaluate_expression** - Evaluates expressions

## Security Features

- AI agents can only interact with existing debug sessions (cannot start sessions)
- All actions are logged to the output channel
- Default to read-only operations for safety
- Configurable permissions system

## Key Architecture Decisions

1. **VSCode API Abstraction**: Uses `vscode.debug` API instead of direct debugger communication
2. **Language Agnostic**: Works with any DAP-compliant debugger (Python, Node.js, etc.)
3. **Simple Commands**: Only Start/Stop commands for minimal UI
4. **Comprehensive Logging**: All operations visible in output channel
5. **Error Handling**: Graceful error handling with informative messages

## Next Steps for Production

1. Package the extension using `npm run package`
2. Publish to VSCode Marketplace
3. Add comprehensive error handling and edge cases
4. Implement permission system for AI control levels
5. Add configuration options for advanced users