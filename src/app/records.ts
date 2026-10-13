import type { Account, RecordKind } from '../model/types.ts';

const envNames: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  azure: 'AZURE_OPENAI_API_KEY',
  'azure-openai': 'AZURE_OPENAI_API_KEY',
  'azure-openai-responses': 'AZURE_OPENAI_API_KEY',
  google: 'GEMINI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  'google-vertex': 'GOOGLE_CLOUD_API_KEY',
  'amazon-bedrock': 'AWS_BEARER_TOKEN_BEDROCK',
  mistral: 'MISTRAL_API_KEY',
  groq: 'GROQ_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  xai: 'XAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  'vercel-ai-gateway': 'AI_GATEWAY_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  zai: 'ZAI_API_KEY',
  moonshotai: 'MOONSHOT_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
  together: 'TOGETHER_API_KEY',
  huggingface: 'HF_TOKEN',
  'github-copilot': 'COPILOT_GITHUB_TOKEN',
};

const upper = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, '_');

export function serverOf(account: Account): string {
  return account.id.replace(/^mcp:/, '');
}

export function recordKind(account: Account): RecordKind {
  return account.group === 'mcp' ? 'mcp' : 'model';
}

export function recordName(account: Account): string {
  if (account.group === 'mcp') return `MCP_${upper(serverOf(account))}_TOKEN`;
  return envNames[account.id] ?? `${upper(account.id)}_API_KEY`;
}
