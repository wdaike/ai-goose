use std::collections::HashMap;
use std::future::Future;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

use anyhow::{anyhow, Result};
use codex_core_api::{
    init_state_db, install_image_generation_extension, local_agent_graph_store_from_state_db,
    resolve_installation_id, set_default_originator, thread_store_from_config, AbsolutePathBuf,
    Arg0DispatchPaths, AskForApproval, AuthManager, CodexHomeUserInstructionsProvider, CodexThread,
    Config, Constrained, EnvironmentManager, EventMsg, ExecServerRuntimePaths,
    ExtensionRegistryBuilder, NewThread, Op, PermissionProfile, Permissions, SessionSource,
    ThreadId, ThreadManager, UserInput,
};
use codex_protocol::parse_command::ParsedCommand;
use futures::stream::BoxStream;
use goose_providers::conversation::token_usage::{ProviderUsage, Usage};
use rmcp::model::{CallToolRequestParams, CallToolResult, Content};
use serde::{Deserialize, Serialize};
use tokio::sync::{Mutex, OnceCell};
use tokio_util::sync::CancellationToken;
use toml::Value as TomlValue;

use crate::agents::extension::ExtensionConfig;
use crate::agents::{AgentEvent, SessionConfig};
use crate::config::GooseMode;
use crate::conversation::message::{
    Message, MessageContent, SystemNotificationType, TOOL_META_EXTERNAL_DISPATCH_KEY,
};
use crate::session::extension_data::{EnabledExtensionsState, ExtensionState};
use crate::session::{Session, SessionManager};

static RUNTIME_PATHS: OnceLock<Arg0DispatchPaths> = OnceLock::new();

pub fn run<F, Fut>(main_fn: F) -> Result<()>
where
    F: FnOnce() -> Fut + Send + 'static,
    Fut: Future<Output = Result<()>>,
{
    codex_core_api::arg0_dispatch_or_else(move |paths| async move {
        let _ = RUNTIME_PATHS.set(paths);
        main_fn().await
    })
}

pub(crate) struct CodexAgentCore {
    runtime: Arc<OnceCell<CodexRuntime>>,
    threads: Mutex<HashMap<String, ActiveThread>>,
}

#[derive(Clone)]
struct ActiveThread {
    thread: Arc<CodexThread>,
    model: String,
}

#[derive(Clone, Deserialize, Serialize)]
struct CodexSessionState {
    thread_id: String,
    model: String,
    rollout_path: PathBuf,
}

impl ExtensionState for CodexSessionState {
    const EXTENSION_NAME: &'static str = "codex";
    const VERSION: &'static str = "v0";
}

impl CodexAgentCore {
    pub(crate) fn new(runtime: Arc<OnceCell<CodexRuntime>>) -> Self {
        Self {
            runtime,
            threads: Mutex::new(HashMap::new()),
        }
    }

    pub(crate) async fn steer(&self, session_id: &str, message: &Message) -> Result<bool> {
        let active_thread = self.threads.lock().await.get(session_id).cloned();
        let Some(active_thread) = active_thread else {
            return Ok(false);
        };

        active_thread
            .thread
            .steer_input(
                message_to_codex_input(message),
                Default::default(),
                None,
                message.id.clone(),
                None,
            )
            .await
            .map_err(|error| anyhow!("{error:?}"))?;
        Ok(true)
    }

    pub(crate) async fn invalidate_session(&self, session: &Session) {
        let active_thread = self.threads.lock().await.remove(&session.id);
        let thread_id = active_thread
            .map(|active| active.thread.session_configured().thread_id)
            .or_else(|| {
                CodexSessionState::from_extension_data(&session.extension_data)
                    .and_then(|state| ThreadId::try_from(state.thread_id.as_str()).ok())
            });
        if let (Some(runtime), Some(thread_id)) = (self.runtime.get(), thread_id) {
            if let Some(thread) = runtime.thread_manager.remove_thread(&thread_id).await {
                let _ = thread.shutdown_and_wait().await;
            }
        }
    }

    pub(crate) async fn reply(
        &self,
        session_manager: Arc<SessionManager>,
        user_message: Message,
        session_config: SessionConfig,
        cancel_token: Option<CancellationToken>,
        base_instructions: Option<String>,
        developer_instructions: Option<String>,
        final_output_json_schema: Option<serde_json::Value>,
    ) -> Result<BoxStream<'static, Result<AgentEvent>>> {
        let session = session_manager
            .get_session(&session_config.id, false)
            .await?;
        let active_thread = self
            .thread_for_session(
                &session_manager,
                &session,
                base_instructions,
                developer_instructions,
            )
            .await?;
        let thread = active_thread.thread;
        let input = message_to_codex_input(&user_message);

        session_manager
            .add_message(&session_config.id, &user_message)
            .await?;
        thread
            .submit(Op::UserInput {
                items: input,
                final_output_json_schema,
                responsesapi_client_metadata: None,
                additional_context: Default::default(),
                thread_settings: Default::default(),
            })
            .await
            .map_err(|error| anyhow!(error.to_string()))?;

        let session_id = session_config.id;
        let model = active_thread.model;

        Ok(Box::pin(async_stream::try_stream! {
            let mut streamed_agent_text = false;
            let mut agent_text = String::new();
            loop {
                let event = if let Some(cancel_token) = cancel_token.as_ref() {
                    tokio::select! {
                        _ = cancel_token.cancelled() => {
                            let _ = thread.submit(Op::Interrupt).await;
                            while let Ok(event) = thread.next_event().await {
                                if matches!(event.msg, EventMsg::TurnAborted(_) | EventMsg::TurnComplete(_)) {
                                    break;
                                }
                            }
                            break;
                        }
                        event = thread.next_event() => event,
                    }
                } else {
                    thread.next_event().await
                }
                .map_err(|error| anyhow!(error.to_string()))?;

                match event.msg {
                    EventMsg::AgentMessageContentDelta(event) => {
                        streamed_agent_text = true;
                        agent_text.push_str(&event.delta);
                        yield AgentEvent::Message(Message::assistant().with_text(event.delta));
                    }
                    EventMsg::ReasoningContentDelta(event) => {
                        yield AgentEvent::Message(
                            Message::assistant().with_thinking(event.delta, ""),
                        );
                    }
                    EventMsg::ExecCommandBegin(event) => {
                        let command = event.command.join(" ");
                        let tool_name = codex_exec_tool_name(&event.parsed_cmd);
                        let message = tool_request_message(
                            event.call_id,
                            tool_name,
                            serde_json::json!({
                                "command": command,
                                "cwd": event.cwd.to_string(),
                                "command_actions": event.parsed_cmd,
                            }),
                        );
                        session_manager.add_message(&session_id, &message).await?;
                        yield AgentEvent::Message(message);
                    }
                    EventMsg::ExecCommandEnd(event) => {
                        let output = if event.aggregated_output.is_empty() {
                            format!("{}{}", event.stdout, event.stderr)
                        } else {
                            event.aggregated_output
                        };
                        let message = tool_response_message(
                            event.call_id,
                            output,
                            event.exit_code != 0,
                        );
                        session_manager.add_message(&session_id, &message).await?;
                        yield AgentEvent::Message(message);
                    }
                    EventMsg::PatchApplyBegin(event) => {
                        let message = tool_request_message(
                            event.call_id,
                            "apply_patch",
                            serde_json::json!({ "changes": event.changes }),
                        );
                        session_manager.add_message(&session_id, &message).await?;
                        yield AgentEvent::Message(message);
                    }
                    EventMsg::PatchApplyEnd(event) => {
                        let output = if event.stdout.is_empty() {
                            event.stderr
                        } else if event.stderr.is_empty() {
                            event.stdout
                        } else {
                            format!("{}\n{}", event.stdout, event.stderr)
                        };
                        let message = tool_response_message(event.call_id, output, !event.success);
                        session_manager.add_message(&session_id, &message).await?;
                        yield AgentEvent::Message(message);
                    }
                    EventMsg::McpToolCallBegin(event) => {
                        let name = format!("{}__{}", event.invocation.server, event.invocation.tool);
                        let message = tool_request_message(
                            event.call_id,
                            name,
                            event.invocation.arguments.unwrap_or_else(|| serde_json::json!({})),
                        );
                        session_manager.add_message(&session_id, &message).await?;
                        yield AgentEvent::Message(message);
                    }
                    EventMsg::McpToolCallEnd(event) => {
                        let result = match event.result {
                            Ok(result) => serde_json::from_value(serde_json::to_value(result)?)
                                .unwrap_or_else(|error| {
                                    CallToolResult::error(vec![Content::text(error.to_string())])
                                }),
                            Err(error) => CallToolResult::error(vec![Content::text(error)]),
                        };
                        let message = Message::user()
                            .with_generated_id()
                            .with_tool_response(event.call_id, Ok(result));
                        session_manager.add_message(&session_id, &message).await?;
                        yield AgentEvent::Message(message);
                    }
                    EventMsg::WebSearchBegin(event) => {
                        let message = tool_request_message(
                            event.call_id,
                            "web_search",
                            serde_json::json!({}),
                        );
                        session_manager.add_message(&session_id, &message).await?;
                        yield AgentEvent::Message(message);
                    }
                    EventMsg::WebSearchEnd(event) => {
                        let message = tool_response_message(
                            event.call_id,
                            serde_json::to_string(&serde_json::json!({
                                "query": event.query,
                                "action": event.action,
                            }))?,
                            false,
                        );
                        session_manager.add_message(&session_id, &message).await?;
                        yield AgentEvent::Message(message);
                    }
                    EventMsg::ImageGenerationBegin(event) => {
                        let message = tool_request_message(
                            event.call_id,
                            "image_generation",
                            serde_json::json!({}),
                        );
                        session_manager.add_message(&session_id, &message).await?;
                        yield AgentEvent::Message(message);
                    }
                    EventMsg::ImageGenerationEnd(event) => {
                        let message = tool_response_message(
                            event.call_id,
                            serde_json::to_string(&serde_json::json!({
                                "status": event.status,
                                "revised_prompt": event.revised_prompt,
                                "result": event.result,
                                "saved_path": event.saved_path,
                            }))?,
                            false,
                        );
                        session_manager.add_message(&session_id, &message).await?;
                        yield AgentEvent::Message(message);
                    }
                    EventMsg::ViewImageToolCall(event) => {
                        let call_id = event.call_id;
                        let path = event.path.to_string();
                        let request = tool_request_message(
                            call_id.clone(),
                            "view_image",
                            serde_json::json!({ "path": path }),
                        );
                        session_manager.add_message(&session_id, &request).await?;
                        yield AgentEvent::Message(request);
                        let response = tool_response_message(call_id, String::new(), false);
                        session_manager.add_message(&session_id, &response).await?;
                        yield AgentEvent::Message(response);
                    }
                    EventMsg::TokenCount(event) => {
                        if let Some(info) = event.info {
                            let last = info.last_token_usage;
                            let usage = Usage::new(
                                Some(saturating_i32(last.input_tokens)),
                                Some(saturating_i32(last.output_tokens)),
                                Some(saturating_i32(last.total_tokens)),
                            )
                            .with_cache_tokens(
                                Some(saturating_i32(last.cached_input_tokens)),
                                None,
                            );
                            let total = info.total_token_usage;
                            let accumulated_usage = Usage::new(
                                Some(saturating_i32(total.input_tokens)),
                                Some(saturating_i32(total.output_tokens)),
                                Some(saturating_i32(total.total_tokens)),
                            )
                            .with_cache_tokens(
                                Some(saturating_i32(total.cached_input_tokens)),
                                None,
                            );
                            session_manager
                                .update(&session_id)
                                .usage(usage)
                                .accumulated_usage(accumulated_usage)
                                .apply()
                                .await?;
                            yield AgentEvent::Usage(ProviderUsage::new(
                                model.clone(),
                                usage,
                            ));
                        }
                    }
                    EventMsg::Warning(event) => {
                        yield AgentEvent::Message(
                            Message::assistant().with_system_notification(
                                SystemNotificationType::InlineMessage,
                                event.message,
                            ),
                        );
                    }
                    EventMsg::TurnComplete(event) => {
                        let text = event
                            .last_agent_message
                            .filter(|text| !text.is_empty())
                            .or_else(|| (!agent_text.is_empty()).then_some(agent_text));
                        if let Some(text) = text {
                            let message = Message::assistant().with_generated_id().with_text(text);
                            session_manager.add_message(&session_id, &message).await?;
                            if !streamed_agent_text {
                                yield AgentEvent::Message(message);
                            }
                        }
                        break;
                    }
                    EventMsg::Error(event) => Err(anyhow!(event.message))?,
                    EventMsg::TurnAborted(_) => {
                        if cancel_token.as_ref().is_none_or(|token| !token.is_cancelled()) {
                            Err(anyhow!("Codex turn aborted"))?;
                        }
                        break;
                    }
                    EventMsg::ExecApprovalRequest(_)
                    | EventMsg::ApplyPatchApprovalRequest(_)
                    | EventMsg::RequestPermissions(_)
                    | EventMsg::RequestUserInput(_)
                    | EventMsg::DynamicToolCallRequest(_)
                    | EventMsg::ElicitationRequest(_) => {
                        let _ = thread.submit(Op::Interrupt).await;
                        Err(anyhow!("Codex requested an interaction that this frontend does not support"))?;
                    }
                    _ => {}
                }
            }
        }))
    }

    async fn thread_for_session(
        &self,
        session_manager: &SessionManager,
        session: &Session,
        base_instructions: Option<String>,
        developer_instructions: Option<String>,
    ) -> Result<ActiveThread> {
        if let Some(thread) = self.threads.lock().await.get(&session.id).cloned() {
            return Ok(thread);
        }

        let runtime = self.runtime.get_or_try_init(CodexRuntime::new).await?;
        let mut threads = self.threads.lock().await;
        if let Some(thread) = threads.get(&session.id).cloned() {
            return Ok(thread);
        }

        let state = CodexSessionState::from_extension_data(&session.extension_data);
        if let Some(state) = state.as_ref() {
            let thread_id = ThreadId::try_from(state.thread_id.as_str())
                .map_err(|error| anyhow!(error.to_string()))?;
            if let Ok(thread) = runtime.thread_manager.get_thread(thread_id).await {
                let active_thread = ActiveThread {
                    thread,
                    model: state.model.clone(),
                };
                threads.insert(session.id.clone(), active_thread.clone());
                return Ok(active_thread);
            }
        }

        let config = runtime
            .config_for_session(session, base_instructions, developer_instructions)
            .await?;
        let new_thread = if let Some(state) = state {
            runtime
                .thread_manager
                .resume_thread_from_rollout(
                    config,
                    state.rollout_path,
                    Arc::clone(&runtime.auth_manager),
                    None,
                    false,
                )
                .await
        } else {
            runtime.thread_manager.start_thread(config).await
        }
        .map_err(|error| anyhow!(error.to_string()))?;

        let NewThread {
            thread,
            session_configured,
            ..
        } = new_thread;
        if let Some(rollout_path) = session_configured.rollout_path.clone() {
            let mut extension_data = session.extension_data.clone();
            CodexSessionState {
                thread_id: session_configured.thread_id.to_string(),
                model: session_configured.model.clone(),
                rollout_path,
            }
            .to_extension_data(&mut extension_data)?;
            session_manager
                .update(&session.id)
                .extension_data(extension_data)
                .apply()
                .await?;
        }
        let active_thread = ActiveThread {
            thread,
            model: session_configured.model,
        };
        threads.insert(session.id.clone(), active_thread.clone());
        Ok(active_thread)
    }
}

pub(crate) struct CodexRuntime {
    thread_manager: ThreadManager,
    auth_manager: Arc<AuthManager>,
    paths: Arg0DispatchPaths,
}

impl CodexRuntime {
    async fn new() -> Result<Self> {
        let _ = set_default_originator("goose".to_string());
        let paths = runtime_paths();
        let mut config = Config::load_with_cli_overrides(Vec::new()).await?;
        apply_runtime_paths(&mut config, &paths);

        let state_db = init_state_db(&config).await;
        let auth_manager = AuthManager::shared_from_config(&config, true).await;
        let local_runtime_paths = ExecServerRuntimePaths::from_optional_paths(
            config.codex_self_exe.clone(),
            config.codex_linux_sandbox_exe.clone(),
        )?;
        let thread_store = thread_store_from_config(&config, state_db.clone());
        let environment_manager = Arc::new(
            EnvironmentManager::from_codex_home(
                config.codex_home.clone(),
                Some(local_runtime_paths),
            )
            .await?,
        );
        let user_instructions_provider = Arc::new(CodexHomeUserInstructionsProvider::new(
            config.codex_home.clone(),
        ));
        let installation_id = resolve_installation_id(&config.codex_home).await?;
        let mut extensions = ExtensionRegistryBuilder::<Config>::new();
        install_image_generation_extension(
            &mut extensions,
            Arc::clone(&auth_manager),
            |config: &Config| Some(config.codex_home.clone()),
        );
        codex_web_search_extension::install(&mut extensions, Arc::clone(&auth_manager));
        let thread_manager = ThreadManager::new(
            &config,
            Arc::clone(&auth_manager),
            SessionSource::Custom("goose".to_string()),
            environment_manager,
            Arc::new(extensions.build()),
            user_instructions_provider,
            None,
            Arc::clone(&thread_store),
            local_agent_graph_store_from_state_db(state_db.as_ref()),
            installation_id,
            None,
            None,
        );

        Ok(Self {
            thread_manager,
            auth_manager,
            paths,
        })
    }

    async fn config_for_session(
        &self,
        session: &Session,
        base_instructions: Option<String>,
        developer_instructions: Option<String>,
    ) -> Result<Config> {
        let mut config = Config::load_with_cli_overrides(mcp_overrides(session).await?).await?;
        apply_runtime_paths(&mut config, &self.paths);

        let cwd = AbsolutePathBuf::from_absolute_path(&session.working_dir)?;
        let profile = match session.goose_mode {
            GooseMode::Auto => PermissionProfile::Disabled,
            GooseMode::SmartApprove => PermissionProfile::workspace_write(),
            GooseMode::Approve | GooseMode::Chat => PermissionProfile::read_only(),
        };
        let mut permissions = Permissions::from_approval_and_profile(
            Constrained::allow_any(AskForApproval::Never),
            Constrained::allow_any(profile),
        )?;
        permissions.set_workspace_roots(vec![cwd.clone()]);

        config.cwd = cwd.clone();
        config.workspace_roots = vec![cwd];
        config.workspace_roots_explicit = true;
        config.permissions = permissions;
        if session
            .provider_name
            .as_deref()
            .is_none_or(|name| name == "codex")
        {
            if let Some(model_config) = session.model_config.as_ref() {
                config.model = Some(model_config.model_name.clone());
            }
        }
        config.base_instructions = base_instructions;
        config.developer_instructions = developer_instructions;
        Ok(config)
    }
}

fn runtime_paths() -> Arg0DispatchPaths {
    RUNTIME_PATHS
        .get()
        .cloned()
        .unwrap_or_else(|| Arg0DispatchPaths {
            codex_self_exe: std::env::current_exe().ok(),
            codex_linux_sandbox_exe: None,
            main_execve_wrapper_exe: None,
        })
}

fn apply_runtime_paths(config: &mut Config, paths: &Arg0DispatchPaths) {
    config.codex_self_exe = paths.codex_self_exe.clone();
    config.codex_linux_sandbox_exe = paths.codex_linux_sandbox_exe.clone();
    config.main_execve_wrapper_exe = paths.main_execve_wrapper_exe.clone();
}

fn message_to_codex_input(message: &Message) -> Vec<UserInput> {
    let mut input = Vec::new();
    for content in &message.content {
        match content {
            MessageContent::Text(text) => input.push(UserInput::Text {
                text: text.text.clone(),
                text_elements: Vec::new(),
            }),
            MessageContent::Image(image) => input.push(UserInput::Image {
                image_url: format!("data:{};base64,{}", image.mime_type, image.data),
                detail: None,
            }),
            _ => {}
        }
    }
    input
}

fn tool_request_message(
    call_id: String,
    name: impl Into<String>,
    arguments: serde_json::Value,
) -> Message {
    let arguments = arguments.as_object().cloned().unwrap_or_default();
    Message::assistant()
        .with_generated_id()
        .with_tool_request_with_metadata(
            call_id,
            Ok(CallToolRequestParams::new(name.into()).with_arguments(arguments)),
            None,
            Some(serde_json::Value::Object(serde_json::Map::from_iter([(
                TOOL_META_EXTERNAL_DISPATCH_KEY.to_string(),
                serde_json::Value::Bool(true),
            )]))),
        )
}

fn codex_exec_tool_name(parsed_commands: &[ParsedCommand]) -> &'static str {
    if parsed_commands.is_empty() {
        return "shell";
    }

    if parsed_commands
        .iter()
        .all(|command| matches!(command, ParsedCommand::ListFiles { .. }))
    {
        "list_files"
    } else if parsed_commands
        .iter()
        .all(|command| matches!(command, ParsedCommand::Read { .. }))
    {
        "read_files"
    } else if parsed_commands
        .iter()
        .all(|command| matches!(command, ParsedCommand::Search { .. }))
    {
        "search_files"
    } else {
        "shell"
    }
}

fn tool_response_message(call_id: String, output: String, is_error: bool) -> Message {
    let content = vec![Content::text(output)];
    let result = if is_error {
        CallToolResult::error(content)
    } else {
        CallToolResult::success(content)
    };
    Message::user()
        .with_generated_id()
        .with_tool_response(call_id, Ok(result))
}

async fn mcp_overrides(session: &Session) -> Result<Vec<(String, TomlValue)>> {
    let Some(state) = EnabledExtensionsState::from_extension_data(&session.extension_data) else {
        return Ok(Vec::new());
    };
    let mut servers = toml::map::Map::new();

    for extension in state.extensions {
        let extension = extension.resolve(crate::config::Config::global()).await?;
        let mut server = toml::map::Map::new();
        let name = extension.name();
        match extension {
            ExtensionConfig::Stdio {
                cmd,
                args,
                envs,
                env_keys,
                timeout,
                cwd,
                available_tools,
                ..
            } => {
                server.insert("command".to_string(), TomlValue::String(cmd));
                server.insert(
                    "args".to_string(),
                    TomlValue::Array(args.into_iter().map(TomlValue::String).collect()),
                );
                let env = envs
                    .get_env()
                    .into_iter()
                    .map(|(key, value)| (key, TomlValue::String(value)))
                    .collect();
                server.insert("env".to_string(), TomlValue::Table(env));
                if !env_keys.is_empty() {
                    server.insert(
                        "env_vars".to_string(),
                        TomlValue::Array(env_keys.into_iter().map(TomlValue::String).collect()),
                    );
                }
                if let Some(cwd) = cwd {
                    server.insert("cwd".to_string(), TomlValue::String(cwd));
                }
                if let Some(timeout) = timeout {
                    server.insert(
                        "tool_timeout_sec".to_string(),
                        TomlValue::Float(timeout as f64),
                    );
                }
                if !available_tools.is_empty() {
                    server.insert(
                        "enabled_tools".to_string(),
                        TomlValue::Array(
                            available_tools.into_iter().map(TomlValue::String).collect(),
                        ),
                    );
                }
            }
            ExtensionConfig::StreamableHttp {
                uri,
                headers,
                timeout,
                socket: None,
                available_tools,
                ..
            } => {
                server.insert("url".to_string(), TomlValue::String(uri));
                let headers = headers
                    .into_iter()
                    .map(|(key, value)| (key, TomlValue::String(value)))
                    .collect();
                server.insert("http_headers".to_string(), TomlValue::Table(headers));
                if let Some(timeout) = timeout {
                    server.insert(
                        "tool_timeout_sec".to_string(),
                        TomlValue::Float(timeout as f64),
                    );
                }
                if !available_tools.is_empty() {
                    server.insert(
                        "enabled_tools".to_string(),
                        TomlValue::Array(
                            available_tools.into_iter().map(TomlValue::String).collect(),
                        ),
                    );
                }
            }
            _ => continue,
        }
        servers.insert(name, TomlValue::Table(server));
    }

    if servers.is_empty() {
        Ok(Vec::new())
    } else {
        Ok(vec![("mcp_servers".to_string(), TomlValue::Table(servers))])
    }
}

fn saturating_i32(value: i64) -> i32 {
    value.clamp(i32::MIN as i64, i32::MAX as i64) as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codex_exec_tool_name_uses_list_files_semantics() {
        let commands = vec![ParsedCommand::ListFiles {
            cmd: "ls -la".to_string(),
            path: None,
        }];

        assert_eq!(codex_exec_tool_name(&commands), "list_files");
    }

    #[test]
    fn codex_exec_tool_name_keeps_mixed_commands_as_shell() {
        let commands = vec![
            ParsedCommand::ListFiles {
                cmd: "ls".to_string(),
                path: None,
            },
            ParsedCommand::Unknown {
                cmd: "touch marker".to_string(),
            },
        ];

        assert_eq!(codex_exec_tool_name(&commands), "shell");
    }
}
