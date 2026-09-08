import type { ProviderConfig } from '@hbar/contracts'

export interface ProviderPreset {
  id: string
  name: string
  description: string
  protocol: ProviderConfig['protocol']
  baseUrl: string
  model: string
  contextWindow: number
  maxOutput: number
  imageInput: boolean
  reasoning: boolean
  inputPrice: number
  outputPrice: number
  modelOptions: readonly string[]
}

export const providerPresets: readonly ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: '官方 OpenAI API',
    protocol: 'openai-responses',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.5',
    contextWindow: 400_000,
    maxOutput: 32_768,
    imageInput: true,
    reasoning: true,
    inputPrice: 0,
    outputPrice: 0,
    modelOptions: ['gpt-5.5', 'gpt-5.6', 'gpt-5.5-mini'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude Messages API',
    protocol: 'anthropic-messages',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    contextWindow: 200_000,
    maxOutput: 16_384,
    imageInput: true,
    reasoning: true,
    inputPrice: 0,
    outputPrice: 0,
    modelOptions: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek Chat / Reasoner',
    protocol: 'openai-completions',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    contextWindow: 128_000,
    maxOutput: 8_192,
    imageInput: false,
    reasoning: false,
    inputPrice: 0,
    outputPrice: 0,
    modelOptions: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: '统一访问多家模型',
    protocol: 'openai-completions',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-5.5',
    contextWindow: 200_000,
    maxOutput: 16_384,
    imageInput: true,
    reasoning: true,
    inputPrice: 0,
    outputPrice: 0,
    modelOptions: ['openai/gpt-5.5', 'anthropic/claude-sonnet-4-5', 'google/gemini-2.5-flash'],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Gemini OpenAI 兼容接口',
    protocol: 'openai-completions',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    contextWindow: 1_000_000,
    maxOutput: 16_384,
    imageInput: true,
    reasoning: false,
    inputPrice: 0,
    outputPrice: 0,
    modelOptions: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.0-flash'],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: '本机 Ollama 服务',
    protocol: 'openai-completions',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'llama3.2',
    contextWindow: 32_768,
    maxOutput: 8_192,
    imageInput: false,
    reasoning: false,
    inputPrice: 0,
    outputPrice: 0,
    modelOptions: ['llama3.2', 'qwen3:8b', 'deepseek-r1'],
  },
  {
    id: 'moonshot',
    name: 'Moonshot / Kimi',
    description: 'Kimi OpenAI 兼容接口',
    protocol: 'openai-completions',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'kimi-k2.5',
    contextWindow: 256_000,
    maxOutput: 16_384,
    imageInput: true,
    reasoning: true,
    inputPrice: 0,
    outputPrice: 0,
    modelOptions: ['kimi-k2.5', 'kimi-k2-thinking'],
  },
  {
    id: 'custom',
    name: '自定义兼容接口',
    description: '填写你自己的 OpenAI / Anthropic 兼容服务',
    protocol: 'openai-completions',
    baseUrl: 'https://api.example.com/v1',
    model: 'your-model',
    contextWindow: 128_000,
    maxOutput: 8_192,
    imageInput: false,
    reasoning: false,
    inputPrice: 0,
    outputPrice: 0,
    modelOptions: [],
  },
] as const

export function providerFromPreset(preset: ProviderPreset, id = `provider-${Date.now().toString(36)}`): ProviderConfig {
  return {
    id,
    name: preset.name,
    protocol: preset.protocol,
    baseUrl: preset.baseUrl,
    model: preset.model,
    contextWindow: preset.contextWindow,
    maxOutput: preset.maxOutput,
    imageInput: preset.imageInput,
    reasoning: preset.reasoning,
    inputPrice: preset.inputPrice,
    outputPrice: preset.outputPrice,
  }
}
