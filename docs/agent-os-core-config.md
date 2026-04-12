# AgentOS Core Configuration

This repository now exposes the key AgentOS configuration knobs that control the Codex-powered helper and the main backend agent. Any deployment or local run of the health service must respect the same contract that AgentOS expects.

## tools.langchain_tool (active section)

- Only `model_id` is read from this section. Defaults to `gpt-5.1-codex`.
- The backend exposes the same value via the `LANGCHAIN_MODEL_ID` environment variable, so you can override it without editing YAML.
- LangChain helpers and the structured OpenAI client both use this identifier whenever they call the `responses` API, so make sure it matches the model you want the dashboard to drive.

## tools.coding_tool

- AgentOS keeps the actually active coding backend tied to the `agent` field inside `tools.coding_tool`. The backend reads this value through the `CODING_TOOL_AGENT` environment variable (default: `codex`) so downstream graphs stay aligned with however the dashboard is wired.
- Don’t mutate other fields in this section unless you are sure AgentOS needs them; the health service will always focus on `agent`.

## Codex credentials (required)

- The OpenAI helper requires a Codex/Responses API key stored in `~/.codex/auth.json`. You can override the location by setting `CODEX_AUTH_PATH` before booting any service.
- The file must contain a non-empty `api_key` or `token` entry. Example:

  ```json
  {
    "api_key": "sk-..."
  }
  ```

- The configuration module validates the file at startup and caches the parsed credentials, but you can force a reload by setting `CODEX_AUTH_PATH` to a new file and restarting the process.

## Deepgram transcription credentials

- The new transcription helper immediately validates `DEEPGRAM_API_KEY` and refuses to start when the variable is missing or empty. Store the Deepgram key you use for other Deepgram SDK integrations.
- Override `DEEPGRAM_BASE_URL` when your deployment requires a proxy or alternate Deepgram host.
- See `backend/README.md` for a usage example and a reminder that `nova-3`, `language: "en"`, `smart_format: true`, and `utterances: true` are the defaults this service sends on every request.

## Deployment expectations

- `package_deploy.sh` now reads the same credential file before syncing the repository. It creates `$SERVER_PATH/.codex` and `$SERVER_PATH/agent_os_chat/.codex` on the server, copies the local credentials into both locations, and enforces restrictive permissions so only the deployed services can read them.
- Update your local `~/.codex/auth.json` (or the file referenced by `CODEX_AUTH_PATH`) before running `npm run deploy`, because that is the file that gets shipped to production.

Refer to this document whenever you need to update the Codex/OpenAI integration or explain the required files to teammates.
