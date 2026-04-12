import fs from 'fs';
import { randomUUID } from 'crypto';
import { getCodexAuthPath } from '../config/openai';

export const CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";
export const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
export const DEFAULT_MODEL_ID = "gpt-5.1-codex";
export const DEFAULT_INSTRUCTIONS = "You are a helpful assistant.";
export const DEFAULT_TIMEOUT = 60000;
export const OPENAI_BETA_HEADER = "responses=experimental";
export const ORIGINATOR_HEADER = "codex_cli_rs";
export const USER_AGENT_HEADER = "typescript-codex-client/1.0";

export interface RateLimitWindow {
    used_percent: number;
    limit_window_seconds: number;
    reset_after_seconds: number;
    reset_at: number;
}

export interface RateLimit {
    allowed: boolean;
    limit_reached: boolean;
    primary_window: RateLimitWindow;
    secondary_window: RateLimitWindow;
}

export interface Credits {
    has_credits: boolean;
    unlimited: boolean;
    overage_limit_reached: boolean;
    balance: string;
    approx_local_messages?: number[] | null;
    approx_cloud_messages?: number[] | null;
}

export interface SpendControl {
    reached: boolean;
}

export interface CodexUsage {
    plan_type: string;
    rate_limit: RateLimit;
    code_review_rate_limit: unknown | null;
    additional_rate_limits: unknown | null;
    credits: Credits;
    spend_control: SpendControl;
    promo: unknown | null;
}

export interface CodexClientOptions {
    modelId?: string;
    baseUrl?: string;
    usageUrl?: string;
    authPath?: string;
    instructions?: string;
    timeout?: number;
}

export class CodexClient {
    private modelId: string;
    private baseUrl: string;
    private usageUrl: string;
    private instructions: string;
    private timeout: number;
    private authPath: string;
    private accessToken: string;
    private accountId: string;

    constructor(options?: CodexClientOptions) {
        this.modelId = options?.modelId || DEFAULT_MODEL_ID;
        this.baseUrl = options?.baseUrl || CODEX_RESPONSES_URL;
        this.usageUrl = options?.usageUrl || CODEX_USAGE_URL;
        this.instructions = options?.instructions || DEFAULT_INSTRUCTIONS;
        this.timeout = options?.timeout ?? DEFAULT_TIMEOUT;
        this.authPath = options?.authPath || getCodexAuthPath();
        
        const { accessToken, accountId } = this.loadAuth();
        this.accessToken = accessToken;
        this.accountId = accountId;
    }

    private decodeJwtPayload(token: string): Record<string, unknown> {
        try {
            const payloadB64 = token.split('.')[1];
            if (!payloadB64) throw new Error('Codex access token is not a valid JWT.');
            
            const padded = payloadB64.padEnd(payloadB64.length + (4 - (payloadB64.length % 4)) % 4, '=');
            const payloadJson = Buffer.from(padded, 'base64url').toString('utf-8');
            return JSON.parse(payloadJson) as Record<string, unknown>;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error('Unable to decode Codex access token payload: ' + msg);
        }
    }

    private extractAccountId(payload: Record<string, unknown>): string {
        const profile = payload['https://api.openai.com/profile'] as Record<string, unknown> | undefined;
        if (profile && profile.account_id) {
            return String(profile.account_id);
        }
        if (payload.account_id) return String(payload.account_id);
        if (payload.sub) return String(payload.sub);
        
        throw new Error("Unable to determine chatgpt-account-id from Codex token payload.");
    }

    private loadAuth() {
        if (!fs.existsSync(this.authPath)) {
            throw new Error(`CodexClient requires Codex auth. Expected auth file at ${this.authPath}.`);
        }

        const auth = JSON.parse(fs.readFileSync(this.authPath, 'utf8')) as Record<string, unknown>;
        const accessToken = this.extractAccessToken(auth);
        if (!accessToken) {
            throw new Error(`Codex auth file does not contain an access token.`);
        }

        const payload = this.decodeJwtPayload(accessToken);
        const accountId = this.extractAccountId(payload);
        
        return { accessToken, accountId };
    }

    private extractAccessToken(auth: Record<string, unknown>): string | null {
        const tokens = auth.tokens as Record<string, unknown> | undefined;
        if (tokens && tokens.access_token) return String(tokens.access_token);
        if (auth.token) return String(auth.token);
        return null;
    }

    private buildHeaders(): Record<string, string> {
        return {
            "Authorization": `Bearer ${this.accessToken}`,
            "chatgpt-account-id": this.accountId,
            "OpenAI-Beta": OPENAI_BETA_HEADER,
            "originator": ORIGINATOR_HEADER,
            "session_id": randomUUID(),
            "accept": "text/event-stream",
            "content-type": "application/json",
            "User-Agent": USER_AGENT_HEADER,
        };
    }

    private buildInput(prompt: string) {
        return [
            {
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: prompt,
                    }
                ],
            }
        ];
    }

    private buildBody(prompt: string, instructions?: string, textFormat?: Record<string, unknown>) {
        const textConfig: Record<string, unknown> = { verbosity: "medium" };
        if (textFormat) {
            textConfig.format = textFormat;
        }

        return {
            model: this.modelId,
            stream: true,
            store: false,
            instructions: instructions || this.instructions,
            input: this.buildInput(prompt),
            text: textConfig,
        };
    }

    private extractTextFromEvent(event: Record<string, unknown>): string {
        const eventType = event.type;
        if (eventType === "response.output_text.delta") {
            return String(event.delta || "");
        }

        if (eventType === "response.output_text.done" || eventType === "response.completed") {
            const response = event.response as Record<string, unknown> | undefined;
            if (response && typeof response === "object") {
                return this.extractTextFromResponse(response);
            }
        }

        return "";
    }

    private extractTextFromResponse(response: Record<string, unknown>): string {
        const collected: string[] = [];
        const output = response.output;
        if (!Array.isArray(output)) return "";

        for (const item of output) {
            if (!item || typeof item !== "object") continue;
            const content = (item as Record<string, unknown>).content;
            if (!Array.isArray(content)) continue;
            for (const contentItem of content) {
                if (!contentItem || typeof contentItem !== "object") continue;
                const text = (contentItem as Record<string, unknown>).text;
                if (text) collected.push(String(text));
            }
        }
        return collected.join("");
    }

    private async postAndCollectText(prompt: string, baseUrl?: string, instructions?: string, textFormat?: Record<string, unknown>): Promise<string> {
        const url = baseUrl || this.baseUrl;
        const body = this.buildBody(prompt, instructions, textFormat);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: this.buildHeaders(),
                body: JSON.stringify(body),
                signal: controller.signal
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Codex API error: ${response.status} ${response.statusText} - ${errText}`);
            }

            if (!response.body) {
                throw new Error(`Codex API response has no body.`);
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let collectedText = "";
            let buffer = "";

            let isDone = false;
            while (!isDone) {
                const { done, value } = await reader.read();
                isDone = done;
                if (value) {
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";
                    
                    for (const line of lines) {
                        if (!line || !line.startsWith("data:")) continue;
                        const data = line.slice(5).trim();
                        if (!data || data === "[DONE]") continue;
                        
                        try {
                            const event = JSON.parse(data) as Record<string, unknown>;
                            const text = this.extractTextFromEvent(event);
                            if (text) collectedText += text;
                        } catch (e) {
                            // Ignore parse errors on partial streams
                        }
                    }
                }
            }
            
            return collectedText;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    public async executeSync(prompt: string, baseUrl?: string): Promise<string> {
        return this.postAndCollectText(prompt, baseUrl);
    }

    public async executeStructured<T = unknown>(
        prompt: string,
        schema: Record<string, unknown>,
        schemaName: string,
        method: "function_calling" | "json_mode" | "json_schema" = "json_schema",
        baseUrl?: string,
        includeRaw: boolean = false,
        strict: boolean = false
    ): Promise<unknown> {
        let textFormat: Record<string, unknown> | undefined = undefined;
        let structuredPrompt = prompt;

        if (method === "json_schema") {
            const jsonSchema = { ...schema };
            if (strict) {
                jsonSchema.additionalProperties = false;
            }
            
            textFormat = {
                type: "json_schema",
                name: schemaName,
                strict: strict,
                schema: jsonSchema
            };
        } else if (method === "json_mode") {
            structuredPrompt = `${prompt}\n\nReturn only the requested JSON object. Do not include prose before or after it.`;
            textFormat = { type: "json_object" };
        } else {
            structuredPrompt = `${prompt}\n\nReturn only the requested JSON object. Do not include prose before or after it.`;
        }

        const rawText = await this.postAndCollectText(structuredPrompt, baseUrl, undefined, textFormat);
        
        let parsed: unknown;
        try {
            parsed = JSON.parse(rawText);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`Failed to parse structured output from Codex: ${msg}\nRaw text: ${rawText}`);
        }

        if (includeRaw) {
            return { raw: rawText, parsed };
        }
        return parsed as T;
    }

    public async fetchUsage(usageUrl?: string): Promise<CodexUsage> {
        const url = usageUrl || this.usageUrl;
        const headers = this.buildHeaders();
        delete headers["accept"];
        delete headers["content-type"];

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                method: "GET",
                headers,
                signal: controller.signal
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Codex API error: ${response.status} ${response.statusText} - ${errText}`);
            }

            return (await response.json()) as CodexUsage;
        } finally {
            clearTimeout(timeoutId);
        }
    }
}

// Keep the name consistent with the file
export const OpenRouterTool = CodexClient;
