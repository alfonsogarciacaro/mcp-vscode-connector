import * as vscode from 'vscode';

export class DebugConsentManager {
  private static readonly CONFIG_KEY = 'mcpVscodeConnector.approvedDebugConfigurations';
  private static readonly CONSENT_KEY = 'mcpVscodeConnector.requireDebugConsent';

  /**
   * Check if a debug configuration has been approved for AI agent use
   */
  public static isConfigurationApproved(configurationName: string): boolean {
    const config = vscode.workspace.getConfiguration();
    const approvedConfigs = config.get<string[]>(this.CONFIG_KEY, []);
    return approvedConfigs.includes(configurationName);
  }

  /**
   * Get all approved debug configurations
   */
  public static getApprovedConfigurations(): string[] {
    const config = vscode.workspace.getConfiguration();
    return config.get<string[]>(this.CONFIG_KEY, []);
  }

  /**
   * Add a debug configuration to the approved list
   */
  public static async approveConfiguration(configurationName: string): Promise<void> {
    const config = vscode.workspace.getConfiguration();
    const approvedConfigs = config.get<string[]>(this.CONFIG_KEY, []);

    if (!approvedConfigs.includes(configurationName)) {
      const updatedConfigs = [...approvedConfigs, configurationName];
      await config.update(this.CONFIG_KEY, updatedConfigs, vscode.ConfigurationTarget.Global);
    }
  }

  /**
   * Remove a debug configuration from the approved list
   */
  public static async revokeConfigurationApproval(configurationName: string): Promise<void> {
    const config = vscode.workspace.getConfiguration();
    const approvedConfigs = config.get<string[]>(this.CONFIG_KEY, []);
    const updatedConfigs = approvedConfigs.filter(name => name !== configurationName);
    await config.update(this.CONFIG_KEY, updatedConfigs, vscode.ConfigurationTarget.Global);
  }

  /**
   * Check if consent is required for debug configurations
   */
  public static isConsentRequired(): boolean {
    const config = vscode.workspace.getConfiguration();
    return config.get<boolean>(this.CONSENT_KEY, true);
  }

  /**
   * Request user consent for a debug configuration
   */
  public static async requestConsent(configurationName: string): Promise<boolean> {
    const message = `AI agent is requesting to use debug configuration: "${configurationName}"\n\nDo you approve this access?`;

    const result = await vscode.window.showInformationMessage(
      message,
      { modal: true },
      'Approve Once',
      'Approve Always',
      'Deny'
    );

    switch (result) {
      case 'Approve Always':
        await this.approveConfiguration(configurationName);
        vscode.window.showInformationMessage(`Debug configuration "${configurationName}" approved for future use`);
        return true;
      case 'Approve Once':
        return true;
      case 'Deny':
      default:
        return false;
    }
  }

  /**
   * Check if a configuration can be used (either approved or get consent)
   */
  public static async canUseConfiguration(configurationName: string): Promise<boolean> {
    // If consent is not required, allow all configurations
    if (!this.isConsentRequired()) {
      return true;
    }

    // If already approved, allow
    if (this.isConfigurationApproved(configurationName)) {
      return true;
    }

    // Otherwise, request consent
    return await this.requestConsent(configurationName);
  }

  /**
   * Show a dialog to manage approved configurations
   */
  public static async showManageApprovalsDialog(): Promise<void> {
    const approvedConfigs = this.getApprovedConfigurations();

    if (approvedConfigs.length === 0) {
      vscode.window.showInformationMessage('No debug configurations have been approved yet.');
      return;
    }

    const selected = await vscode.window.showQuickPick(
      [
        ...approvedConfigs.map(config => ({
          label: config,
          description: 'Click to revoke approval',
          action: 'revoke' as const
        })),
        {
          label: 'Clear All Approvals',
          description: 'Revoke all approved debug configurations',
          action: 'clear' as const
        }
      ],
      {
        placeHolder: 'Select a debug configuration to manage',
        matchOnDescription: true
      }
    );

    if (selected?.action === 'revoke') {
      const confirm = await vscode.window.showWarningMessage(
        `Revoke approval for "${selected.label}"?`,
        'Revoke',
        'Cancel'
      );

      if (confirm === 'Revoke') {
        await this.revokeConfigurationApproval(selected.label);
        vscode.window.showInformationMessage(`Approval revoked for "${selected.label}"`);
      }
    } else if (selected?.action === 'clear') {
      const confirm = await vscode.window.showWarningMessage(
        'Revoke all approved debug configurations?',
        'Clear All',
        'Cancel'
      );

      if (confirm === 'Clear All') {
        const config = vscode.workspace.getConfiguration();
        await config.update(this.CONFIG_KEY, [], vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('All debug configuration approvals cleared');
      }
    }
  }
}