use std::collections::HashMap;
use std::fmt;
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use futures::stream::BoxStream;
use futures::FutureExt;

use super::container::Container;
use super::final_output_tool::FinalOutputTool;
use super::mcp_client::GooseMcpHostInfo;
use super::platform_tools;
use super::tool_confirmation_router::ToolConfirmationRouter;
use super::tool_execution::ToolCallResult;
use crate::agents::extension::{ExtensionConfig, ExtensionResult, ToolInfo};
use crate::agents::extension_manager::{
    get_parameter_names, ExtensionManager, ExtensionManagerCapabilities,
};
use crate::agents::final_output_tool::FINAL_OUTPUT_TOOL_NAME;
use crate::agents::platform_tools::PLATFORM_MANAGE_SCHEDULE_TOOL_NAME;
use crate::agents::prompt_manager::PromptManager;
use crate::agents::types::{SessionConfig, SharedProvider};
use crate::config::permission::PermissionManager;
use crate::config::{get_enabled_extensions, Config, GooseMode};
use crate::conversation::message::{Message, MessageUsage};
use crate::conversation::{fix_conversation, Conversation};
use crate::permission::PermissionConfirmation;
use crate::providers::base::{PermissionRouting, Provider};
use crate::recipe::{Author, Recipe, Response, Settings};
use crate::scheduler_trait::SchedulerTrait;
use crate::session::extension_data::{EnabledExtensionsState, ExtensionState};
use crate::session::{Session, SessionManager, SessionNameUpdate};
use goose_providers::thinking::ThinkingEffort;
use regex::Regex;
use rmcp::model::{
    CallToolRequestParams, CallToolResult, ErrorCode, ErrorData, GetPromptResult, Prompt,
    ServerNotification, Tool,
};
use serde_json::Value;
use tokio::sync::{mpsc, Mutex};
use tokio_util::sync::CancellationToken;
use tracing::{debug, error, instrument};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ToolCategory {
    Shell,
    Read,
    Write,
    Other,
}

fn categorize_tool(tool_name: &str) -> ToolCategory {
    let local = tool_name.rsplit("__").next().unwrap_or(tool_name);
    match local {
        "shell" | "bash" | "exec" | "run" => ToolCategory::Shell,
        "read" | "view" | "cat" | "read_file" => ToolCategory::Read,
        "write" | "edit" | "patch" | "write_file" | "edit_file" => ToolCategory::Write,
        _ => ToolCategory::Other,
    }
}

fn extract_string_arg(input: &Value, keys: &[&str]) -> Option<String> {
    let obj = input.as_object()?;
    for k in keys {
        if let Some(s) = obj.get(*k).and_then(|v| v.as_str()) {
            if !s.is_empty() {
                return Some(s.to_string());
            }
        }
    }
    None
}

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
    pub scheduler_service: Option<Arc<dyn SchedulerTrait>>,
    pub goose_mode: GooseMode,
    pub disable_session_naming: bool,
    pub goose_platform: GoosePlatform,
    pub mcp_host_info: Option<GooseMcpHostInfo>,
    pub session_name_update_tx: Option<mpsc::UnboundedSender<SessionNameUpdate>>,
    pub use_login_shell_path: Option<bool>,
    pub(crate) codex_runtime: Arc<tokio::sync::OnceCell<crate::codex::CodexRuntime>>,
}

impl AgentConfig {
    pub fn new(
        session_manager: Arc<SessionManager>,
        permission_manager: Arc<PermissionManager>,
        scheduler_service: Option<Arc<dyn SchedulerTrait>>,
        goose_mode: GooseMode,
        disable_session_naming: bool,
        goose_platform: GoosePlatform,
    ) -> Self {
        Self {
            session_manager,
            permission_manager,
            scheduler_service,
            goose_mode,
            disable_session_naming,
            goose_platform,
            mcp_host_info: None,
            session_name_update_tx: None,
            use_login_shell_path: None,
            codex_runtime: Arc::new(tokio::sync::OnceCell::new()),
        }
    }

    pub fn with_mcp_host_info(mut self, mcp_host_info: Option<GooseMcpHostInfo>) -> Self {
        self.mcp_host_info = mcp_host_info;
        self
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
    pub(super) provider: SharedProvider,
    pub config: AgentConfig,
    pub(super) current_goose_mode: Mutex<GooseMode>,
    codex_core: crate::codex::CodexAgentCore,

    pub extension_manager: Arc<ExtensionManager>,
    pub(super) final_output_tool: Arc<Mutex<Option<FinalOutputTool>>>,
    pub(super) prompt_manager: Mutex<PromptManager>,
    pub tool_confirmation_router: ToolConfirmationRouter,
    pub(super) hook_manager: crate::hooks::HookManager,
    container: Mutex<Option<Container>>,
    goal: Mutex<Option<String>>,
    grind: Mutex<Option<String>>,
}

#[derive(Clone, Debug)]
pub enum AgentEvent {
    Message(Message),
    Usage(crate::providers::base::ProviderUsage),
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
            None,
            config.get_goose_mode().unwrap_or_default(),
            config.get_goose_disable_session_naming().unwrap_or(false),
            GoosePlatform::GooseCli,
        ))
    }

    pub fn with_config(config: AgentConfig) -> Self {
        let provider = Arc::new(Mutex::new(None));

        let goose_platform = config.goose_platform.clone();
        let initial_mode = config.goose_mode;
        let explicit_mcp_host_info = config.mcp_host_info.clone();
        let mcpui = explicit_mcp_host_info
            .as_ref()
            .filter(|host_info| host_info.explicit_extensions)
            .map(GooseMcpHostInfo::mcpui_enabled)
            .unwrap_or_else(|| match config.goose_platform {
                GoosePlatform::GooseDesktop => true,
                GoosePlatform::GooseCli => false,
            });
        let capabilities = ExtensionManagerCapabilities {
            mcpui,
            host_info: explicit_mcp_host_info.clone(),
        };
        let client_name = explicit_mcp_host_info
            .as_ref()
            .and_then(|host_info| host_info.client_name.clone())
            .unwrap_or_else(|| goose_platform.to_string());
        let session_manager = Arc::clone(&config.session_manager);
        let codex_runtime = Arc::clone(&config.codex_runtime);
        let use_login_shell_path = config.resolve_use_login_shell_path();
        Self {
            provider: provider.clone(),
            config,
            current_goose_mode: Mutex::new(initial_mode),
            codex_core: crate::codex::CodexAgentCore::new(codex_runtime),
            extension_manager: Arc::new(ExtensionManager::new(
                provider.clone(),
                session_manager,
                client_name,
                capabilities,
                use_login_shell_path,
            )),
            final_output_tool: Arc::new(Mutex::new(None)),
            prompt_manager: Mutex::new(PromptManager::new()),
            tool_confirmation_router: ToolConfirmationRouter::new(),
            hook_manager: crate::hooks::HookManager::load(
                std::env::current_dir().ok().as_deref(),
                use_login_shell_path,
            ),
            container: Mutex::new(None),
            goal: Mutex::new(None),
            grind: Mutex::new(None),
        }
    }

    pub async fn emit_hook(&self, event: crate::hooks::HookEvent, session_id: &str) {
        if !self.hook_manager.has_hooks(event) {
            return;
        }
        self.hook_manager
            .emit(event, crate::hooks::HookContext::new(event, session_id))
            .await;
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

    async fn emit_pre_tool_extended_hooks(
        &self,
        tool_name: &str,
        tool_input: Option<&Value>,
        session: &Session,
    ) {
        let working_dir = session.working_dir.to_string_lossy().to_string();
        match categorize_tool(tool_name) {
            ToolCategory::Shell => {
                if let Some(cmd) = tool_input.and_then(|v| extract_string_arg(v, &["command"])) {
                    self.emit_with_matcher(
                        crate::hooks::HookEvent::BeforeShellExecution,
                        &session.id,
                        &cmd,
                        tool_name,
                        tool_input.cloned(),
                        &working_dir,
                    )
                    .await;
                }
            }
            ToolCategory::Read => {
                if let Some(path) =
                    tool_input.and_then(|v| extract_string_arg(v, &["path", "file", "file_path"]))
                {
                    self.emit_with_matcher(
                        crate::hooks::HookEvent::BeforeReadFile,
                        &session.id,
                        &path,
                        tool_name,
                        tool_input.cloned(),
                        &working_dir,
                    )
                    .await;
                }
            }
            ToolCategory::Write | ToolCategory::Other => {}
        }
    }

    async fn emit_with_matcher(
        &self,
        event: crate::hooks::HookEvent,
        session_id: &str,
        matcher_context: &str,
        tool_name: &str,
        tool_input: Option<Value>,
        working_dir: &str,
    ) {
        if !self.hook_manager.has_hooks(event) {
            return;
        }
        let mut ctx = crate::hooks::HookContext::new(event, session_id)
            .with_tool(tool_name.to_string(), tool_input)
            .with_working_dir(working_dir.to_string());
        ctx.matcher_context = Some(matcher_context.to_string());
        self.hook_manager.emit(event, ctx).await;
    }

    fn with_post_tool_hook(
        &self,
        result: ToolCallResult,
        tool_call: &CallToolRequestParams,
        session: &Session,
    ) -> ToolCallResult {
        let hook_manager = self.hook_manager.clone();
        let session_id = session.id.clone();
        let working_dir = session.working_dir.to_string_lossy().to_string();
        let tool_name = tool_call.name.to_string();
        let tool_input = tool_call
            .arguments
            .as_ref()
            .map(|a| serde_json::Value::Object(a.clone()));
        let category = categorize_tool(&tool_name);

        let fut = async move {
            let processed_result =
                super::large_response_handler::process_tool_response(result.result.await);
            let event = match &processed_result {
                Ok(call_result) if call_result.is_error != Some(true) => {
                    crate::hooks::HookEvent::PostToolUse
                }
                _ => crate::hooks::HookEvent::PostToolUseFailure,
            };

            if hook_manager.has_hooks(event) {
                let ctx = crate::hooks::HookContext::new(event, &session_id)
                    .with_tool(tool_name.clone(), tool_input.clone())
                    .with_working_dir(working_dir.clone());
                hook_manager.emit(event, ctx).await;
            }

            if event == crate::hooks::HookEvent::PostToolUse {
                let extended = match category {
                    ToolCategory::Shell => Some((
                        crate::hooks::HookEvent::AfterShellExecution,
                        tool_input
                            .as_ref()
                            .and_then(|v| extract_string_arg(v, &["command"])),
                    )),
                    ToolCategory::Write => Some((
                        crate::hooks::HookEvent::AfterFileEdit,
                        tool_input
                            .as_ref()
                            .and_then(|v| extract_string_arg(v, &["path", "file", "file_path"])),
                    )),
                    _ => None,
                };
                if let Some((ext_event, Some(matcher))) = extended {
                    if hook_manager.has_hooks(ext_event) {
                        let mut ctx = crate::hooks::HookContext::new(ext_event, &session_id)
                            .with_tool(tool_name, tool_input)
                            .with_working_dir(working_dir);
                        ctx.matcher_context = Some(matcher);
                        hook_manager.emit(ext_event, ctx).await;
                    }
                }
            }

            processed_result
        };

        ToolCallResult {
            notification_stream: result.notification_stream,
            action_required_stream: result.action_required_stream,
            result: Box::new(fut.boxed()),
        }
    }

    /// Reset the retry attempts counter to 0
    pub async fn provider(&self) -> Result<Arc<dyn Provider>, anyhow::Error> {
        match &*self.provider.lock().await {
            Some(provider) => Ok(Arc::clone(provider)),
            None => Err(anyhow!("Provider not set")),
        }
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
    ) -> Result<goose_providers::model::ModelConfig> {
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
        let provider_name = config
            .get_goose_provider()
            .map_err(|_| anyhow!("Could not resolve model config: missing provider"))?;
        let model_name = config
            .get_goose_model()
            .map_err(|_| anyhow!("Could not resolve model config: missing model"))?;
        crate::model_config::model_config_from_user_config(&provider_name, &model_name)
            .map_err(|e| anyhow!("Could not resolve model config: {e}"))
    }

    /// When set, all stdio extensions will be started via `docker exec` in the specified container.
    pub async fn set_container(&self, container: Option<Container>) {
        *self.container.lock().await = container.clone();
    }

    pub async fn container(&self) -> Option<Container> {
        self.container.lock().await.clone()
    }

    pub(crate) async fn total_extension_and_tool_counts(&self, session_id: &str) -> (usize, usize) {
        self.extension_manager
            .get_extension_and_tool_counts(session_id)
            .await
    }

    pub async fn add_final_output_tool(&self, response: Response) {
        let mut final_output_tool = self.final_output_tool.lock().await;
        *final_output_tool = Some(FinalOutputTool::new(response));
    }

    pub async fn apply_recipe_components(
        &self,
        response: Option<Response>,
        include_final_output: bool,
    ) {
        if include_final_output {
            if let Some(response) = response {
                self.add_final_output_tool(response).await;
            }
        }
    }

    /// Dispatch a single tool call to the appropriate client
    #[instrument(skip(self, tool_call, request_id, cancellation_token, session), fields(input, output, session.id = %session.id))]
    pub async fn dispatch_tool_call(
        &self,
        tool_call: CallToolRequestParams,
        request_id: String,
        cancellation_token: Option<CancellationToken>,
        session: &Session,
    ) -> (String, Result<ToolCallResult, ErrorData>) {
        let input_summary = serde_json::json!({
            "tool": tool_call.name,
            "arguments": tool_call.arguments,
        });
        tracing::Span::current().record("input", tracing::field::display(&input_summary));

        self.prompt_manager
            .lock()
            .await
            .record_tool_arguments(&tool_call.arguments, &session.working_dir);

        if self
            .hook_manager
            .has_hooks(crate::hooks::HookEvent::PreToolUse)
        {
            let ctx =
                crate::hooks::HookContext::new(crate::hooks::HookEvent::PreToolUse, &session.id)
                    .with_tool(
                        tool_call.name.to_string(),
                        tool_call
                            .arguments
                            .as_ref()
                            .map(|a| serde_json::Value::Object(a.clone())),
                    )
                    .with_working_dir(session.working_dir.to_string_lossy().to_string());
            if let crate::hooks::HookDecision::Deny { reason, plugin } = self
                .hook_manager
                .emit_blocking(crate::hooks::HookEvent::PreToolUse, ctx)
                .await
            {
                return (
                    request_id,
                    Err(ErrorData::new(
                        ErrorCode::INTERNAL_ERROR,
                        format!(
                            "Tool call denied by policy hook `{plugin}`: {reason}. \
                             Do not retry; this is a policy denial, not a transient failure."
                        ),
                        None,
                    )),
                );
            }
        }

        let tool_input_for_extended = tool_call
            .arguments
            .as_ref()
            .map(|a| serde_json::Value::Object(a.clone()));
        self.emit_pre_tool_extended_hooks(
            &tool_call.name,
            tool_input_for_extended.as_ref(),
            session,
        )
        .await;

        if tool_call.name == PLATFORM_MANAGE_SCHEDULE_TOOL_NAME {
            let arguments = tool_call
                .arguments
                .clone()
                .map(Value::Object)
                .unwrap_or(Value::Object(serde_json::Map::new()));
            let result = self
                .handle_schedule_management(arguments, request_id.clone())
                .await;
            let wrapped_result = result.map(CallToolResult::success);
            return (
                request_id,
                Ok(self.with_post_tool_hook(
                    ToolCallResult::from(wrapped_result),
                    &tool_call,
                    session,
                )),
            );
        }

        if tool_call.name == FINAL_OUTPUT_TOOL_NAME {
            return if let Some(final_output_tool) = self.final_output_tool.lock().await.as_mut() {
                let result = final_output_tool.execute_tool_call(tool_call.clone()).await;
                (
                    request_id,
                    Ok(self.with_post_tool_hook(result, &tool_call, session)),
                )
            } else {
                (
                    request_id,
                    Err(ErrorData::new(
                        ErrorCode::INTERNAL_ERROR,
                        "Final output tool not defined".to_string(),
                        None,
                    )),
                )
            };
        }

        let ctx = super::tool_execution::ToolCallContext::new(
            session.id.clone(),
            Some(session.working_dir.clone()),
            Some(request_id.clone()),
        );

        debug!("WAITING_TOOL_START: {}", tool_call.name);
        let result: ToolCallResult = self
            .extension_manager
            .dispatch_tool_call(
                &ctx,
                tool_call.clone(),
                cancellation_token.unwrap_or_default(),
            )
            .await
            .unwrap_or_else(|e| {
                #[cfg(feature = "telemetry")]
                crate::posthog::emit_error(
                    "tool_execution_failed",
                    &format!("{}: {}", tool_call.name, e),
                );
                let error_data = e.downcast::<ErrorData>().unwrap_or_else(|e| {
                    ErrorData::new(ErrorCode::INTERNAL_ERROR, e.to_string(), None)
                });
                ToolCallResult::from(Err(error_data))
            });

        debug!("WAITING_TOOL_END: {}", tool_call.name);

        (
            request_id,
            Ok(self.with_post_tool_hook(result, &tool_call, session)),
        )
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

    pub async fn list_tools(&self, session_id: &str, extension_name: Option<String>) -> Vec<Tool> {
        let mut prefixed_tools = self
            .extension_manager
            .get_prefixed_tools(session_id, extension_name.clone())
            .await
            .unwrap_or_default();

        if (extension_name.is_none() || extension_name.as_deref() == Some("platform"))
            && self.config.scheduler_service.is_some()
        {
            prefixed_tools.push(platform_tools::manage_schedule_tool());
        }

        if extension_name.is_none() {
            if let Some(final_output_tool) = self.final_output_tool.lock().await.as_ref() {
                prefixed_tools.push(final_output_tool.tool());
            }
        }

        prefixed_tools
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
        self.extension_manager
            .list_extensions()
            .await
            .expect("Failed to list extensions")
    }

    pub async fn get_extension_configs(&self) -> Vec<ExtensionConfig> {
        self.extension_manager.get_extension_configs().await
    }

    /// Handle a confirmation response for a tool request
    pub async fn handle_confirmation(
        &self,
        request_id: String,
        confirmation: PermissionConfirmation,
    ) {
        let provider = self.provider.lock().await.clone();
        if let Some(provider) = provider.as_ref() {
            if provider.permission_routing() == PermissionRouting::ActionRequired
                && provider
                    .handle_permission_confirmation(&request_id, &confirmation)
                    .await
            {
                return;
            }
        }
        if !self
            .tool_confirmation_router
            .deliver(request_id, confirmation)
            .await
        {
            error!("Failed to deliver confirmation");
        }
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
        let final_output_json_schema = self
            .final_output_tool
            .lock()
            .await
            .as_ref()
            .and_then(|tool| tool.response.json_schema.clone());

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

    pub async fn set_goal(&self, goal: Option<String>) {
        *self.goal.lock().await = goal;
    }

    pub async fn get_goal(&self) -> Option<String> {
        self.goal.lock().await.clone()
    }

    pub async fn set_grind(&self, goal: Option<String>) {
        *self.grind.lock().await = goal;
    }

    pub async fn get_grind(&self) -> Option<String> {
        self.grind.lock().await.clone()
    }

    pub async fn update_provider(
        &self,
        provider: Arc<dyn Provider>,
        model_config: goose_providers::model::ModelConfig,
        session_id: &str,
    ) -> Result<()> {
        let provider_name = provider.get_name().to_string();

        // Normalize against the provider entry so custom/declarative providers
        // backfill `context_limit` from their known models before the config is
        // persisted as the session source of truth; otherwise auto-compaction
        // would fall back to DEFAULT_CONTEXT_LIMIT.
        let model_config = match crate::providers::get_from_registry(&provider_name).await {
            Ok(entry) => entry
                .normalize_model_config(model_config.clone())
                .unwrap_or(model_config),
            Err(_) => model_config,
        };

        let mut current_provider = self.provider.lock().await;
        *current_provider = Some(provider);

        self.config
            .session_manager
            .clone()
            .update(session_id)
            .provider_name(&provider_name)
            .model_config(model_config)
            .apply()
            .await
            .context("Failed to persist provider config to session")
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

    pub async fn recreate_provider_for_session(
        &self,
        session_id: &str,
        provider_name: &str,
        model_config: goose_providers::model::ModelConfig,
    ) -> Result<()> {
        let session = self
            .config
            .session_manager
            .get_session(session_id, false)
            .await
            .context("Failed to get session")?;

        let extensions = EnabledExtensionsState::extensions_or_default(
            Some(&session.extension_data),
            Config::global(),
        );

        let provider = crate::providers::create_with_working_dir(
            provider_name,
            extensions,
            session.working_dir.clone(),
        )
        .await
        .map_err(|e| anyhow!("Could not create provider: {}", e))?;

        self.update_provider(provider, model_config, session_id)
            .await?;

        let mode = self.goose_mode().await;
        self.update_goose_mode(mode, session_id).await
    }

    pub async fn update_thinking_effort(
        &self,
        session_id: &str,
        effort: ThinkingEffort,
    ) -> Result<()> {
        let current_provider = self.provider().await?;
        let provider_name = current_provider.get_name().to_string();
        let model_config = self
            .model_config_for_session(session_id)
            .await?
            .with_thinking_effort(effort);

        self.recreate_provider_for_session(session_id, &provider_name, model_config)
            .await
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

    pub async fn list_extension_prompts(&self, session_id: &str) -> HashMap<String, Vec<Prompt>> {
        self.extension_manager
            .list_prompts(session_id, CancellationToken::default())
            .await
            .expect("Failed to list prompts")
    }

    pub async fn get_prompt(
        &self,
        session_id: &str,
        name: &str,
        arguments: Value,
    ) -> Result<GetPromptResult> {
        // First find which extension has this prompt
        let prompts = self
            .extension_manager
            .list_prompts(session_id, CancellationToken::default())
            .await
            .map_err(|e| anyhow!("Failed to list prompts: {}", e))?;

        if let Some(extension) = prompts
            .iter()
            .find(|(_, prompt_list)| prompt_list.iter().any(|p| p.name == name))
            .map(|(extension, _)| extension)
        {
            return self
                .extension_manager
                .get_prompt(
                    session_id,
                    extension,
                    name,
                    arguments,
                    CancellationToken::default(),
                )
                .await
                .map_err(|e| anyhow!("Failed to get prompt: {}", e));
        }

        Err(anyhow!("Prompt '{}' not found", name))
    }

    pub async fn get_plan_prompt(&self, session_id: &str) -> Result<String> {
        let tools = self
            .extension_manager
            .get_prefixed_tools(session_id, None)
            .await?;
        let tools_info = tools
            .into_iter()
            .map(|tool| {
                ToolInfo::new(
                    &tool.name,
                    tool.description
                        .as_ref()
                        .map(|d| d.as_ref())
                        .unwrap_or_default(),
                    get_parameter_names(&tool),
                    None,
                )
            })
            .collect();

        let plan_prompt = self.extension_manager.get_planning_prompt(tools_info).await;

        Ok(plan_prompt)
    }

    pub async fn create_recipe(
        &self,
        session_id: &str,
        mut messages: Conversation,
    ) -> Result<Recipe> {
        tracing::info!("Starting recipe creation with {} messages", messages.len());

        let session = self
            .config
            .session_manager
            .get_session(session_id, false)
            .await?;
        let extensions_info = self
            .extension_manager
            .get_extensions_info(&session.working_dir)
            .await;
        tracing::debug!("Retrieved {} extensions info", extensions_info.len());
        let (extension_count, tool_count) = self.total_extension_and_tool_counts(session_id).await;

        let model_config = self.model_config_for_session(session_id).await?;
        let model_name = &model_config.model_name;
        tracing::debug!("Using model: {}", model_name);

        let goose_mode = *self.current_goose_mode.lock().await;
        let prompt_manager = self.prompt_manager.lock().await;
        let system_prompt = prompt_manager
            .builder()
            .with_extensions(extensions_info.into_iter())
            .with_extension_and_tool_counts(extension_count, tool_count)
            .with_goose_mode(goose_mode)
            .build();

        let recipe_prompt = prompt_manager.get_recipe_prompt().await;
        let tools: Vec<_> = self
            .extension_manager
            .get_prefixed_tools(session_id, None)
            .await
            .map_err(|e| {
                tracing::error!("Failed to get tools for recipe creation: {}", e);
                e
            })?
            .into_iter()
            .filter(super::reply_parts::is_tool_visible_to_model)
            .collect();

        messages.push(Message::user().with_text(recipe_prompt));

        let (messages, issues) = fix_conversation(messages);
        if !issues.is_empty() {
            issues
                .iter()
                .for_each(|issue| tracing::warn!(recipe.conversation.issue = issue));
        }

        tracing::debug!(
            "Added recipe prompt to messages, total messages: {}",
            messages.len()
        );

        tracing::info!("Calling provider to generate recipe content");
        let provider = self.provider.lock().await;
        let provider = provider.as_ref().ok_or_else(|| {
            let error = anyhow!("Provider not available during recipe creation");
            tracing::error!("{}", error);
            error
        })?;
        let (result, _usage) = crate::session_context::with_session_id(
            Some(session_id.to_string()),
            provider.complete(&model_config, &system_prompt, messages.messages(), &tools),
        )
        .await
        .map_err(|e| {
            tracing::error!("Provider completion failed during recipe creation: {}", e);
            e
        })?;

        let content = result.as_concat_text();
        tracing::debug!(
            "Provider returned content with {} characters",
            content.len()
        );

        // the response may be contained in ```json ```, strip that before parsing json
        let re = Regex::new(r"(?s)```[^\n]*\n(.*?)\n```").unwrap();
        let clean_content = re
            .captures(&content)
            .and_then(|caps| caps.get(1).map(|m| m.as_str()))
            .unwrap_or(&content)
            .trim()
            .to_string();

        let (instructions, activities) =
            if let Ok(json_content) = serde_json::from_str::<Value>(&clean_content) {
                let instructions = json_content
                    .get("instructions")
                    .ok_or_else(|| anyhow!("Missing 'instructions' in json response"))?
                    .as_str()
                    .ok_or_else(|| anyhow!("instructions' is not a string"))?
                    .to_string();

                let activities = json_content
                    .get("activities")
                    .ok_or_else(|| anyhow!("Missing 'activities' in json response"))?
                    .as_array()
                    .ok_or_else(|| anyhow!("'activities' is not an array'"))?
                    .iter()
                    .map(|act| {
                        act.as_str()
                            .map(|s| s.to_string())
                            .ok_or(anyhow!("'activities' array element is not a string"))
                    })
                    .collect::<Result<_, _>>()?;

                (instructions, activities)
            } else {
                tracing::warn!("Failed to parse JSON, falling back to string parsing");
                // If we can't get valid JSON, try string parsing
                // Use split_once to get the content after "Instructions:".
                let after_instructions = content
                    .split_once("instructions:")
                    .map(|(_, rest)| rest)
                    .unwrap_or(&content);

                // Split once more to separate instructions from activities.
                let (instructions_part, activities_text) = after_instructions
                    .split_once("activities:")
                    .unwrap_or((after_instructions, ""));

                let instructions = instructions_part
                    .trim_end_matches(|c: char| c.is_whitespace() || c == '#')
                    .trim()
                    .to_string();
                let activities_text = activities_text.trim();

                // Regex to remove bullet markers or numbers with an optional dot.
                let bullet_re = Regex::new(r"^[•\-*\d]+\.?\s*").expect("Invalid regex");

                // Process each line in the activities section.
                let activities: Vec<String> = activities_text
                    .lines()
                    .map(|line| bullet_re.replace(line, "").to_string())
                    .map(|s| s.trim().to_string())
                    .filter(|line| !line.is_empty())
                    .collect();

                (instructions, activities)
            };

        let extension_configs = get_enabled_extensions();

        let author = Author {
            contact: std::env::var("USER")
                .or_else(|_| std::env::var("USERNAME"))
                .ok(),
            metadata: None,
        };

        // Ideally we'd get the name of the provider we are using from the provider itself,
        // but it doesn't know and the plumbing looks complicated.
        let config = Config::global();
        let provider_name: String = config
            .get_goose_provider()
            .expect("No provider configured. Run 'goose configure' first");

        let settings = Settings {
            goose_provider: Some(provider_name.clone()),
            goose_model: Some(model_name.clone()),
            temperature: Some(model_config.temperature.unwrap_or(0.0)),
            max_turns: None,
        };

        tracing::debug!(
            "Building recipe with {} activities and {} extensions",
            activities.len(),
            extension_configs.len()
        );

        let (title, description) =
            if let Ok(json_content) = serde_json::from_str::<Value>(&clean_content) {
                let title = json_content
                    .get("title")
                    .and_then(|t| t.as_str())
                    .unwrap_or("Custom recipe from chat")
                    .to_string();

                let description = json_content
                    .get("description")
                    .and_then(|d| d.as_str())
                    .unwrap_or("a custom recipe instance from this chat session")
                    .to_string();

                (title, description)
            } else {
                (
                    "Custom recipe from chat".to_string(),
                    "a custom recipe instance from this chat session".to_string(),
                )
            };

        let recipe = Recipe::builder()
            .title(title)
            .description(description)
            .instructions(instructions)
            .activities(activities)
            .extensions(extension_configs)
            .settings(settings)
            .author(author)
            .build()
            .map_err(|e| {
                tracing::error!("Failed to build recipe: {}", e);
                anyhow!("Recipe build failed: {}", e)
            })?;

        tracing::info!("Recipe creation completed successfully");
        Ok(recipe)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::permission::permission_confirmation::PrincipalType;
    use crate::providers::base::PermissionRouting;
    use crate::recipe::Response;
    use goose_providers::errors::ProviderError;

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

    struct ActionRequiredProvider {
        handled: tokio::sync::Mutex<Vec<(String, PermissionConfirmation)>>,
    }

    impl ActionRequiredProvider {
        fn new() -> Self {
            Self {
                handled: tokio::sync::Mutex::new(Vec::new()),
            }
        }
    }

    impl std::fmt::Debug for ActionRequiredProvider {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            f.debug_struct("ActionRequiredProvider").finish()
        }
    }

    #[async_trait::async_trait]
    impl crate::providers::base::Provider for ActionRequiredProvider {
        fn get_name(&self) -> &str {
            "test-action-required"
        }
        async fn stream(
            &self,
            _: &goose_providers::model::ModelConfig,
            _: &str,
            _: &[crate::conversation::message::Message],
            _: &[rmcp::model::Tool],
        ) -> Result<crate::providers::base::MessageStream, ProviderError> {
            unimplemented!()
        }
        fn permission_routing(&self) -> PermissionRouting {
            PermissionRouting::ActionRequired
        }
        async fn handle_permission_confirmation(
            &self,
            request_id: &str,
            confirmation: &PermissionConfirmation,
        ) -> bool {
            self.handled
                .lock()
                .await
                .push((request_id.to_string(), confirmation.clone()));
            request_id == "known"
        }
    }

    #[tokio::test]
    async fn test_handle_confirmation_routes_to_provider() {
        let agent = Agent::new();
        let provider = Arc::new(ActionRequiredProvider::new());
        *agent.provider.lock().await =
            Some(provider.clone() as Arc<dyn crate::providers::base::Provider>);

        // Known request_id → provider handles it, confirmation_router NOT called
        agent
            .handle_confirmation(
                "known".to_string(),
                PermissionConfirmation {
                    principal_type: PrincipalType::Tool,
                    permission: crate::permission::Permission::AllowOnce,
                },
            )
            .await;
        assert_eq!(provider.handled.lock().await.len(), 1);

        // Unknown request_id → provider returns false, falls through to confirmation_router
        // Register first so deliver() has somewhere to send
        let rx = agent
            .tool_confirmation_router
            .register("unknown".to_string())
            .await;
        agent
            .handle_confirmation(
                "unknown".to_string(),
                PermissionConfirmation {
                    principal_type: PrincipalType::Tool,
                    permission: crate::permission::Permission::DenyOnce,
                },
            )
            .await;
        assert_eq!(provider.handled.lock().await.len(), 2);
        // Verify the fallthrough went to confirmation_router
        let conf = rx.await.unwrap();
        assert_eq!(conf.permission, crate::permission::Permission::DenyOnce);
    }

    #[tokio::test]
    async fn test_handle_confirmation_noop_provider() {
        let agent = Agent::new();
        // No provider set → Noop routing, goes straight to confirmation_router
        // Register first so deliver() has somewhere to send
        let rx = agent
            .tool_confirmation_router
            .register("any".to_string())
            .await;
        agent
            .handle_confirmation(
                "any".to_string(),
                PermissionConfirmation {
                    principal_type: PrincipalType::Tool,
                    permission: crate::permission::Permission::AllowOnce,
                },
            )
            .await;

        let conf = rx.await.unwrap();
        assert_eq!(conf.permission, crate::permission::Permission::AllowOnce);
    }

    #[tokio::test]
    async fn test_add_final_output_tool() -> Result<()> {
        let agent = Agent::new();

        let response = Response {
            json_schema: Some(serde_json::json!({
                "type": "object",
                "properties": {
                    "result": {"type": "string"}
                }
            })),
        };

        agent.add_final_output_tool(response).await;

        let tools = agent.list_tools("test-session-id", None).await;
        let final_output_tool = tools
            .iter()
            .find(|tool| tool.name == FINAL_OUTPUT_TOOL_NAME);

        assert!(
            final_output_tool.is_some(),
            "Final output tool should be present after adding"
        );

        let final_output_tool_ref = agent.final_output_tool.lock().await;
        assert!(final_output_tool_ref
            .as_ref()
            .and_then(|tool| tool.response.json_schema.as_ref())
            .is_some());
        Ok(())
    }

    #[test]
    fn categorize_tool_recognizes_conventional_names() {
        assert_eq!(categorize_tool("developer__shell"), ToolCategory::Shell);
        assert_eq!(categorize_tool("filesystem__write"), ToolCategory::Write);
        assert_eq!(categorize_tool("filesystem__edit"), ToolCategory::Write);
        assert_eq!(categorize_tool("filesystem__read"), ToolCategory::Read);
        assert_eq!(categorize_tool("filesystem__view"), ToolCategory::Read);
        assert_eq!(categorize_tool("filesystem__cat"), ToolCategory::Read);
        assert_eq!(categorize_tool("scheduler__list"), ToolCategory::Other);
        assert_eq!(categorize_tool("shell"), ToolCategory::Shell);
    }

    #[test]
    fn extract_string_arg_picks_first_present_key() {
        let input = serde_json::json!({ "file_path": "/tmp/a.txt", "path": "/tmp/b.txt" });
        assert_eq!(
            extract_string_arg(&input, &["path", "file", "file_path"]).as_deref(),
            Some("/tmp/b.txt")
        );
        let input = serde_json::json!({ "file_path": "/tmp/a.txt" });
        assert_eq!(
            extract_string_arg(&input, &["path", "file", "file_path"]).as_deref(),
            Some("/tmp/a.txt")
        );
        let input = serde_json::json!({ "other": 1 });
        assert!(extract_string_arg(&input, &["path"]).is_none());
        let input = serde_json::json!({ "path": "" });
        assert!(extract_string_arg(&input, &["path"]).is_none());
    }
}
