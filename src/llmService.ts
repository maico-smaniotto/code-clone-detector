import axios from 'axios';
import { ConfigManager } from './config';

export class LLMService {
    constructor(private config: ConfigManager) {}

    public async generateCompletion(prompt: string, context: string): Promise<string> {
        const fullPrompt = `${prompt}\n\nContext:\n${context}`;
        
        switch (this.config.llmProvider) {
            case 'ollama':
                return this.callOllama(fullPrompt);
            case 'openai':
                return this.callOpenAI(fullPrompt);
            case 'claude':
                return this.callClaude(fullPrompt);
            case 'gemini':
                return this.callGemini(fullPrompt);
            case 'opencode':
                return this.callOpenCode(fullPrompt);
            default:
                throw new Error(`Unsupported LLM provider: ${this.config.llmProvider}`);
        }
    }

    private async callOllama(prompt: string): Promise<string> {
        const response = await axios.post(`${this.config.ollamaEndpoint}/api/generate`, {
            model: this.config.modelName,
            prompt: prompt,
            stream: false
        });
        return response.data.response;
    }

    private async callOpenAI(prompt: string): Promise<string> {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: this.config.modelName,
            messages: [{ role: 'user', content: prompt }]
        }, {
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        return response.data.choices[0].message.content;
    }

    private async callClaude(prompt: string): Promise<string> {
        const response = await axios.post('https://api.anthropic.com/v1/messages', {
            model: this.config.modelName,
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }]
        }, {
            headers: {
                'x-api-key': this.config.apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
            }
        });
        return response.data.content[0].text;
    }

    private async callGemini(prompt: string): Promise<string> {
        const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${this.config.modelName}:generateContent?key=${this.config.apiKey}`, {
            contents: [{ parts: [{ text: prompt }] }]
        }, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data.candidates[0].content.parts[0].text;
    }

    private async callOpenCode(prompt: string): Promise<string> {
        const response = await axios.post(this.config.opencodeEndpoint, {
            model: this.config.modelName,
            messages: [{ role: 'user', content: prompt }]
        }, {
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        return response.data.choices[0].message.content;
    }
}
