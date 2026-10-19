import type { Account, ProviderOption } from '../model/types.ts';

const options: ProviderOption[] = [
  {
    id: 'ai-adobe',
    name: 'Adobe AI',
    description: 'Models from your Adobe plan',
    auth: 'oauth',
  },
  {
    id: 'amazon-bedrock',
    name: 'Amazon Bedrock',
    description: 'Claude and more through AWS',
    auth: 'fields',
    keyUrl: 'https://console.aws.example/bedrock/api-keys',
    needs: 'cors-free-transport',
    fields: [{ name: 'region', label: 'Region', placeholder: 'us-west-2' }],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models with your own key',
    auth: 'api-key',
    keyUrl: 'https://console.anthropic.example/keys',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT models with your own key',
    auth: 'api-key',
    keyUrl: 'https://platform.openai.example/api-keys',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    description: 'Mistral and Codestral models',
    auth: 'api-key',
    keyUrl: 'https://console.mistral.example/keys',
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Fast open models',
    auth: 'api-key',
    keyUrl: 'https://console.groq.example/keys',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Many providers behind one key',
    auth: 'api-key',
    keyUrl: 'https://openrouter.example/keys',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    description: 'Open models on wafer-scale chips',
    auth: 'api-key',
    keyUrl: 'https://cloud.cerebras.example/keys',
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    description: 'Models from your Copilot plan',
    auth: 'oauth',
  },
  {
    id: 'openai-codex',
    name: 'OpenAI Codex',
    description: 'Models from your ChatGPT plan',
    auth: 'oauth',
  },
  {
    id: 'azure-openai',
    name: 'Azure OpenAI',
    description: 'Your own Azure deployment',
    auth: 'fields',
    keyUrl: 'https://portal.azure.example/openai',
    fields: [
      {
        name: 'endpoint',
        label: 'Endpoint',
        required: true,
        customBase: true,
        placeholder: 'https://harbor.openai.azure.example',
        help: 'The resource’s endpoint, from Keys and endpoint.',
      },
      { name: 'deployment', label: 'Deployment', required: true, placeholder: 'harbor-gpt' },
    ],
    vaultName: 'AZURE_OPENAI_API_KEY',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: 'Workers AI models',
    auth: 'fields',
    keyUrl: 'https://dash.cloudflare.example/api-tokens',
    needs: 'cors-free-transport',
    fields: [
      {
        name: 'account',
        label: 'Account ID',
        required: true,
        placeholder: '3f2a9c…',
        help: 'On the right of the Workers AI page.',
      },
    ],
    vaultName: 'CLOUDFLARE_WORKERS_AI_API_KEY',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Models running on this device',
    auth: 'local',
  },
  {
    id: 'lm-studio',
    name: 'LM Studio',
    description: 'Models served by LM Studio on this device',
    auth: 'local',
  },
];

export const providerFixtures: readonly ProviderOption[] = options.sort((a, b) =>
  a.name.localeCompare(b.name)
);

export function providerAccount(option: ProviderOption): Account {
  const keyed = option.auth === 'api-key' || option.auth === 'fields';
  return {
    id: option.id,
    provider: option.name,
    identity: '',
    status: 'disconnected',
    group: 'providers',
    auth: keyed ? 'api-key' : (option.auth as 'oauth' | 'local'),
    ...(keyed ? { store: 'vault' as const } : {}),
    ...(option.fields ? { fields: option.fields } : {}),
    ...(option.keyUrl ? { keyUrl: option.keyUrl } : {}),
    ...(option.description ? { description: option.description } : {}),
    ...(option.needs ? { needs: option.needs } : {}),
    ...(option.vaultName ? { vaultName: option.vaultName } : {}),
  };
}

export function providerAccounts(accounts: readonly Account[]): Account[] {
  const added = (id: string, patch: Partial<Account>): Account => ({
    ...providerAccount(providerFixtures.find((option) => option.id === id) as ProviderOption),
    ...patch,
  });
  const providers = accounts.filter((account) => account.group !== 'mcp');
  const servers = accounts.filter((account) => account.group === 'mcp');
  return [
    added('amazon-bedrock', {}),
    ...providers,
    added('ollama', { status: 'connected', identity: 'On this device' }),
    ...servers,
  ];
}
