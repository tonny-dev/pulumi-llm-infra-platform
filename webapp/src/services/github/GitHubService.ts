import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { logger } from '@/shared/utils/logger';
import { LLMService } from '@/services/llm/LLMService';
import { DatabaseService } from '@/services/database/DatabaseService';
import { 
  GitHubRepository, 
  GitHubInstallation, 
  PullRequestAnalysis,
  CodeAnalysisRequest 
} from '@/shared/types/subscription';

export class GitHubService {
  private octokit: Octokit;
  private appOctokit: Octokit;

  constructor(
    private githubAppId: string,
    private githubPrivateKey: string,
    private webhookSecret: string,
    private llmService: LLMService,
    private db: DatabaseService
  ) {
    // App-level authentication for installations
    this.appOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: this.githubAppId,
        privateKey: this.githubPrivateKey,
      },
    });
  }

  async handleWebhook(signature: string, payload: any): Promise<void> {
    try {
      // Verify webhook signature
      if (!this.verifyWebhookSignature(signature, JSON.stringify(payload))) {
        throw new Error('Invalid webhook signature');
      }

      const { action, installation, repository, pull_request } = payload;

      switch (payload.action || payload.zen ? 'ping' : 'unknown') {
        case 'ping':
          logger.info('GitHub webhook ping received');
          break;

        case 'installation':
          await this.handleInstallation(action, installation);
          break;

        case 'installation_repositories':
          await this.handleInstallationRepositories(action, installation, payload.repositories_added, payload.repositories_removed);
          break;

        case 'pull_request':
          if (['opened', 'synchronize', 'reopened'].includes(action)) {
            await this.handlePullRequest(installation, repository, pull_request);
          }
          break;

        case 'push':
          await this.handlePush(installation, repository, payload);
          break;

        default:
          logger.debug('Unhandled webhook event', { action, event: payload.zen ? 'ping' : 'unknown' });
      }
    } catch (error) {
      logger.error('GitHub webhook handling failed', { error, payload });
      throw error;
    }
  }

  async installApp(userId: string, installationId: number): Promise<GitHubInstallation> {
    try {
      // Get installation details
      const { data: installation } = await this.appOctokit.rest.apps.getInstallation({
        installation_id: installationId,
      });

      // Get installation repositories
      const installationOctokit = await this.getInstallationOctokit(installationId);
      const { data: repositories } = await installationOctokit.rest.apps.listReposAccessibleToInstallation();

      // Save installation to database
      const githubInstallation = await this.db.githubInstallations.create({
        userId,
        githubInstallationId: installationId,
        accountLogin: installation.account!.login,
        accountType: installation.account!.type as 'User' | 'Organization',
        permissions: installation.permissions,
        repositorySelection: installation.repository_selection as 'all' | 'selected',
        selectedRepositories: repositories.repositories?.map(repo => this.mapGitHubRepository(repo)),
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Save repositories
      if (repositories.repositories) {
        for (const repo of repositories.repositories) {
          await this.saveRepository(userId, repo, installationId);
        }
      }

      logger.info('GitHub app installed', { userId, installationId, repositoryCount: repositories.repositories?.length });

      return githubInstallation;
    } catch (error) {
      logger.error('Failed to install GitHub app', { error, userId, installationId });
      throw error;
    }
  }

  async analyzePullRequest(
    installationId: number, 
    owner: string, 
    repo: string, 
    pullNumber: number
  ): Promise<PullRequestAnalysis> {
    try {
      const installationOctokit = await this.getInstallationOctokit(installationId);

      // Get PR details
      const { data: pullRequest } = await installationOctokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      });

      // Get PR files
      const { data: files } = await installationOctokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: pullNumber,
      });

      // Create PR analysis record
      const repository = await this.db.repositories.findByGitHubName(`${owner}/${repo}`);
      const prAnalysis = await this.db.pullRequestAnalyses.create({
        repositoryId: repository.id,
        pullRequestNumber: pullNumber,
        githubPullRequestId: pullRequest.id,
        title: pullRequest.title,
        description: pullRequest.body,
        author: pullRequest.user!.login,
        baseBranch: pullRequest.base.ref,
        headBranch: pullRequest.head.ref,
        status: 'pending',
        filesChanged: files.length,
        linesAdded: pullRequest.additions,
        linesDeleted: pullRequest.deletions,
        issues: { critical: 0, high: 0, medium: 0, low: 0 },
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Analyze changed files
      const analysisPromises = files
        .filter(file => file.status !== 'removed' && file.patch)
        .slice(0, 20) // Limit to first 20 files to avoid overwhelming the LLM
        .map(async (file) => {
          try {
            // Get file content
            const { data: fileContent } = await installationOctokit.rest.repos.getContent({
              owner,
              repo,
              path: file.filename,
              ref: pullRequest.head.sha,
            });

            if ('content' in fileContent) {
              const content = Buffer.from(fileContent.content, 'base64').toString('utf-8');
              
              const analysisRequest: CodeAnalysisRequest = {
                fileName: file.filename,
                language: this.detectLanguage(file.filename),
                code: content,
                analysisType: 'comprehensive',
                context: `Pull Request #${pullNumber}: ${pullRequest.title}`,
                diffContext: file.patch,
                repositoryId: repository.id,
                pullRequestId: prAnalysis.id
              };

              return await this.llmService.analyzeCode(analysisRequest);
            }
          } catch (error) {
            logger.warn('Failed to analyze file in PR', { error, file: file.filename, pullNumber });
            return null;
          }
        });

      // Wait for all analyses to complete
      const analyses = (await Promise.allSettled(analysisPromises))
        .filter(result => result.status === 'fulfilled' && result.value)
        .map(result => (result as PromiseFulfilledResult<any>).value);

      // Aggregate results
      const aggregatedIssues = { critical: 0, high: 0, medium: 0, low: 0 };
      let totalScore = 0;

      analyses.forEach(analysis => {
        analysis.issues.forEach((issue: any) => {
          switch (issue.severity) {
            case 'critical':
              aggregatedIssues.critical++;
              break;
            case 'high':
              aggregatedIssues.high++;
              break;
            case 'medium':
              aggregatedIssues.medium++;
              break;
            case 'low':
              aggregatedIssues.low++;
              break;
          }
        });
        totalScore += analysis.metrics.maintainability || 0;
      });

      const overallScore = analyses.length > 0 ? totalScore / analyses.length : 0;

      // Update PR analysis
      const updatedAnalysis = await this.db.pullRequestAnalyses.update(prAnalysis.id, {
        status: 'completed',
        overallScore,
        issues: aggregatedIssues,
        completedAt: new Date(),
        updatedAt: new Date()
      });

      // Post review comment
      await this.postReviewComment(installationOctokit, owner, repo, pullNumber, analyses, overallScore);

      logger.info('PR analysis completed', { 
        pullNumber, 
        repository: `${owner}/${repo}`, 
        filesAnalyzed: analyses.length,
        overallScore 
      });

      return updatedAnalysis;
    } catch (error) {
      logger.error('PR analysis failed', { error, owner, repo, pullNumber });
      throw error;
    }
  }

  async getRepositories(userId: string): Promise<GitHubRepository[]> {
    return await this.db.repositories.findByUser(userId);
  }

  async syncRepository(userId: string, repositoryId: string): Promise<void> {
    try {
      const repository = await this.db.repositories.findById(repositoryId);
      const installation = await this.db.githubInstallations.findByUser(userId);
      
      if (!installation) {
        throw new Error('GitHub installation not found');
      }

      const installationOctokit = await this.getInstallationOctokit(installation.githubInstallationId);
      
      // Get latest repository data
      const [owner, repo] = repository.fullName.split('/');
      const { data: repoData } = await installationOctokit.rest.repos.get({
        owner,
        repo,
      });

      // Update repository in database
      await this.db.repositories.update(repositoryId, {
        description: repoData.description,
        language: repoData.language,
        stargazersCount: repoData.stargazers_count,
        forksCount: repoData.forks_count,
        openIssuesCount: repoData.open_issues_count,
        size: repoData.size,
        updatedAt: new Date(),
        pushedAt: new Date(repoData.pushed_at!)
      });

      logger.info('Repository synced', { repositoryId, fullName: repository.fullName });
    } catch (error) {
      logger.error('Repository sync failed', { error, userId, repositoryId });
      throw error;
    }
  }

  private async getInstallationOctokit(installationId: number): Promise<Octokit> {
    const installationAuth = createAppAuth({
      appId: this.githubAppId,
      privateKey: this.githubPrivateKey,
      installationId,
    });

    return new Octokit({
      authStrategy: createAppAuth,
      auth: installationAuth,
    });
  }

  private async handleInstallation(action: string, installation: any): Promise<void> {
    if (action === 'created') {
      logger.info('GitHub app installation created', { installationId: installation.id });
    } else if (action === 'deleted') {
      await this.db.githubInstallations.deleteByInstallationId(installation.id);
      logger.info('GitHub app installation deleted', { installationId: installation.id });
    }
  }

  private async handleInstallationRepositories(
    action: string, 
    installation: any, 
    repositoriesAdded: any[], 
    repositoriesRemoved: any[]
  ): Promise<void> {
    const installationRecord = await this.db.githubInstallations.findByInstallationId(installation.id);
    
    if (!installationRecord) {
      logger.warn('Installation not found for repository changes', { installationId: installation.id });
      return;
    }

    if (action === 'added' && repositoriesAdded) {
      for (const repo of repositoriesAdded) {
        await this.saveRepository(installationRecord.userId, repo, installation.id);
      }
    }

    if (action === 'removed' && repositoriesRemoved) {
      for (const repo of repositoriesRemoved) {
        await this.db.repositories.deleteByGitHubId(repo.id);
      }
    }
  }

  private async handlePullRequest(installation: any, repository: any, pullRequest: any): Promise<void> {
    // Queue PR analysis
    await this.analyzePullRequest(
      installation.id,
      repository.owner.login,
      repository.name,
      pullRequest.number
    );
  }

  private async handlePush(installation: any, repository: any, payload: any): Promise<void> {
    // Handle push events - could trigger repository-wide analysis
    logger.info('Push event received', { 
      repository: repository.full_name, 
      ref: payload.ref,
      commits: payload.commits?.length 
    });
  }

  private async saveRepository(userId: string, repo: any, installationId: number): Promise<void> {
    await this.db.repositories.upsert({
      githubId: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      private: repo.private,
      defaultBranch: repo.default_branch,
      language: repo.language,
      stargazersCount: repo.stargazers_count,
      forksCount: repo.forks_count,
      openIssuesCount: repo.open_issues_count,
      size: repo.size,
      createdAt: new Date(repo.created_at),
      updatedAt: new Date(repo.updated_at),
      pushedAt: new Date(repo.pushed_at),
      owner: {
        login: repo.owner.login,
        avatarUrl: repo.owner.avatar_url,
        type: repo.owner.type
      },
      userId,
      installationId
    });
  }

  private async postReviewComment(
    octokit: Octokit,
    owner: string,
    repo: string,
    pullNumber: number,
    analyses: any[],
    overallScore: number
  ): Promise<void> {
    const criticalIssues = analyses.flatMap(a => a.issues.filter((i: any) => i.severity === 'critical'));
    const highIssues = analyses.flatMap(a => a.issues.filter((i: any) => i.severity === 'high'));
    
    let comment = `## 🤖 AI Code Review Summary\n\n`;
    comment += `**Overall Score:** ${overallScore.toFixed(1)}/10\n\n`;
    
    if (criticalIssues.length > 0) {
      comment += `### 🚨 Critical Issues (${criticalIssues.length})\n`;
      criticalIssues.slice(0, 3).forEach((issue: any) => {
        comment += `- **${issue.message}** (Line ${issue.line})\n  ${issue.suggestion}\n\n`;
      });
    }
    
    if (highIssues.length > 0) {
      comment += `### ⚠️ High Priority Issues (${highIssues.length})\n`;
      highIssues.slice(0, 3).forEach((issue: any) => {
        comment += `- **${issue.message}** (Line ${issue.line})\n  ${issue.suggestion}\n\n`;
      });
    }
    
    comment += `\n---\n*Powered by AI Code Review Platform - [View detailed analysis](https://your-app.com/analysis)*`;

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body: comment,
    });
  }

  private mapGitHubRepository(repo: any): GitHubRepository {
    return {
      id: repo.id.toString(),
      githubId: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      private: repo.private,
      defaultBranch: repo.default_branch,
      language: repo.language,
      stargazersCount: repo.stargazers_count,
      forksCount: repo.forks_count,
      openIssuesCount: repo.open_issues_count,
      size: repo.size,
      createdAt: new Date(repo.created_at),
      updatedAt: new Date(repo.updated_at),
      pushedAt: new Date(repo.pushed_at),
      owner: {
        login: repo.owner.login,
        avatarUrl: repo.owner.avatar_url,
        type: repo.owner.type
      }
    };
  }

  private detectLanguage(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'java': 'java',
      'go': 'go',
      'rs': 'rust',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'swift': 'swift',
      'kt': 'kotlin',
      'scala': 'scala'
    };
    
    return languageMap[extension || ''] || 'text';
  }

  private verifyWebhookSignature(signature: string, payload: string): boolean {
    const crypto = require('crypto');
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}
