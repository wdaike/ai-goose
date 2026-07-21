use std::fmt;
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use futures::stream::BoxStream;

use crate::agents::extension::{ExtensionConfig, ExtensionResult};
use crate::agents::prompt_manager::PromptManager;
use crate::agents::types::SessionConfig;
use crate::config::permission::PermissionManager;
use crate::config::{Config, GooseMode};
use crate::conversation::message::{Message, MessageUsage};
use crate::conversation::Conversation;
use crate::session::extension_data::{EnabledExtensionsState, ExtensionState};
use crate::session::{Session, SessionManager, SessionNameUpdate};
use goose_types::thinking::ThinkingEffort;
use rmcp::model::{ServerNotification, Tool};
use serde_json::Value;
use tokio::sync::{mpsc, Mutex};
use tokio_util::sync::CancellationToken;
use tracing::instrument;

#[derive(Debug, Clone, serde::Serialize, utoipa::ToSchema)]
pub struct ExtensionLoadResult {
    pub name: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Clone, Debug)]
pub enum GoosePlatform {
    GooseDesktop,
    GooseCli,
}

impl fmt::Display for GoosePlatform {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            GoosePlatform::GooseCli => write!(f, "goose-cli"),
            GoosePlatform::GooseDesktop => write!(f, "goose-desktop"),
        }
    }
}

#[derive(Clone)]
pub struct AgentConfig {
    pub session_manager: Arc<SessionManager>,
    pub permission_manager: Arc<PermissionManager>,
    pub goose_mode: GooseMode,
    pub disable_session_naming: bool,
    pub goose_platform: GoosePlatform,
    pub session_name_update_tx: Option<mpsc::UnboundedSender<SessionNameUpdate>>,
    pub use_login_shell_path: Option<bool>,
    pub(crate) codex_runtime: Arc<tokio::sync::OnceCell<crate::codex::CodexRuntime>>,
}

impl AgentConfig {
    pub fn new(
        session_manager: Arc<SessionManager>,
        permission_manager: Arc<PermissionManager>,
        goose_mode: GooseMode,
        disable_session_naming: bool,
        goose_platform: GoosePlatform,
    ) -> Self {
        Self {
            session_manager,
            permission_manager,
            goose_mode,
            disable_session_naming,
            goose_platform,
            session_name_update_tx: None,
            use_login_shell_path: None,
            codex_runtime: Arc::new(tokio::sync::OnceCell::new()),
        }
    }

    pub fn with_session_name_update_tx(
        mut self,
        tx: Option<mpsc::UnboundedSender<SessionNameUpdate>>,
    ) -> Self {
        self.session_name_update_tx = tx;
        self
    }

    pub fn with_use_login_shell_path(mut self, use_login_shell_path: bool) -> Self {
        self.use_login_shell_path = Some(use_login_shell_path);
        self
    }

    fn resolve_use_login_shell_path(&self) -> bool {
        resolve_use_login_shell_path(self.use_login_shell_path, &self.goose_platform)
    }
}

fn resolve_use_login_shell_path(explicit: Option<bool>, platform: &GoosePlatform) -> bool {
    explicit.unwrap_or(matches!(platform, GoosePlatform::GooseDesktop))
}

/// The main goose Agent
pub struct Agent {
    pub config: AgentConfig,
    pub(super) current_goose_mode: Mutex<GooseMode>,
    codex_core: crate::codex::CodexAgentCore,

    final_output_json_schema: Mutex<Option<Value>>,
    pub(super) prompt_manager: Mutex<PromptManager>,
}

#[derive(Clone, Debug)]
pub enum AgentEvent {
    Message(Message),
    Usage(goose_types::conversation::token_usage::ProviderUsage),
    MessageUsage {
        message_id: Option<String>,
        usage: MessageUsage,
    },
    McpNotification((String, ServerNotification)),
    HistoryReplaced(Conversation),
}

impl Default for Agent {
    fn default() -> Self {
        Self::new()
    }
}

impl Agent {
    pub fn new() -> Self {
        let config = Config::global();
        Self::with_config(AgentConfig::new(
            Arc::new(SessionManager::instance()),
            PermissionManager::instance(),
            config.get_goose_mode().unwrap_or_default(),
            config.get_goose_disable_session_naming().unwrap_or(false),
            GoosePlatform::GooseCli,
        ))
    }

    pub fn with_config(config: AgentConfig) -> Self {
        let initial_mode = config.goose_mode;
        let codex_runtime = Arc::clone(&config.codex_runtime);
        let _use_login_shell_path = config.resolve_use_login_shell_path();
        Self {
            config,
            current_goose_mode: Mutex::new(initial_mode),
            codex_core: crate::codex::CodexAgentCore::new(codex_runtime),
            final_output_json_schema: Mutex::new(None),
            prompt_manager: Mutex::new(PromptManager::new()),
        }
    }

    pub async fn steer(&self, session_id: &str, message: Message) {
        if self
            .codex_core
            .steer(session_id, &message)
            .await
            .unwrap_or(false)
        {
            let _ = self
                .config
                .session_manager
                .add_message(session_id, &message)
                .await;
        }
    }

    pub async fn invalidate_codex_session(&self, session: &Session) {
        self.codex_core.invalidate_session(session).await;
    }

    pub async fn list_models(&self) -> Result<Vec<crate::codex::CodexModel>> {
        self.codex_core.list_models().await
    }

    pub async fn codex_account(&self) -> Result<crate::codex::CodexAccount> {
        self.codex_core.read_account().await
    }

    /// Start a Codex login. Passing an API key logs in directly; omitting it
    /// returns the ChatGPT OAuth URL the client must open.
    pub async fn codex_login(&self, api_key: Option<String>) -> Result<crate::codex::CodexLogin> {
        self.codex_core.start_login(api_key).await
    }

    pub async fn codex_logout(&self) -> Result<()> {
        self.codex_core.logout().await
    }

    pub async fn compact_session(&self, session_id: &str) -> Result<()> {
        let session = self
            .config
            .session_manager
            .get_session(session_id, false)
            .await?;
        let (base_instructions, developer_instructions) =
            self.prompt_manager.lock().await.codex_instructions();
        self.codex_core
            .compact(
                &self.config.session_manager,
                &session,
                base_instructions,
                developer_instructions,
            )
            .await
    }

    pub async fn clear_session(&self, session_id: &str) -> Result<()> {
        let session = self
            .config
            .session_manager
            .get_session(session_id, false)
            .await?;
        self.codex_core
            .reset_session(&self.config.session_manager, &session)
            .await?;
        self.config
            .session_manager
            .replace_conversation(session_id, &Conversation::default())
            .await?;
        self.config
            .session_manager
            .update(session_id)
            .usage(goose_types::conversation::token_usage::Usage::new(
                Some(0),
                Some(0),
                Some(0),
            ))
            .apply()
            .await
    }

    /// Resolve the active model config for a session.
    ///
    /// The session is the source of truth for the selected model and its
    /// settings. When the session has no stored config (e.g. before the
    /// provider has been persisted), fall back to the configured provider
    /// defaults.
    pub async fn model_config_for_session(
        &self,
        session_id: &str,
    ) -> Result<goose_types::model::ModelConfig> {
        if let Ok(session) = self
            .config
            .session_manager
            .get_session(session_id, false)
            .await
        {
            if let Some(model_config) = session.model_config {
                return Ok(model_config);
            }
        }

        let config = Config::global();
        let model_name = config
            .get_goose_model()
            .map_err(|_| anyhow!("Could not resolve model config: missing model"))?;
        crate::model_config::model_config_from_user_config(&model_name)
            .map_err(|e| anyhow!("Could not resolve model config: {e}"))
    }

    pub async fn add_extension(
        &self,
        extension: ExtensionConfig,
        session_id: &str,
    ) -> ExtensionResult<()> {
        let session = self
            .config
            .session_manager
            .get_session(session_id, false)
            .await
            .map_err(|error| {
                crate::agents::extension::ExtensionError::SetupError(error.to_string())
            })?;
        let name = extension.name();
        let mut extensions = EnabledExtensionsState::from_extension_data(&session.extension_data)
            .map(|state| state.extensions)
            .unwrap_or_default();
        extensions.retain(|existing| existing.name() != name);
        extensions.push(extension);
        let mut extension_data = session.extension_data.clone();
        EnabledExtensionsState::new(extensions)
            .to_extension_data(&mut extension_data)
            .map_err(|error| {
                crate::agents::extension::ExtensionError::SetupError(error.to_string())
            })?;
        self.invalidate_codex_session(&session).await;
        self.config
            .session_manager
            .update(session_id)
            .extension_data(extension_data)
            .apply()
            .await
            .map_err(|error| {
                crate::agents::extension::ExtensionError::SetupError(error.to_string())
            })?;
        Ok(())
    }

    pub async fn add_extensions_bulk(
        self: &Arc<Self>,
        extensions: Vec<ExtensionConfig>,
        session_id: &str,
    ) -> anyhow::Result<Vec<ExtensionLoadResult>> {
        let results = extensions
            .iter()
            .map(|extension| ExtensionLoadResult {
                name: extension.name(),
                success: true,
                error: None,
            })
            .collect();
        let session = self
            .config
            .session_manager
            .get_session(session_id, false)
            .await?;
        let mut current = EnabledExtensionsState::from_extension_data(&session.extension_data)
            .map(|state| state.extensions)
            .unwrap_or_default();
        for extension in extensions {
            let name = extension.name();
            current.retain(|existing| existing.name() != name);
            current.push(extension);
        }
        let mut extension_data = session.extension_data.clone();
        EnabledExtensionsState::new(current).to_extension_data(&mut extension_data)?;
        self.invalidate_codex_session(&session).await;
        self.config
            .session_manager
            .update(session_id)
            .extension_data(extension_data)
            .apply()
            .await?;
        Ok(results)
    }

    pub(crate) async fn list_mcp_servers(
        &self,
        session_id: &str,
    ) -> Result<Vec<codex_app_server_protocol::McpServerStatus>> {
        self.codex_core.list_mcp_servers(session_id).await
    }

    /// Read a `ui://` (or any) MCP resource and return its text content.
    pub(crate) async fn read_mcp_resource(
        &self,
        session_id: &str,
        server: &str,
        uri: &str,
    ) -> Result<String> {
        let response = self
            .codex_core
            .read_mcp_resource(session_id, server, uri)
            .await?;
        Ok(response
            .contents
            .into_iter()
            .find_map(|content| match content {
                codex_protocol::mcp::ResourceContent::Text { text, .. } => Some(text),
                codex_protocol::mcp::ResourceContent::Blob { .. } => None,
            })
            .unwrap_or_default())
    }

    /// Call a tool by its prefixed `server__tool` name.
    pub async fn call_tool(
        &self,
        session_id: &str,
        name: &str,
        arguments: Value,
    ) -> Result<codex_app_server_protocol::McpServerToolCallResponse> {
        let (server, tool) = name
            .split_once(TOOL_NAME_SEPARATOR)
            .ok_or_else(|| anyhow!("Tool name must be `server{TOOL_NAME_SEPARATOR}tool`"))?;
        self.codex_core
            .call_mcp_tool(session_id, server, tool, arguments)
            .await
    }

    /// Tools Codex has available for this session, prefixed `server__tool`.
    pub async fn list_tools(&self, session_id: &str, extension_name: Option<String>) -> Vec<Tool> {
        let servers = match self.codex_core.list_mcp_servers(session_id).await {
            Ok(servers) => servers,
            Err(error) => {
                tracing::warn!(session_id, %error, "Failed to list Codex MCP servers");
                return Vec::new();
            }
        };

        let mut tools: Vec<Tool> = servers
            .into_iter()
            .filter(|server| {
                extension_name
                    .as_ref()
                    .is_none_or(|wanted| &server.name == wanted)
            })
            .flat_map(|server| {
                server
                    .tools
                    .into_iter()
                    .map(move |(name, tool)| codex_tool_to_rmcp(&server.name, &name, tool))
            })
            .collect();
        tools.sort_by(|a, b| a.name.cmp(&b.name));
        tools
    }

    pub async fn remove_extension(&self, name: &str, session_id: &str) -> Result<()> {
        let session = self
            .config
            .session_manager
            .get_session(session_id, false)
            .await?;
        let mut extensions = EnabledExtensionsState::from_extension_data(&session.extension_data)
            .map(|state| state.extensions)
            .unwrap_or_default();
        extensions.retain(|extension| extension.name() != name);
        let mut extension_data = session.extension_data.clone();
        EnabledExtensionsState::new(extensions).to_extension_data(&mut extension_data)?;
        self.invalidate_codex_session(&session).await;
        self.config
            .session_manager
            .update(session_id)
            .extension_data(extension_data)
            .apply()
            .await?;
        Ok(())
    }

    pub async fn list_extensions(&self) -> Vec<String> {
        self.enabled_extensions()
            .await
            .into_iter()
            .map(|extension| extension.name())
            .collect()
    }

    pub async fn get_extension_configs(&self) -> Vec<ExtensionConfig> {
        self.enabled_extensions().await
    }

    async fn enabled_extensions(&self) -> Vec<ExtensionConfig> {
        Vec::new()
    }

    #[instrument(
        skip(self, user_message, session_config, cancel_token),
        fields(user_message, trace_input, session.id = %session_config.id)
    )]
    pub async fn reply(
        &self,
        user_message: Message,
        session_config: SessionConfig,
        cancel_token: Option<CancellationToken>,
    ) -> Result<BoxStream<'_, Result<AgentEvent>>> {
        let session_manager = self.config.session_manager.clone();

        let message_text_for_trace = user_message.as_concat_text();
        tracing::Span::current().record("user_message", message_text_for_trace.as_str());
        tracing::Span::current().record("trace_input", message_text_for_trace.as_str());

        let (base_instructions, developer_instructions) =
            self.prompt_manager.lock().await.codex_instructions();
        let final_output_json_schema = self.final_output_json_schema.lock().await.clone();

        self.codex_core
            .reply(
                session_manager,
                user_message,
                session_config,
                cancel_token,
                base_instructions,
                developer_instructions,
                final_output_json_schema,
            )
            .await
    }

    pub async fn extend_system_prompt(&self, key: String, instruction: String) {
        let mut prompt_manager = self.prompt_manager.lock().await;
        prompt_manager.add_system_prompt_extra(key, instruction);
    }

    pub async fn remove_system_prompt_extra(&self, key: &str) {
        let mut prompt_manager = self.prompt_manager.lock().await;
        prompt_manager.remove_system_prompt_extra(key);
    }

    pub async fn set_session_model(
        &self,
        provider_name: &str,
        model_config: goose_types::model::ModelConfig,
        session_id: &str,
    ) -> Result<()> {
        self.config
            .session_manager
            .clone()
            .update(session_id)
            .provider_name(provider_name)
            .model_config(model_config)
            .apply()
            .await
            .context("Failed to persist model config to session")
    }

    pub async fn update_goose_mode(&self, mode: GooseMode, session_id: &str) -> Result<()> {
        *self.current_goose_mode.lock().await = mode;
        self.config
            .session_manager
            .clone()
            .update(session_id)
            .goose_mode(mode)
            .apply()
            .await
            .context("Failed to persist goose_mode to session")?;
        let session = self
            .config
            .session_manager
            .get_session(session_id, false)
            .await?;
        self.invalidate_codex_session(&session).await;
        Ok(())
    }

    pub async fn goose_mode(&self) -> GooseMode {
        *self.current_goose_mode.lock().await
    }

    pub async fn update_thinking_effort(
        &self,
        session_id: &str,
        effort: ThinkingEffort,
    ) -> Result<()> {
        let session = self
            .config
            .session_manager
            .get_session(session_id, false)
            .await
            .context("Failed to get session")?;
        let provider_name = session
            .provider_name
            .clone()
            .unwrap_or_else(|| crate::providers::CODEX_PROVIDER_NAME.to_string());
        let model_config = self
            .model_config_for_session(session_id)
            .await?
            .with_thinking_effort(effort);

        self.set_session_model(&provider_name, model_config, session_id)
            .await?;

        let mode = self.goose_mode().await;
        self.update_goose_mode(mode, session_id).await
    }

    /// Override the system prompt with a custom template
    pub async fn override_system_prompt(&self, template: String) {
        let mut prompt_manager = self.prompt_manager.lock().await;
        prompt_manager.set_system_prompt_override(template);
    }

    pub async fn clear_system_prompt_override(&self) {
        let mut prompt_manager = self.prompt_manager.lock().await;
        prompt_manager.clear_system_prompt_override();
    }
}

pub(crate) const TOOL_NAME_SEPARATOR: &str = "__";

fn codex_tool_to_rmcp(server: &str, name: &str, tool: codex_protocol::mcp::Tool) -> Tool {
    let input_schema = tool.input_schema.as_object().cloned().unwrap_or_default();
    let mut converted = Tool::new(
        format!("{server}{TOOL_NAME_SEPARATOR}{name}"),
        tool.description.unwrap_or_default(),
        input_schema,
    );
    converted.output_schema = tool
        .output_schema
        .and_then(|schema| schema.as_object().cloned())
        .map(Arc::new);
    converted
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_use_login_shell_path_defaults_by_platform() {
        assert!(resolve_use_login_shell_path(
            None,
            &GoosePlatform::GooseDesktop
        ));
        assert!(!resolve_use_login_shell_path(
            None,
            &GoosePlatform::GooseCli
        ));
    }

    #[test]
    fn resolve_use_login_shell_path_explicit_overrides_platform() {
        assert!(resolve_use_login_shell_path(
            Some(true),
            &GoosePlatform::GooseCli
        ));
        assert!(!resolve_use_login_shell_path(
            Some(false),
            &GoosePlatform::GooseDesktop
        ));
    }
}
