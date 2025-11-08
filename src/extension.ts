import * as vscode from 'vscode';
import * as http from "http";
import { createMcpServer } from './mcpServer';
import { DebugConsentManager } from './debugConsentManager';

let mcpServer: http.Server | null = null;
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
	outputChannel = vscode.window.createOutputChannel('MCP Connector');
	outputChannel.appendLine('MCP Connector extension activated');

	const startCommand = vscode.commands.registerCommand('mcp-vscode-connector.startConnector', () => {
		startMCPServer();
	});

	const stopCommand = vscode.commands.registerCommand('mcp-vscode-connector.stopConnector', () => {
		stopMCPServer();
	});

	const manageApprovalsCommand = vscode.commands.registerCommand('mcp-vscode-connector.manageDebugApprovals', async () => {
		await DebugConsentManager.showManageApprovalsDialog();
	});

	context.subscriptions.push(startCommand, stopCommand, manageApprovalsCommand, outputChannel);
}

async function startMCPServer() {
	try {
		// Read configuration settings
		const config = vscode.workspace.getConfiguration('mcpVscodeConnector');
		const port = config.get<number>('port', 8743);

		if (mcpServer) {
			vscode.window.showInformationMessage(`MCP Server is already running on http://localhost:${port}`);
			return;
		}

		outputChannel.appendLine(`Starting MCP Server with configuration:`);
		outputChannel.appendLine(`  Port: ${port}`);

		mcpServer = await createMcpServer(outputChannel, port);
		vscode.window.showInformationMessage(`MCP Connector started on http://localhost:${port}`);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		outputChannel.appendLine(`Failed to start MCP Server: ${errorMessage}`);
		vscode.window.showErrorMessage(`Failed to start MCP Server: ${errorMessage}`);
	}
}

function stopMCPServer() {
	if (!mcpServer) {
		outputChannel.appendLine('MCP Server is not running');
		return;
	}

	try {
		mcpServer.close();
		mcpServer = null;
		vscode.window.showInformationMessage('MCP Connector stopped');
		outputChannel.appendLine('MCP Server stopped successfully');
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		outputChannel.appendLine(`Failed to stop MCP Server: ${errorMessage}`);
		vscode.window.showErrorMessage(`Failed to stop MCP Server: ${errorMessage}`);
	}
}

export function deactivate() {
	stopMCPServer();
}