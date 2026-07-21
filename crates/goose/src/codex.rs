use std::collections::HashMap;
use std::future::Future;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, OnceLock};

use anyhow::{anyhow, Result};
use codex_app_server_client::{
    EnvironmentManager, ExecServerRuntimePaths, InProcessAppServerClient,
    InProcessAppServerRequestHandle, InProcessClientStartArgs, InProcessServerEvent,
    DEFAULT_IN_PROCESS_CHANNEL_CAPACITY,
};
use codex_app_server_protocol::{
    Account, AskForApproval, ClientRequest, CommandAction, CommandExecutionStatus,
    ConfigWarningNotification, GetAccountParams, GetAccountResponse, JSONRPCErrorError,
    LoginAccountParams, LoginAccountResponse, LogoutAccountResponse, ModelListParams,
    ModelListResponse, PatchApplyStatus, RequestId, SandboxMode, ServerNotification,
    ThreadCompactStartParams, ThreadCompactStartResponse, ThreadItem, ThreadResumeParams,
    ThreadResumeResponse, ThreadStartParams, ThreadStartResponse, ThreadTokenUsage,
    ThreadUnsubscribeParams, ThreadUnsubscribeResponse, TurnInterruptParams, TurnInterruptResponse,
    TurnStartParams, TurnStartResponse, TurnStatus, TurnSteerParams, TurnSteerResponse, UserInput,
};
use codex_config::{CloudConfigBundleLoader, LoaderOverrides};
use codex_core_api::{
    init_state_db, set_default_originator, AbsolutePathBuf, Arg0DispatchPaths, Config,
    SessionSource,
};
use codex_feedback::CodexFeedback;
use futures::stream::BoxStream;
use goose_providers::conversation::token_usage::{ProviderUsage, Usage};
use rmcp::model::{CallToolRequestParams, CallToolResult, Content};
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, Mutex, OnceCell};
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
static NEXT_REQUEST_ID: AtomicI64 = AtomicI64::new(1);

fn next_request_id() -> RequestId {
    RequestId::Integer(NEXT_REQUEST_ID.fetch_add(1, Ordering::Relaxed))
}

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
    thread_id: String,
    model: String,
    active_turn_id: Arc<Mutex<Option<String>>>,
}

#[derive(Clone, Deserialize, Serialize)]
struct CodexSessionState {
    thread_id: String,
}

#[derive(Clone)]
#[allow(clippy::large_enum_variant)]
enum CodexRuntimeEvent {
    Notification(ServerNotification),
    TransportError(String),
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
        let Some(expected_turn_id) = active_thread.active_turn_id.lock().await.clone() else {
            return Ok(false);
        };
        let Some(runtime) = self.runtime.get() else {
            return Ok(false);
        };

        runtime
            .request
            .request_typed::<TurnSteerResponse>(ClientRequest::TurnSteer {
                request_id: next_request_id(),
                params: TurnSteerParams {
                    thread_id: active_thread.thread_id,
                    client_user_message_id: message.id.clone(),
                    input: message_to_codex_input(message),
                    expected_turn_id,
                    ..Default::default()
                },
            })
            .await
            .map_err(|error| anyhow!(error.to_string()))?;
        Ok(true)
    }

    pub(crate) async fn invalidate_session(&self, session: &Session) {
        let active_thread = self.threads.lock().await.remove(&session.id);
        let thread_id = active_thread.map(|active| active.thread_id).or_else(|| {
            CodexSessionState::from_extension_data(&session.extension_data)
                .map(|state| state.thread_id)
        });
        if let (Some(runtime), Some(thread_id)) = (self.runtime.get(), thread_id) {
            let _ = runtime
                .request
                .request_typed::<ThreadUnsubscribeResponse>(ClientRequest::ThreadUnsubscribe {
                    request_id: next_request_id(),
                    params: ThreadUnsubscribeParams { thread_id },
                })
                .await;
        }
    }

    pub(crate) async fn reset_session(
        &self,
        session_manager: &SessionManager,
        session: &Session,
    ) -> Result<()> {
        self.invalidate_session(session).await;
        let mut extension_data = session.extension_data.clone();
        CodexSessionState::remove_from_extension_data(&mut extension_data);
        session_manager
            .update(&session.id)
            .extension_data(extension_data)
            .apply()
            .await
    }

    pub(crate) async fn compact(
        &self,
        session_manager: &SessionManager,
        session: &Session,
        base_instructions: Option<String>,
        developer_instructions: Option<String>,
    ) -> Result<()> {
        let active_thread = self
            .thread_for_session(
                session_manager,
                session,
                base_instructions,
                developer_instructions,
            )
            .await?;
        if active_thread.active_turn_id.lock().await.is_some() {
            return Err(anyhow!("Cannot compact while a Codex turn is active"));
        }
        let runtime = self
            .runtime
            .get()
            .ok_or_else(|| anyhow!("Codex runtime was not initialized"))?;
        let mut events = runtime.events.subscribe();
        runtime
            .request
            .request_typed::<ThreadCompactStartResponse>(ClientRequest::ThreadCompactStart {
                request_id: next_request_id(),
                params: ThreadCompactStartParams {
                    thread_id: active_thread.thread_id.clone(),
                },
            })
            .await
            .map_err(|error| anyhow!(error.to_string()))?;

        let thread_id = active_thread.thread_id;
        let active_turn_id = active_thread.active_turn_id;
        let mut compact_turn_id = None;
        let result = loop {
            let event = match events.recv().await {
                Ok(event) => event,
                Err(error) => break Err(anyhow!("Codex event stream closed: {error}")),
            };
            match event {
                CodexRuntimeEvent::TransportError(message) => {
                    break Err(anyhow!(message));
                }
                CodexRuntimeEvent::Notification(ServerNotification::TurnStarted(event))
                    if event.thread_id == thread_id && compact_turn_id.is_none() =>
                {
                    compact_turn_id = Some(event.turn.id.clone());
                    *active_turn_id.lock().await = Some(event.turn.id);
                }
                CodexRuntimeEvent::Notification(ServerNotification::ThreadTokenUsageUpdated(
                    event,
                )) if event.thread_id == thread_id
                    && compact_turn_id.as_ref() == Some(&event.turn_id) =>
                {
                    let (usage, accumulated_usage) = usage_from_codex(event.token_usage);
                    if let Err(error) = session_manager
                        .update(&session.id)
                        .usage(usage)
                        .accumulated_usage(accumulated_usage)
                        .apply()
                        .await
                    {
                        break Err(error);
                    }
                }
                CodexRuntimeEvent::Notification(ServerNotification::Error(event))
                    if event.thread_id == thread_id
                        && compact_turn_id.as_ref() == Some(&event.turn_id)
                        && !event.will_retry =>
                {
                    break Err(anyhow!(event.error.message));
                }
                CodexRuntimeEvent::Notification(ServerNotification::TurnCompleted(event))
                    if event.thread_id == thread_id
                        && compact_turn_id.as_ref() == Some(&event.turn.id) =>
                {
                    if matches!(event.turn.status, TurnStatus::Completed) {
                        break Ok(());
                    }
                    let message = event
                        .turn
                        .error
                        .map(|error| error.message)
                        .unwrap_or_else(|| format!("Codex compaction {:?}", event.turn.status));
                    break Err(anyhow!(message));
                }
                _ => {}
            }
        };
        *active_turn_id.lock().await = None;
        result
    }

    #[allow(clippy::too_many_arguments)]
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
        let runtime = self
            .runtime
            .get()
            .ok_or_else(|| anyhow!("Codex runtime was not initialized"))?;
        let mut events = runtime.events.subscribe();
        let input = message_to_codex_input(&user_message);

        session_manager
            .add_message(&session_config.id, &user_message)
            .await?;
        let response = runtime
            .request
            .request_typed::<TurnStartResponse>(ClientRequest::TurnStart {
                request_id: next_request_id(),
                params: TurnStartParams {
                    thread_id: active_thread.thread_id.clone(),
                    client_user_message_id: user_message.id.clone(),
                    input,
                    output_schema: final_output_json_schema,
                    ..Default::default()
                },
            })
            .await
            .map_err(|error| anyhow!(error.to_string()))?;

        let session_id = session_config.id;
        let model = active_thread.model.clone();
        let thread_id = active_thread.thread_id.clone();
        let turn_id = response.turn.id;
        let active_turn_id = active_thread.active_turn_id.clone();
        *active_turn_id.lock().await = Some(turn_id.clone());
        let request = runtime.request.clone();

        Ok(Box::pin(async_stream::try_stream! {
            let mut streamed_agent_text = false;
            let mut agent_text = String::new();
            let mut completed_agent_text = None;
            loop {
                let event = if let Some(cancel_token) = cancel_token.as_ref() {
                    tokio::select! {
                        _ = cancel_token.cancelled() => {
                            let _ = request
                                .request_typed::<TurnInterruptResponse>(ClientRequest::TurnInterrupt {
                                    request_id: next_request_id(),
                                    params: TurnInterruptParams {
                                        thread_id: thread_id.clone(),
                                        turn_id: turn_id.clone(),
                                    },
                                })
                                .await;
                            break;
                        }
                        event = events.recv() => event,
                    }
                } else {
                    events.recv().await
                }
                .map_err(|error| anyhow!("Codex event stream closed: {error}"))?;

                match event {
                    CodexRuntimeEvent::TransportError(message) => {
                        *active_turn_id.lock().await = None;
                        Err(anyhow!(message))?;
                    }
                    CodexRuntimeEvent::Notification(ServerNotification::AgentMessageDelta(event))
                        if event.thread_id == thread_id && event.turn_id == turn_id =>
                    {
                        streamed_agent_text = true;
                        agent_text.push_str(&event.delta);
                        yield AgentEvent::Message(Message::assistant().with_text(event.delta));
                    }
                    CodexRuntimeEvent::Notification(
                        ServerNotification::ReasoningSummaryTextDelta(event),
                    ) if event.thread_id == thread_id && event.turn_id == turn_id => {
                        yield AgentEvent::Message(
                            Message::assistant().with_thinking(event.delta, ""),
                        );
                    }
                    CodexRuntimeEvent::Notification(ServerNotification::ReasoningTextDelta(event))
                        if event.thread_id == thread_id && event.turn_id == turn_id =>
                    {
                        yield AgentEvent::Message(
                            Message::assistant().with_thinking(event.delta, ""),
                        );
                    }
                    CodexRuntimeEvent::Notification(ServerNotification::ItemStarted(event))
                        if event.thread_id == thread_id && event.turn_id == turn_id =>
                    {
                        if let Some(message) = tool_request_from_item(&event.item)? {
                            session_manager.add_message(&session_id, &message).await?;
                            yield AgentEvent::Message(message);
                        }
                    }
                    CodexRuntimeEvent::Notification(ServerNotification::ItemCompleted(event))
                        if event.thread_id == thread_id && event.turn_id == turn_id =>
                    {
                        if let ThreadItem::AgentMessage { text, .. } = &event.item {
                            completed_agent_text = Some(text.clone());
                        } else if let Some(message) = tool_response_from_item(&event.item)? {
                            session_manager.add_message(&session_id, &message).await?;
                            yield AgentEvent::Message(message);
                        }
                    }
                    CodexRuntimeEvent::Notification(
                        ServerNotification::ThreadTokenUsageUpdated(event),
                    ) if event.thread_id == thread_id && event.turn_id == turn_id => {
                        let (usage, accumulated_usage) = usage_from_codex(event.token_usage);
                        session_manager
                            .update(&session_id)
                            .usage(usage)
                            .accumulated_usage(accumulated_usage)
                            .apply()
                            .await?;
                        yield AgentEvent::Usage(ProviderUsage::new(model.clone(), usage));
                    }
                    CodexRuntimeEvent::Notification(ServerNotification::Warning(event))
                        if event.thread_id.as_ref().is_none_or(|id| id == &thread_id) =>
                    {
                        yield AgentEvent::Message(
                            Message::assistant().with_system_notification(
                                SystemNotificationType::InlineMessage,
                                event.message,
                            ),
                        );
                    }
                    CodexRuntimeEvent::Notification(ServerNotification::Error(event))
                        if event.thread_id == thread_id
                            && event.turn_id == turn_id
                            && !event.will_retry =>
                    {
                        *active_turn_id.lock().await = None;
                        Err(anyhow!(event.error.message))?;
                    }
                    CodexRuntimeEvent::Notification(ServerNotification::TurnCompleted(event))
                        if event.thread_id == thread_id && event.turn.id == turn_id =>
                    {
                        let text = completed_agent_text
                            .filter(|text: &String| !text.is_empty())
                            .or_else(|| (!agent_text.is_empty()).then_some(agent_text));
                        if let Some(text) = text {
                            let message = Message::assistant().with_generated_id().with_text(text);
                            session_manager.add_message(&session_id, &message).await?;
                            if !streamed_agent_text {
                                yield AgentEvent::Message(message);
                            }
                        }
                        if matches!(event.turn.status, TurnStatus::Failed) {
                            let message = event
                                .turn
                                .error
                                .map(|error| error.message)
                                .unwrap_or_else(|| "Codex turn failed".to_string());
                            *active_turn_id.lock().await = None;
                            Err(anyhow!(message))?;
                        }
                        if matches!(event.turn.status, TurnStatus::Interrupted)
                            && cancel_token.as_ref().is_none_or(|token| !token.is_cancelled())
                        {
                            *active_turn_id.lock().await = None;
                            Err(anyhow!("Codex turn interrupted"))?;
                        }
                        break;
                    }
                    _ => {}
                }
            }
            *active_turn_id.lock().await = None;
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
        let config = thread_config(session).await?;
        let (thread_id, model) = if let Some(state) = state {
            let response = runtime
                .request
                .request_typed::<ThreadResumeResponse>(ClientRequest::ThreadResume {
                    request_id: next_request_id(),
                    params: ThreadResumeParams {
                        thread_id: state.thread_id,
                        model: config.model,
                        cwd: config.cwd,
                        runtime_workspace_roots: config.runtime_workspace_roots,
                        approval_policy: config.approval_policy,
                        sandbox: config.sandbox,
                        config: config.config,
                        base_instructions,
                        developer_instructions,
                        exclude_turns: true,
                        ..Default::default()
                    },
                })
                .await
                .map_err(|error| anyhow!(error.to_string()))?;
            (response.thread.id, response.model)
        } else {
            let response = runtime
                .request
                .request_typed::<ThreadStartResponse>(ClientRequest::ThreadStart {
                    request_id: next_request_id(),
                    params: ThreadStartParams {
                        model: config.model,
                        cwd: config.cwd,
                        runtime_workspace_roots: config.runtime_workspace_roots,
                        approval_policy: config.approval_policy,
                        sandbox: config.sandbox,
                        config: config.config,
                        base_instructions,
                        developer_instructions,
                        ..Default::default()
                    },
                })
                .await
                .map_err(|error| anyhow!(error.to_string()))?;
            (response.thread.id, response.model)
        };

        let mut extension_data = session.extension_data.clone();
        CodexSessionState {
            thread_id: thread_id.clone(),
        }
        .to_extension_data(&mut extension_data)?;
        session_manager
            .update(&session.id)
            .extension_data(extension_data)
            .apply()
            .await?;
        let active_thread = ActiveThread {
            thread_id,
            model,
            active_turn_id: Arc::new(Mutex::new(None)),
        };
        threads.insert(session.id.clone(), active_thread.clone());
        Ok(active_thread)
    }

    /// Codex owns authentication. goose no longer stores provider credentials;
    /// it reports what Codex is signed in as and drives Codex's login flows.
    pub(crate) async fn read_account(&self) -> Result<CodexAccount> {
        let runtime = self.runtime.get_or_try_init(CodexRuntime::new).await?;
        let response = runtime
            .request
            .request_typed::<GetAccountResponse>(ClientRequest::GetAccount {
                request_id: next_request_id(),
                params: GetAccountParams {
                    refresh_token: false,
                },
            })
            .await
            .map_err(|error| anyhow!(error.to_string()))?;
        Ok(CodexAccount {
            kind: response
                .account
                .as_ref()
                .map(account_kind)
                .map(String::from),
            email: response.account.as_ref().and_then(account_email),
            plan: response.account.as_ref().and_then(account_plan),
            requires_login: response.requires_openai_auth,
        })
    }

    pub(crate) async fn start_login(&self, api_key: Option<String>) -> Result<CodexLogin> {
        let runtime = self.runtime.get_or_try_init(CodexRuntime::new).await?;
        let params = match api_key {
            Some(api_key) => LoginAccountParams::ApiKey { api_key },
            None => LoginAccountParams::Chatgpt {
                codex_streamlined_login: true,
                use_hosted_login_success_page: true,
                app_brand: None,
            },
        };
        let response = runtime
            .request
            .request_typed::<LoginAccountResponse>(ClientRequest::LoginAccount {
                request_id: next_request_id(),
                params,
            })
            .await
            .map_err(|error| anyhow!(error.to_string()))?;
        Ok(match response {
            LoginAccountResponse::Chatgpt { login_id, auth_url } => CodexLogin {
                login_id: Some(login_id),
                auth_url: Some(auth_url),
                user_code: None,
            },
            LoginAccountResponse::ChatgptDeviceCode {
                login_id,
                verification_url,
                user_code,
            } => CodexLogin {
                login_id: Some(login_id),
                auth_url: Some(verification_url),
                user_code: Some(user_code),
            },
            _ => CodexLogin::default(),
        })
    }

    pub(crate) async fn logout(&self) -> Result<()> {
        let runtime = self.runtime.get_or_try_init(CodexRuntime::new).await?;
        runtime
            .request
            .request_typed::<LogoutAccountResponse>(ClientRequest::LogoutAccount {
                request_id: next_request_id(),
                params: None,
            })
            .await
            .map_err(|error| anyhow!(error.to_string()))?;
        Ok(())
    }

    pub(crate) async fn list_models(&self) -> Result<Vec<CodexModel>> {
        let runtime = self.runtime.get_or_try_init(CodexRuntime::new).await?;
        let mut models = Vec::new();
        let mut cursor = None;
        loop {
            let response = runtime
                .request
                .request_typed::<ModelListResponse>(ClientRequest::ModelList {
                    request_id: next_request_id(),
                    params: ModelListParams {
                        cursor,
                        ..Default::default()
                    },
                })
                .await
                .map_err(|error| anyhow!(error.to_string()))?;
            models.extend(
                response
                    .data
                    .into_iter()
                    .filter(|model| !model.hidden)
                    .map(|model| CodexModel {
                        id: model.id,
                        display_name: model.display_name,
                        is_default: model.is_default,
                        supported_reasoning_efforts: model
                            .supported_reasoning_efforts
                            .into_iter()
                            .map(|option| option.reasoning_effort.to_string())
                            .collect(),
                    }),
            );
            cursor = response.next_cursor;
            if cursor.is_none() {
                break;
            }
        }
        Ok(models)
    }
}

/// What Codex is currently authenticated as.
#[derive(Clone, Debug, Default, Serialize)]
pub struct CodexAccount {
    pub kind: Option<String>,
    pub email: Option<String>,
    pub plan: Option<String>,
    pub requires_login: bool,
}

/// A login flow Codex has started and the client must complete in a browser.
#[derive(Clone, Debug, Default, Serialize)]
pub struct CodexLogin {
    pub login_id: Option<String>,
    pub auth_url: Option<String>,
    pub user_code: Option<String>,
}

fn account_kind(account: &Account) -> &'static str {
    match account {
        Account::ApiKey {} => "apiKey",
        Account::Chatgpt { .. } => "chatgpt",
        Account::AmazonBedrock { .. } => "amazonBedrock",
    }
}

fn account_email(account: &Account) -> Option<String> {
    match account {
        Account::Chatgpt { email, .. } => email.clone(),
        _ => None,
    }
}

fn account_plan(account: &Account) -> Option<String> {
    match account {
        Account::Chatgpt { plan_type, .. } => Some(format!("{plan_type:?}").to_lowercase()),
        _ => None,
    }
}

/// The subset of Codex's model catalog that goose's session config surface
/// needs. Codex owns the catalog; goose no longer ships its own copy.
#[derive(Clone, Debug)]
pub struct CodexModel {
    pub id: String,
    pub display_name: String,
    pub is_default: bool,
    pub supported_reasoning_efforts: Vec<String>,
}

pub(crate) struct CodexRuntime {
    request: InProcessAppServerRequestHandle,
    events: broadcast::Sender<CodexRuntimeEvent>,
    shutdown: CancellationToken,
}

impl Drop for CodexRuntime {
    fn drop(&mut self) {
        self.shutdown.cancel();
    }
}

impl CodexRuntime {
    async fn new() -> Result<Self> {
        let _ = set_default_originator("goose".to_string());
        let paths = runtime_paths();
        let mut config = Config::load_with_cli_overrides(Vec::new()).await?;
        apply_runtime_paths(&mut config, &paths);

        let state_db = init_state_db(&config).await;
        let local_runtime_paths = ExecServerRuntimePaths::from_optional_paths(
            config.codex_self_exe.clone(),
            config.codex_linux_sandbox_exe.clone(),
        )?;
        let environment_manager = Arc::new(
            EnvironmentManager::from_codex_home(
                config.codex_home.clone(),
                Some(local_runtime_paths),
            )
            .await?,
        );
        let config_warnings = config
            .startup_warnings
            .iter()
            .map(|warning| ConfigWarningNotification {
                summary: warning.clone(),
                details: None,
                path: None,
                range: None,
            })
            .collect();
        let mut client = InProcessAppServerClient::start(InProcessClientStartArgs {
            arg0_paths: paths,
            config: Arc::new(config),
            cli_overrides: Vec::new(),
            loader_overrides: LoaderOverrides::default(),
            strict_config: false,
            cloud_config_bundle: CloudConfigBundleLoader::default(),
            feedback: CodexFeedback::new(),
            log_db: None,
            state_db,
            environment_manager,
            config_warnings,
            session_source: SessionSource::Custom("goose".to_string()),
            enable_codex_api_key_env: true,
            client_name: "goose".to_string(),
            client_version: env!("CARGO_PKG_VERSION").to_string(),
            experimental_api: true,
            mcp_server_openai_form_elicitation: false,
            opt_out_notification_methods: Vec::new(),
            channel_capacity: DEFAULT_IN_PROCESS_CHANNEL_CAPACITY,
        })
        .await?;
        let request = client.request_handle();
        let (events, _) = broadcast::channel(DEFAULT_IN_PROCESS_CHANNEL_CAPACITY);
        let event_sender = events.clone();
        let shutdown = CancellationToken::new();
        let router_shutdown = shutdown.clone();
        tokio::spawn(async move {
            loop {
                let event = tokio::select! {
                    _ = router_shutdown.cancelled() => break,
                    event = client.next_event() => event,
                };
                let Some(event) = event else {
                    break;
                };
                match event {
                    InProcessServerEvent::ServerNotification(notification) => {
                        let _ = event_sender.send(CodexRuntimeEvent::Notification(notification));
                    }
                    InProcessServerEvent::ServerRequest(request) => {
                        let _ = client
                            .reject_server_request(
                                request.id().clone(),
                                JSONRPCErrorError {
                                    code: -32000,
                                    message:
                                        "Goose does not support interactive Codex server requests"
                                            .to_string(),
                                    data: None,
                                },
                            )
                            .await;
                    }
                    InProcessServerEvent::Lagged { skipped } => {
                        let _ = event_sender.send(CodexRuntimeEvent::TransportError(format!(
                            "Codex event stream lagged and skipped {skipped} events"
                        )));
                    }
                }
            }
            let _ = client.shutdown().await;
            let _ = event_sender.send(CodexRuntimeEvent::TransportError(
                "Codex app server disconnected".to_string(),
            ));
        });

        Ok(Self {
            request,
            events,
            shutdown,
        })
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

async fn thread_config(session: &Session) -> Result<ThreadStartParams> {
    let cwd = AbsolutePathBuf::from_absolute_path(&session.working_dir)?;
    let model = if session
        .provider_name
        .as_deref()
        .is_none_or(|name| name == "codex")
    {
        session
            .model_config
            .as_ref()
            .map(|config| config.model_name.as_str())
            .filter(|model| *model != "current")
            .map(str::to_string)
    } else {
        None
    };
    let sandbox = match session.goose_mode {
        GooseMode::Auto => SandboxMode::DangerFullAccess,
        GooseMode::SmartApprove => SandboxMode::WorkspaceWrite,
        GooseMode::Approve | GooseMode::Chat => SandboxMode::ReadOnly,
    };
    let mut config = mcp_overrides(session)
        .await?
        .into_iter()
        .map(|(key, value)| Ok((key, serde_json::to_value(value)?)))
        .collect::<Result<HashMap<_, _>>>()?;
    if let (Ok(threshold), Some(context_limit)) = (
        crate::config::Config::global().get_param::<f64>("GOOSE_AUTO_COMPACT_THRESHOLD"),
        session
            .model_config
            .as_ref()
            .and_then(|model| model.context_limit),
    ) {
        if threshold.is_finite() && threshold > 0.0 && threshold <= 1.0 {
            let token_limit = ((context_limit as f64) * threshold).round() as i64;
            config.insert(
                "model_auto_compact_token_limit".to_string(),
                serde_json::json!(token_limit.max(1)),
            );
        }
    }

    Ok(ThreadStartParams {
        model,
        cwd: Some(session.working_dir.to_string_lossy().into_owned()),
        runtime_workspace_roots: Some(vec![cwd]),
        approval_policy: Some(AskForApproval::Never),
        sandbox: Some(sandbox),
        config: (!config.is_empty()).then_some(config),
        ..Default::default()
    })
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
                url: format!("data:{};base64,{}", image.mime_type, image.data),
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

fn tool_request_from_item(item: &ThreadItem) -> Result<Option<Message>> {
    let message = match item {
        ThreadItem::CommandExecution {
            id,
            command,
            cwd,
            command_actions,
            ..
        } => tool_request_message(
            id.clone(),
            codex_exec_tool_name(command_actions),
            serde_json::json!({
                "command": command,
                "cwd": cwd,
                "command_actions": command_actions,
            }),
        ),
        ThreadItem::FileChange { id, changes, .. } => tool_request_message(
            id.clone(),
            "apply_patch",
            serde_json::json!({ "changes": changes }),
        ),
        ThreadItem::McpToolCall {
            id,
            server,
            tool,
            arguments,
            ..
        } => tool_request_message(id.clone(), format!("{server}__{tool}"), arguments.clone()),
        ThreadItem::WebSearch(item) => tool_request_message(
            item.id.clone(),
            "web_search",
            serde_json::json!({ "query": item.query, "action": item.action }),
        ),
        ThreadItem::ImageView { id, path } => tool_request_message(
            id.clone(),
            "view_image",
            serde_json::json!({ "path": path }),
        ),
        ThreadItem::ImageGeneration(item) => {
            tool_request_message(item.id.clone(), "image_generation", serde_json::json!({}))
        }
        _ => return Ok(None),
    };
    Ok(Some(message))
}

fn tool_response_from_item(item: &ThreadItem) -> Result<Option<Message>> {
    let message = match item {
        ThreadItem::CommandExecution {
            id,
            status,
            aggregated_output,
            exit_code,
            ..
        } => tool_response_message(
            id.clone(),
            aggregated_output.clone().unwrap_or_default(),
            !matches!(status, CommandExecutionStatus::Completed)
                || exit_code.is_some_and(|code| code != 0),
        ),
        ThreadItem::FileChange {
            id,
            changes,
            status,
        } => tool_response_message(
            id.clone(),
            serde_json::to_string(changes)?,
            !matches!(status, PatchApplyStatus::Completed),
        ),
        ThreadItem::McpToolCall {
            id, result, error, ..
        } => {
            let result = if let Some(error) = error {
                CallToolResult::error(vec![Content::text(error.message.clone())])
            } else if let Some(result) = result {
                serde_json::from_value(serde_json::to_value(result)?).unwrap_or_else(|error| {
                    CallToolResult::error(vec![Content::text(error.to_string())])
                })
            } else {
                CallToolResult::success(Vec::new())
            };
            Message::user()
                .with_generated_id()
                .with_tool_response(id.clone(), Ok(result))
        }
        ThreadItem::WebSearch(item) => tool_response_message(
            item.id.clone(),
            serde_json::to_string(&serde_json::json!({
                "query": item.query,
                "action": item.action,
            }))?,
            false,
        ),
        ThreadItem::ImageView { id, .. } => tool_response_message(id.clone(), String::new(), false),
        ThreadItem::ImageGeneration(item) => {
            tool_response_message(item.id.clone(), serde_json::to_string(item)?, false)
        }
        _ => return Ok(None),
    };
    Ok(Some(message))
}

fn codex_exec_tool_name(command_actions: &[CommandAction]) -> &'static str {
    if command_actions.is_empty() {
        return "shell";
    }

    if command_actions
        .iter()
        .all(|command| matches!(command, CommandAction::ListFiles { .. }))
    {
        "list_files"
    } else if command_actions
        .iter()
        .all(|command| matches!(command, CommandAction::Read { .. }))
    {
        "read_files"
    } else if command_actions
        .iter()
        .all(|command| matches!(command, CommandAction::Search { .. }))
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

fn usage_from_codex(token_usage: ThreadTokenUsage) -> (Usage, Usage) {
    let last = token_usage.last;
    let usage = Usage::new(
        Some(saturating_i32(last.input_tokens)),
        Some(saturating_i32(last.output_tokens)),
        Some(saturating_i32(last.total_tokens)),
    )
    .with_cache_tokens(Some(saturating_i32(last.cached_input_tokens)), None);
    let total = token_usage.total;
    let accumulated_usage = Usage::new(
        Some(saturating_i32(total.input_tokens)),
        Some(saturating_i32(total.output_tokens)),
        Some(saturating_i32(total.total_tokens)),
    )
    .with_cache_tokens(Some(saturating_i32(total.cached_input_tokens)), None);
    (usage, accumulated_usage)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codex_exec_tool_name_uses_list_files_semantics() {
        let commands = vec![CommandAction::ListFiles {
            command: "ls -la".to_string(),
            path: None,
        }];

        assert_eq!(codex_exec_tool_name(&commands), "list_files");
    }

    #[test]
    fn codex_exec_tool_name_keeps_mixed_commands_as_shell() {
        let commands = vec![
            CommandAction::ListFiles {
                command: "ls".to_string(),
                path: None,
            },
            CommandAction::Unknown {
                command: "touch marker".to_string(),
            },
        ];

        assert_eq!(codex_exec_tool_name(&commands), "shell");
    }
}
