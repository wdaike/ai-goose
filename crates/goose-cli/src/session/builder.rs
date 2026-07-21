use crate::cli::StreamableHttpOptions;

use super::output;
use super::CliSession;
use console::style;
use goose::agents::{Agent, ExtensionError};
use goose::config::resolve_extensions_for_new_session;
use goose::config::{Config, ExtensionConfig, GooseMode};
use goose::session::session_manager::SessionType;
use goose::session::{EnabledExtensionsState, ExtensionState};
use rustyline::EditMode;
use std::process;
use std::sync::Arc;

fn parse_cli_flag_extensions(
    extensions: &[String],
    streamable_http_extensions: &[StreamableHttpOptions],
) -> Vec<ExtensionConfig> {
    let mut extensions_to_load = Vec::new();

    for ext_str in extensions {
        match CliSession::parse_stdio_extension(ext_str) {
            Ok(config) => extensions_to_load.push(config),
            Err(e) => {
                eprintln!(
                    "{}",
                    style(format!(
                        "Warning: Invalid --extension value '{}' ({}); ignoring",
                        ext_str, e
                    ))
                    .yellow()
                );
            }
        }
    }

    for opts in streamable_http_extensions {
        let config = CliSession::parse_streamable_http_extension(&opts.url, opts.timeout);
        extensions_to_load.push(config);
    }

    extensions_to_load
}

/// Configuration for building a new Goose session
///
/// This struct contains all the parameters needed to create a new session,
/// including session identification, extension configuration, and debug settings.
#[derive(Clone, Debug)]
pub struct SessionBuilderConfig {
    /// Session id, optional need to deduce from context
    pub session_id: Option<String>,
    /// Whether to resume an existing session
    pub resume: bool,
    /// Whether to fork an existing session (creates a copy of the original/existing session then resumes the copy)
    pub fork: bool,
    /// Whether to run without a session file
    pub no_session: bool,
    /// List of stdio extension commands to add
    pub extensions: Vec<String>,
    /// List of streamable HTTP extension commands to add
    pub streamable_http_extensions: Vec<StreamableHttpOptions>,
    /// List of builtin extension commands to add
    pub no_profile: bool,
    /// Any additional system prompt to append to the default
    pub additional_system_prompt: Option<String>,
    /// Provider override from CLI arguments
    pub provider: Option<String>,
    /// Model override from CLI arguments
    pub model: Option<String>,
    /// Enable debug printing
    pub debug: bool,
    /// Maximum number of consecutive identical tool calls allowed
    pub max_tool_repetitions: Option<u32>,
    /// Maximum number of turns (iterations) allowed without user input
    pub max_turns: Option<u32>,
    /// Whether this session will be used interactively (affects debugging prompts)
    pub interactive: bool,
    /// Quiet mode - suppress non-response output
    pub quiet: bool,
    /// Output format (text, json)
    pub output_format: String,
    /// Print generation statistics after headless runs.
    pub stats: bool,
}

/// Manual implementation of Default to ensure proper initialization of output_format
/// This struct requires explicit default value for output_format field
impl Default for SessionBuilderConfig {
    fn default() -> Self {
        SessionBuilderConfig {
            session_id: None,
            resume: false,
            fork: false,
            no_session: false,
            extensions: Vec::new(),
            streamable_http_extensions: Vec::new(),
            no_profile: false,
            additional_system_prompt: None,
            provider: None,
            model: None,
            debug: false,
            max_tool_repetitions: None,
            max_turns: None,
            interactive: false,
            quiet: false,
            output_format: "text".to_string(),
            stats: false,
        }
    }
}

async fn store_extensions(
    agent: Agent,
    extensions: Vec<ExtensionConfig>,
    session_id: &str,
) -> Arc<Agent> {
    let session = agent
        .config
        .session_manager
        .get_session(session_id, false)
        .await
        .unwrap_or_else(|error| {
            output::render_error(&format!("Failed to read session metadata: {error}"));
            process::exit(1);
        });
    let mut extension_data = session.extension_data;
    EnabledExtensionsState::new(extensions)
        .to_extension_data(&mut extension_data)
        .unwrap_or_else(|error| {
            output::render_error(&format!("Failed to save extensions: {error}"));
            process::exit(1);
        });
    agent
        .config
        .session_manager
        .update(session_id)
        .extension_data(extension_data)
        .apply()
        .await
        .unwrap_or_else(|error| {
            output::render_error(&format!("Failed to update session: {error}"));
            process::exit(1);
        });
    Arc::new(agent)
}

async fn resolve_session_id(
    session_config: &SessionBuilderConfig,
    session_manager: &goose::session::session_manager::SessionManager,
    goose_mode: GooseMode,
) -> String {
    if session_config.no_session {
        let working_dir = std::env::current_dir().unwrap_or_else(|e| {
            output::render_error(&format!("Could not get working directory: {}", e));
            process::exit(1);
        });
        let session = session_manager
            .create_session(
                working_dir,
                "CLI Session".to_string(),
                SessionType::Hidden,
                goose_mode,
            )
            .await
            .unwrap_or_else(|e| {
                output::render_error(&format!("Could not create session: {}", e));
                process::exit(1);
            });
        session.id
    } else if session_config.resume {
        if let Some(ref session_id) = session_config.session_id {
            match session_manager.get_session(session_id, false).await {
                Ok(_) => session_id.clone(),
                Err(_) => {
                    output::render_error(&format!(
                        "Cannot resume session {} - no such session exists",
                        style(session_id).cyan()
                    ));
                    process::exit(1);
                }
            }
        } else {
            match session_manager
                .list_sessions_by_types(&[SessionType::User])
                .await
            {
                Ok(sessions) if !sessions.is_empty() => sessions[0].id.clone(),
                _ => {
                    output::render_error("Cannot resume - no previous sessions found");
                    process::exit(1);
                }
            }
        }
    } else {
        session_config.session_id.clone().unwrap()
    }
}

async fn handle_resumed_session_workdir(agent: &Agent, session_id: &str, interactive: bool) {
    let session = agent
        .config
        .session_manager
        .get_session(session_id, false)
        .await
        .unwrap_or_else(|e| {
            output::render_error(&format!("Failed to read session metadata: {}", e));
            process::exit(1);
        });

    let current_workdir = std::env::current_dir().unwrap_or_else(|e| {
        output::render_error(&format!("Failed to get current working directory: {}", e));
        process::exit(1);
    });
    if current_workdir == session.working_dir {
        return;
    }

    if interactive {
        let change_workdir = cliclack::confirm(format!(
            "{} The original working directory of this session was set to {}. \
             Your current directory is {}. \
             Do you want to switch back to the original working directory?",
            style("WARNING:").yellow(),
            style(session.working_dir.display()).cyan(),
            style(current_workdir.display()).cyan(),
        ))
        .initial_value(true)
        .interact()
        .unwrap_or_else(|e| {
            output::render_error(&format!("Failed to get user input: {}", e));
            process::exit(1);
        });

        if change_workdir {
            if !session.working_dir.exists() {
                output::render_error(&format!(
                    "Cannot switch to original working directory - {} no longer exists",
                    style(session.working_dir.display()).cyan()
                ));
            } else if let Err(e) = std::env::set_current_dir(&session.working_dir) {
                output::render_error(&format!(
                    "Failed to switch to original working directory: {}",
                    e
                ));
            }
        }
    } else {
        eprintln!(
            "{}",
            style(format!(
                "Warning: Working directory differs from session (current: {}, session: {}). \
                 Staying in current directory.",
                current_workdir.display(),
                session.working_dir.display()
            ))
            .yellow()
        );
    }
}

async fn collect_extension_configs(
    agent: &Agent,
    session_config: &SessionBuilderConfig,
    session_id: &str,
) -> Result<Vec<ExtensionConfig>, ExtensionError> {
    let configured_extensions: Vec<ExtensionConfig> = if session_config.resume {
        EnabledExtensionsState::for_session(
            &agent.config.session_manager,
            session_id,
            Config::global(),
        )
        .await
    } else if session_config.no_profile {
        Vec::new()
    } else {
        resolve_extensions_for_new_session(None, None)
    };

    let cli_flag_extensions = parse_cli_flag_extensions(
        &session_config.extensions,
        &session_config.streamable_http_extensions,
    );

    let mut all: Vec<ExtensionConfig> = configured_extensions;
    all.extend(cli_flag_extensions);

    Ok(all)
}

async fn store_session_extensions(
    agent: Agent,
    extensions: Vec<ExtensionConfig>,
    session_id: &str,
) -> Arc<Agent> {
    for warning in goose::config::get_warnings() {
        eprintln!("{}", style(format!("Warning: {}", warning)).yellow());
    }

    store_extensions(agent, extensions, session_id).await
}

async fn configure_session_prompts(
    session: &CliSession,
    config: &Config,
    session_config: &SessionBuilderConfig,
) {
    if let Some(ref additional_prompt) = session_config.additional_system_prompt {
        session
            .agent
            .extend_system_prompt("additional".to_string(), additional_prompt.clone())
            .await;
    }

    let system_prompt_file: Option<String> = config.get_param("GOOSE_SYSTEM_PROMPT_FILE_PATH").ok();
    if let Some(ref path) = system_prompt_file {
        let override_prompt = std::fs::read_to_string(path).unwrap_or_else(|e| {
            output::render_error(&format!(
                "Failed to read system prompt file '{}': {}",
                path, e
            ));
            process::exit(1);
        });
        session.agent.override_system_prompt(override_prompt).await;
    }
}

pub async fn build_session(session_config: SessionBuilderConfig) -> CliSession {
    let config = Config::global();
    let agent: Agent = Agent::new();

    let session_manager = agent.config.session_manager.clone();

    let session_id =
        resolve_session_id(&session_config, &session_manager, agent.config.goose_mode).await;

    if session_config.resume {
        handle_resumed_session_workdir(&agent, &session_id, session_config.interactive).await;
    }

    let extensions = match collect_extension_configs(&agent, &session_config, &session_id).await {
        Ok(exts) => exts,
        Err(e) => {
            output::render_error(&format!("Failed to collect extensions: {}", e));
            process::exit(1);
        }
    };

    if session_config.provider.as_deref().is_some_and(|provider| {
        !provider.eq_ignore_ascii_case("codex") && !provider.eq_ignore_ascii_case("openai")
    }) {
        eprintln!(
            "{}",
            style("Warning: --provider is ignored; Codex manages authentication.").yellow()
        );
    }

    let requested_model = session_config.model.clone();
    let previous_provider = session_manager
        .get_session(&session_id, false)
        .await
        .ok()
        .and_then(|session| session.provider_name);
    let mut update = session_manager.update(&session_id).provider_name("codex");
    if let Some(model) = requested_model {
        update = update.model_config(goose_types::model::ModelConfig::new(model));
    } else if previous_provider.as_deref() != Some("codex") {
        update = update.clear_model_config();
    }
    update.apply().await.unwrap_or_else(|error| {
        output::render_error(&format!("Failed to update session: {error}"));
        process::exit(1);
    });

    agent
        .update_goose_mode(agent.config.goose_mode, &session_id)
        .await
        .unwrap_or_else(|e| {
            output::render_error(&format!("Failed to set session mode: {}", e));
            process::exit(1);
        });

    let agent_ptr = store_session_extensions(agent, extensions, &session_id).await;

    let edit_mode = config
        .get_param::<String>("EDIT_MODE")
        .ok()
        .and_then(|edit_mode| match edit_mode.to_lowercase().as_str() {
            "emacs" => Some(EditMode::Emacs),
            "vi" => Some(EditMode::Vi),
            _ => {
                eprintln!("Invalid EDIT_MODE specified, defaulting to Emacs");
                None
            }
        });

    let debug_mode = session_config.debug || config.get_param("GOOSE_DEBUG").unwrap_or(false);

    let session = CliSession::new(
        Arc::try_unwrap(agent_ptr).unwrap_or_else(|_| panic!("There should be no more references")),
        session_id.clone(),
        debug_mode,
        None,
        session_config.max_turns,
        edit_mode,
        None,
        session_config.output_format.clone(),
        session_config.stats,
    )
    .await;

    configure_session_prompts(&session, config, &session_config).await;

    if !session_config.quiet {
        let model = session
            .agent
            .config
            .session_manager
            .get_session(&session_id, false)
            .await
            .ok()
            .and_then(|session| session.model_config)
            .map(|model| model.model_name)
            .unwrap_or_else(|| "Codex default".to_string());
        output::display_session_info(session_config.resume, "codex", &model, &Some(session_id));
    }
    session
}

#[cfg(test)]
mod tests {
    use super::*;
    use goose::session::SessionManager;
    use tempfile::TempDir;

    #[test]
    fn test_session_builder_config_creation() {
        let config = SessionBuilderConfig {
            session_id: None,
            resume: false,
            fork: false,
            no_session: false,
            extensions: vec!["echo test".to_string()],
            streamable_http_extensions: vec![StreamableHttpOptions {
                url: "http://localhost:8080/mcp".to_string(),
                timeout: goose::config::DEFAULT_EXTENSION_TIMEOUT,
            }],
            no_profile: false,
            additional_system_prompt: Some("Test prompt".to_string()),
            provider: None,
            model: None,
            debug: true,
            max_tool_repetitions: Some(5),
            max_turns: None,
            interactive: true,
            quiet: false,
            output_format: "text".to_string(),
            stats: false,
        };

        assert_eq!(config.extensions.len(), 1);
        assert_eq!(config.streamable_http_extensions.len(), 1);
        assert!(config.debug);
        assert_eq!(config.max_tool_repetitions, Some(5));
        assert!(config.max_turns.is_none());
        assert!(config.interactive);
        assert!(!config.quiet);
    }

    #[test]
    fn test_session_builder_config_default() {
        let config = SessionBuilderConfig::default();

        assert!(config.session_id.is_none());
        assert!(!config.resume);
        assert!(!config.no_session);
        assert!(config.extensions.is_empty());
        assert!(config.streamable_http_extensions.is_empty());
        assert!(!config.no_profile);
        assert!(config.additional_system_prompt.is_none());
        assert!(!config.debug);
        assert!(config.max_tool_repetitions.is_none());
        assert!(config.max_turns.is_none());
        assert!(!config.interactive);
        assert!(!config.quiet);
        assert!(!config.fork);
    }

    #[tokio::test]
    async fn test_implicit_resume_ignores_newer_scheduled_sessions() {
        let temp_dir = TempDir::new().unwrap();
        let session_manager = SessionManager::new(temp_dir.path().to_path_buf());
        let goose_mode = GooseMode::default();

        let user_session = session_manager
            .create_session(
                temp_dir.path().to_path_buf(),
                "User session".to_string(),
                SessionType::User,
                goose_mode,
            )
            .await
            .unwrap();
        session_manager
            .create_session(
                temp_dir.path().to_path_buf(),
                "Scheduled job: test".to_string(),
                SessionType::Scheduled,
                goose_mode,
            )
            .await
            .unwrap();

        let resolved = resolve_session_id(
            &SessionBuilderConfig {
                resume: true,
                ..SessionBuilderConfig::default()
            },
            &session_manager,
            goose_mode,
        )
        .await;

        assert_eq!(resolved, user_session.id);
    }
}
