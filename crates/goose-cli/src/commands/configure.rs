use cliclack::spinner;
use console::style;
use goose::agents::extension::{get_parameter_names, ToolInfo};
use goose::agents::Agent;
use goose::agents::{extension::Envs, ExtensionConfig};
use goose::config::extensions::{
    get_all_extension_names, get_all_extensions, get_enabled_extensions, get_extension_by_name,
    name_to_key, remove_extension, set_extension, set_extension_enabled,
};
use goose::config::paths::Paths;
use goose::config::permission::PermissionLevel;
use goose::config::{
    Config, ConfigError, ExperimentManager, ExtensionEntry, GooseMode, PermissionManager,
};
use goose::session::SessionType;
use goose_types::thinking::ThinkingEffort;
use serde_json::Value;
use std::collections::HashMap;
use std::io::{IsTerminal, Write};

// useful for light themes where there is no discernible colour contrast between
// cursor-selected and cursor-unselected items.
const MULTISELECT_VISIBILITY_HINT: &str = "<";
const SHOW_CURSOR: &[u8] = b"\x1b[?25h";

struct CursorRestoreGuard;

impl Drop for CursorRestoreGuard {
    fn drop(&mut self) {
        let mut stdout = std::io::stdout().lock();
        let _ = stdout.write_all(SHOW_CURSOR);
        let _ = stdout.flush();
    }
}

pub async fn handle_configure() -> anyhow::Result<()> {
    if !std::io::stdin().is_terminal() {
        anyhow::bail!(
            "goose configure requires an interactive terminal.\n\
             If you installed via 'curl ... | bash', run 'goose configure' separately after installation."
        );
    }

    let _cursor_restore = CursorRestoreGuard;
    let config = Config::global();

    if !config.exists() {
        handle_first_time_setup(config).await
    } else {
        handle_existing_config().await
    }
}

async fn handle_first_time_setup(config: &Config) -> anyhow::Result<()> {
    println!();
    println!("{}", style("Welcome to goose! Let's get you set up.").dim());
    println!(
        "{}",
        style("  you can rerun this command later to update your configuration").dim()
    );
    println!();

    println!();
    cliclack::intro(style(" goose-configure ").on_cyan().black())?;

    handle_manual_provider_setup(config).await;
    Ok(())
}

async fn handle_manual_provider_setup(config: &Config) {
    match configure_provider_dialog().await {
        Ok(true) => {
            println!(
                "\n  {}: Run '{}' again to adjust your config or add extensions",
                style("Tip").green().italic(),
                style("goose configure").cyan()
            );
            set_extension(ExtensionEntry {
                enabled: true,
                config: ExtensionConfig::default(),
            });
        }
        Ok(false) => {
            let _ = config.clear();
            println!(
                "\n  {}: We did not save your config, inspect your credentials\n   and run '{}' again to ensure goose can connect",
                style("Warning").yellow().italic(),
                style("goose configure").cyan()
            );
        }
        Err(e) => {
            let _ = config.clear();
            print_manual_config_error(&e);
        }
    }
}

fn print_manual_config_error(e: &anyhow::Error) {
    match e.downcast_ref::<ConfigError>() {
        Some(ConfigError::NotFound(key)) => {
            println!(
                "\n  {} Required configuration key '{}' not found \n  Please provide this value and run '{}' again",
                style("Error").red().italic(),
                key,
                style("goose configure").cyan()
            );
        }
        Some(ConfigError::KeyringError(msg)) => {
            print_keyring_error(msg);
        }
        Some(ConfigError::DeserializeError(msg)) => {
            println!(
                "\n  {} Invalid configuration value: {} \n  Please check your input and run '{}' again",
                style("Error").red().italic(),
                msg,
                style("goose configure").cyan()
            );
        }
        Some(ConfigError::FileError(err)) => {
            println!(
                "\n  {} Failed to access config file: {} \n  Please check file permissions and run '{}' again",
                style("Error").red().italic(),
                err,
                style("goose configure").cyan()
            );
        }
        Some(ConfigError::DirectoryError(msg)) => {
            println!(
                "\n  {} Failed to access config directory: {} \n  Please check directory permissions and run '{}' again",
                style("Error").red().italic(),
                msg,
                style("goose configure").cyan()
            );
        }
        _ => {
            println!(
                "\n  {} {} \n  We did not save your config, inspect your credentials\n   and run '{}' again to ensure goose can connect",
                style("Error").red().italic(),
                e,
                style("goose configure").cyan()
            );
        }
    }
}

#[cfg(target_os = "macos")]
fn print_keyring_error(msg: &str) {
    println!(
        "\n  {} Failed to access secure storage (keyring): {} \n  Please check your system keychain and run '{}' again. \n  If your system is unable to use the keyring, please try setting secret key(s) via environment variables.",
        style("Error").red().italic(),
        msg,
        style("goose configure").cyan()
    );
}

#[cfg(target_os = "windows")]
fn print_keyring_error(msg: &str) {
    println!(
        "\n  {} Failed to access Windows Credential Manager: {} \n  Please check Windows Credential Manager and run '{}' again. \n  If your system is unable to use the Credential Manager, please try setting secret key(s) via environment variables.",
        style("Error").red().italic(),
        msg,
        style("goose configure").cyan()
    );
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn print_keyring_error(msg: &str) {
    println!(
        "\n  {} Failed to access secure storage: {} \n  Please check your system's secure storage and run '{}' again. \n  If your system is unable to use secure storage, please try setting secret key(s) via environment variables.",
        style("Error").red().italic(),
        msg,
        style("goose configure").cyan()
    );
}

async fn handle_existing_config() -> anyhow::Result<()> {
    let config_dir = Paths::config_dir().display().to_string();

    println!();
    println!(
        "{}",
        style("This will update your existing config files").dim()
    );
    println!(
        "{} {}",
        style("  if you prefer, you can edit them directly at").dim(),
        config_dir
    );
    println!();

    cliclack::intro(style(" goose-configure ").on_cyan().black())?;
    let action = cliclack::select("What would you like to configure?")
        .item(
            "providers",
            "Configure Providers",
            "Change provider or update credentials",
        )
        .item("add", "Add Extension", "Connect to a new extension")
        .item(
            "toggle",
            "Toggle Extensions",
            "Enable or disable connected extensions",
        )
        .item("remove", "Remove Extension", "Remove an extension")
        .item(
            "settings",
            "goose settings",
            "Set the goose mode, Tool Output, Tool Permissions, Experiment and more",
        )
        .interact()?;

    match action {
        "toggle" => toggle_extensions_dialog(),
        "add" => configure_extensions_dialog(),
        "remove" => remove_extension_dialog(),
        "settings" => configure_settings_dialog().await,
        "providers" => configure_provider_dialog().await.map(|_| ()),
        _ => unreachable!(),
    }
}

pub async fn configure_provider_dialog() -> anyhow::Result<bool> {
    let config = Config::global();

    let spin = spinner();
    spin.start("Fetching available models...");
    let models = goose::codex::list_models().await.unwrap_or_default();
    spin.stop(style("Model fetch complete").green());

    let model: String = if models.is_empty() {
        cliclack::input("Enter a model name:")
            .default_input(goose::providers::CODEX_DEFAULT_MODEL)
            .interact()?
    } else {
        let items: Vec<(&str, &str, &str)> = models
            .iter()
            .map(|model| (model.id.as_str(), model.display_name.as_str(), ""))
            .collect();
        let initial = models
            .iter()
            .find(|model| model.is_default)
            .map(|model| model.id.as_str())
            .unwrap_or(items[0].0);
        cliclack::select("Which model should we use?")
            .initial_value(initial)
            .items(&items)
            .filter_mode()
            .interact()?
            .to_string()
    };

    let efforts: Vec<String> = models
        .iter()
        .find(|candidate| candidate.id == model)
        .map(|candidate| candidate.supported_reasoning_efforts.clone())
        .unwrap_or_default();
    if !efforts.is_empty() {
        let items: Vec<(&str, &str, &str)> = efforts
            .iter()
            .map(|effort| (effort.as_str(), effort.as_str(), ""))
            .collect();
        let effort: ThinkingEffort = cliclack::select("Select thinking effort:")
            .items(&items)
            .interact()?
            .parse()
            .map_err(|_| anyhow::anyhow!("invalid thinking effort"))?;
        config.set_goose_thinking_effort(effort)?;
    }

    goose::config::set_active_provider(config, goose::providers::CODEX_PROVIDER_NAME, &model)?;
    print_config_file_saved()?;
    Ok(true)
}

/// Configure extensions that can be used with goose
/// Dialog for toggling which extensions are enabled/disabled
pub fn toggle_extensions_dialog() -> anyhow::Result<()> {
    for warning in goose::config::get_warnings() {
        eprintln!("{}", style(format!("Warning: {}", warning)).yellow());
    }

    let extensions = get_all_extensions();

    if extensions.is_empty() {
        cliclack::outro(
            "No extensions configured yet. Run configure and add some extensions first.",
        )?;
        return Ok(());
    }

    // Create a list of extension names and their enabled status
    let mut extension_status: Vec<(String, bool)> = extensions
        .iter()
        .map(|entry| (entry.config.name().to_string(), entry.enabled))
        .collect();

    // Sort extensions alphabetically by name
    extension_status.sort_by(|a, b| a.0.cmp(&b.0));

    // Get currently enabled extensions for the selection
    let enabled_extensions: Vec<&String> = extension_status
        .iter()
        .filter(|(_, enabled)| *enabled)
        .map(|(name, _)| name)
        .collect();

    // Let user toggle extensions
    let selected = cliclack::multiselect(
        "enable extensions: (use \"space\" to toggle and \"enter\" to submit)",
    )
    .required(false)
    .items(
        &extension_status
            .iter()
            .map(|(name, _)| (name, name.as_str(), MULTISELECT_VISIBILITY_HINT))
            .collect::<Vec<_>>(),
    )
    .initial_values(enabled_extensions)
    .filter_mode()
    .interact()?;

    // Update enabled status for each extension
    for name in extension_status.iter().map(|(name, _)| name) {
        set_extension_enabled(
            &name_to_key(name),
            selected.iter().any(|s| s.as_str() == name),
        );
    }

    let config = Config::global();
    cliclack::outro(format!(
        "Extension settings saved successfully to {}",
        config.path()
    ))?;
    Ok(())
}

fn prompt_extension_timeout() -> anyhow::Result<u64> {
    Ok(
        cliclack::input("Please set the timeout for this tool (in secs):")
            .placeholder(&goose::config::DEFAULT_EXTENSION_TIMEOUT.to_string())
            .validate(|input: &String| match input.parse::<u64>() {
                Ok(_) => Ok(()),
                Err(_) => Err("Please enter a valid timeout"),
            })
            .interact()?,
    )
}

fn prompt_extension_description() -> anyhow::Result<String> {
    Ok(cliclack::input("Enter a description for this extension:")
        .placeholder("Description")
        .validate(|input: &String| {
            if input.trim().is_empty() {
                Err("Please enter a valid description")
            } else {
                Ok(())
            }
        })
        .interact()?)
}

fn prompt_extension_name(placeholder: &str) -> anyhow::Result<String> {
    let extensions = get_all_extension_names();
    Ok(
        cliclack::input("What would you like to call this extension?")
            .placeholder(placeholder)
            .validate(move |input: &String| {
                if input.is_empty() {
                    Err("Please enter a name")
                } else if extensions.contains(input) {
                    Err("An extension with this name already exists")
                } else {
                    Ok(())
                }
            })
            .interact()?,
    )
}

fn try_store_secret(config: &Config, key_name: &str, value: String) -> anyhow::Result<bool> {
    match config.set_secret(key_name, &value) {
        Ok(_) => Ok(true),
        Err(ConfigError::FallbackToFileStorage) => Ok(true),
        Err(e) => {
            cliclack::outro(style(format!(
                "Failed to store {} securely: {}. Please ensure your system's secure storage is accessible. Alternatively you can run with GOOSE_DISABLE_KEYRING=true or set the key in your environment variables",
                key_name, e
            )).on_red().white())?;
            Ok(false)
        }
    }
}

fn collect_env_vars() -> anyhow::Result<(HashMap<String, String>, Vec<String>)> {
    let envs = HashMap::new();
    let mut env_keys = Vec::new();
    let config = Config::global();

    if !cliclack::confirm("Would you like to add environment variables?").interact()? {
        return Ok((envs, env_keys));
    }

    loop {
        let key: String = cliclack::input("Environment variable name:")
            .placeholder("API_KEY")
            .interact()?;

        let value: String = cliclack::password("Environment variable value:")
            .mask('▪')
            .interact()?;

        if !try_store_secret(config, &key, value)? {
            return Err(anyhow::anyhow!("Failed to store secret"));
        }
        env_keys.push(key);

        if !cliclack::confirm("Add another environment variable?").interact()? {
            break;
        }
    }

    Ok((envs, env_keys))
}

fn collect_headers() -> anyhow::Result<HashMap<String, String>> {
    let mut headers = HashMap::new();

    if !cliclack::confirm("Would you like to add custom headers?").interact()? {
        return Ok(headers);
    }

    loop {
        let key: String = cliclack::input("Header name:")
            .placeholder("Authorization")
            .interact()?;

        let value: String = cliclack::input("Header value:")
            .placeholder("Bearer token123")
            .interact()?;

        headers.insert(key, value);

        if !cliclack::confirm("Add another header?").interact()? {
            break;
        }
    }

    Ok(headers)
}

fn configure_stdio_extension() -> anyhow::Result<()> {
    let name = prompt_extension_name("my-extension")?;

    let command_str: String = cliclack::input("What command should be run?")
        .placeholder("npx -y @block/gdrive")
        .validate(|input: &String| {
            if input.is_empty() {
                Err("Please enter a command")
            } else {
                Ok(())
            }
        })
        .interact()?;

    let timeout = prompt_extension_timeout()?;

    let mut parts = goose::utils::split_command_args(&command_str)?;
    let cmd = if parts.is_empty() {
        String::new()
    } else {
        parts.remove(0)
    };
    let args = parts;

    let description = prompt_extension_description()?;
    let (envs, env_keys) = collect_env_vars()?;

    set_extension(ExtensionEntry {
        enabled: true,
        config: ExtensionConfig::Stdio {
            name: name.clone(),
            cmd,
            args,
            envs: Envs::new(envs),
            env_keys,
            description,
            timeout: Some(timeout),
            cwd: None,
            bundled: None,
            available_tools: Vec::new(),
        },
    });

    cliclack::outro(format!("Added {} extension", style(name).green()))?;
    Ok(())
}

fn configure_streamable_http_extension() -> anyhow::Result<()> {
    let name = prompt_extension_name("my-remote-extension")?;

    let uri: String = cliclack::input("What is the Streaming HTTP endpoint URI?")
        .placeholder("http://localhost:8000/messages")
        .validate(|input: &String| {
            if input.is_empty() {
                Err("Please enter a URI")
            } else if !(input.starts_with("http://") || input.starts_with("https://")) {
                Err("URI should start with http:// or https://")
            } else {
                Ok(())
            }
        })
        .interact()?;

    let timeout = prompt_extension_timeout()?;
    let description = prompt_extension_description()?;
    let headers = collect_headers()?;

    // Original behavior: no env var collection for Streamable HTTP
    let envs = HashMap::new();
    let env_keys = Vec::new();

    set_extension(ExtensionEntry {
        enabled: true,
        config: ExtensionConfig::StreamableHttp {
            name: name.clone(),
            uri,
            envs: Envs::new(envs),
            env_keys,
            headers,
            description,
            timeout: Some(timeout),
            socket: None,
            bundled: None,
            available_tools: Vec::new(),
        },
    });

    cliclack::outro(format!("Added {} extension", style(name).green()))?;
    Ok(())
}

pub fn configure_extensions_dialog() -> anyhow::Result<()> {
    let extension_type = cliclack::select("What type of extension would you like to add?")
        .item(
            "stdio",
            "Command-line Extension",
            "Run a local command or script",
        )
        .item(
            "streamable_http",
            "Remote Extension (Streamable HTTP)",
            "Connect to a remote extension via MCP Streamable HTTP",
        )
        .interact()?;

    match extension_type {
        "stdio" => configure_stdio_extension()?,
        "streamable_http" => configure_streamable_http_extension()?,
        _ => unreachable!(),
    };

    print_config_file_saved()?;
    Ok(())
}

pub fn remove_extension_dialog() -> anyhow::Result<()> {
    for warning in goose::config::get_warnings() {
        eprintln!("{}", style(format!("Warning: {}", warning)).yellow());
    }

    let extensions = get_all_extensions();

    // Create a list of extension names and their enabled status
    let mut extension_status: Vec<(String, bool)> = extensions
        .iter()
        .map(|entry| (entry.config.name().to_string(), entry.enabled))
        .collect();

    // Sort extensions alphabetically by name
    extension_status.sort_by(|a, b| a.0.cmp(&b.0));

    if extensions.is_empty() {
        cliclack::outro(
            "No extensions configured yet. Run configure and add some extensions first.",
        )?;
        return Ok(());
    }

    // Check if all extensions are enabled
    if extension_status.iter().all(|(_, enabled)| *enabled) {
        cliclack::outro(
            "All extensions are currently enabled. You must first disable extensions before removing them.",
        )?;
        return Ok(());
    }

    // Filter out only disabled extensions
    let disabled_extensions: Vec<_> = extensions
        .iter()
        .filter(|entry| !entry.enabled)
        .map(|entry| (entry.config.name().to_string(), entry.enabled))
        .collect();

    let selected = cliclack::multiselect("Select extensions to remove (note: you can only remove disabled extensions - use \"space\" to toggle and \"enter\" to submit)")
        .required(false)
        .items(
            &disabled_extensions
                .iter()
                .filter(|(_, enabled)| !enabled)
                .map(|(name, _)| (name, name.as_str(), MULTISELECT_VISIBILITY_HINT))
                .collect::<Vec<_>>(),
        )
        .filter_mode()
        .interact()?;

    for name in selected {
        remove_extension(&name_to_key(name));
        PermissionManager::instance().remove_extension(&name_to_key(name));
        cliclack::outro(format!("Removed {} extension", style(name).green()))?;
    }

    print_config_file_saved()?;

    Ok(())
}

pub async fn configure_settings_dialog() -> anyhow::Result<()> {
    #[allow(unused_mut)]
    let mut setting_select = cliclack::select("What setting would you like to configure?").item(
        "goose_mode",
        "goose mode",
        "Configure goose mode",
    );
    let setting_type = setting_select
        .item(
            "tool_permission",
            "Tool Permission",
            "Set permission for individual tool of enabled extensions",
        )
        .item(
            "tool_output",
            "Tool Output",
            "Show more or less tool output",
        )
        .item(
            "max_turns",
            "Max Turns",
            "Set maximum number of turns without user input",
        )
        .item(
            "keyring",
            "Secret Storage",
            "Configure how secrets are stored (keyring vs file)",
        )
        .item(
            "experiment",
            "Toggle Experiment",
            "Enable or disable an experiment feature",
        )
        .interact()?;

    let mut should_print_config_path = true;

    match setting_type {
        "goose_mode" => {
            configure_goose_mode_dialog()?;
        }
        "tool_permission" => {
            configure_tool_permissions_dialog().await.and(Ok(()))?;
            // No need to print config file path since it's already handled.
            should_print_config_path = false;
        }
        "tool_output" => {
            configure_tool_output_dialog()?;
        }
        "max_turns" => {
            configure_max_turns_dialog()?;
        }
        "keyring" => {
            configure_keyring_dialog()?;
        }
        "experiment" => {
            toggle_experiments_dialog()?;
        }
        _ => unreachable!(),
    };

    if should_print_config_path {
        print_config_file_saved()?;
    }

    Ok(())
}

pub fn configure_goose_mode_dialog() -> anyhow::Result<()> {
    let config = Config::global();

    if std::env::var("GOOSE_MODE").is_ok() {
        let _ = cliclack::log::info(
            "Notice: GOOSE_MODE environment variable is set and will override the configuration here.",
        );
    }

    let mode = cliclack::select("Which goose mode would you like to configure?")
        .item(
            GooseMode::Auto,
            "Auto Mode",
            "Full file modification, extension usage, edit, create and delete files freely"
        )
        .item(
            GooseMode::Approve,
            "Approve Mode",
            "All tools, extensions and file modifications will require human approval"
        )
        .item(
            GooseMode::SmartApprove,
            "Smart Approve Mode",
            "Editing, creating, deleting files and using extensions will require human approval"
        )
        .item(
            GooseMode::Chat,
            "Chat Mode",
            "Engage with the selected provider without using tools, extensions, or file modification"
        )
        .interact()?;

    config.set_goose_mode(mode)?;
    let msg = match mode {
        GooseMode::Auto => "Set to Auto Mode - full file modification enabled",
        GooseMode::Approve => "Set to Approve Mode - all tools and modifications require approval",
        GooseMode::SmartApprove => "Set to Smart Approve Mode - modifications require approval",
        GooseMode::Chat => "Set to Chat Mode - no tools or modifications enabled",
    };
    cliclack::outro(msg)?;
    Ok(())
}

pub fn configure_tool_output_dialog() -> anyhow::Result<()> {
    let config = Config::global();

    if std::env::var("GOOSE_CLI_MIN_PRIORITY").is_ok() {
        let _ = cliclack::log::info(
            "Notice: GOOSE_CLI_MIN_PRIORITY environment variable is set and will override the configuration here.",
        );
    }
    let tool_log_level = cliclack::select("Which tool output would you like to show?")
        .item("high", "High Importance", "")
        .item("medium", "Medium Importance", "Ex. results of file-writes")
        .item("all", "All (default)", "Ex. shell command output")
        .interact()?;

    match tool_log_level {
        "high" => {
            config.set_param("GOOSE_CLI_MIN_PRIORITY", 0.8)?;
            cliclack::outro("Showing tool output of high importance only.")?;
        }
        "medium" => {
            config.set_param("GOOSE_CLI_MIN_PRIORITY", 0.2)?;
            cliclack::outro("Showing tool output of medium importance.")?;
        }
        "all" => {
            config.set_param("GOOSE_CLI_MIN_PRIORITY", 0.0)?;
            cliclack::outro("Showing all tool output.")?;
        }
        _ => unreachable!(),
    };

    Ok(())
}

pub fn configure_keyring_dialog() -> anyhow::Result<()> {
    let config = Config::global();

    if std::env::var("GOOSE_DISABLE_KEYRING").is_ok() {
        let _ = cliclack::log::info(
            "Notice: GOOSE_DISABLE_KEYRING environment variable is set and will override the configuration here.",
        );
    }

    let currently_disabled = config.get_param::<String>("GOOSE_DISABLE_KEYRING").is_ok();

    let current_status = if currently_disabled {
        "Disabled (using file-based storage)"
    } else {
        "Enabled (using system keyring)"
    };

    let _ = cliclack::log::info(format!("Current secret storage: {}", current_status));
    let secrets_path = Paths::config_dir().join("secrets.yaml");
    let _ = cliclack::log::warning(format!(
        "Note: Disabling the keyring stores secrets in a plain text file ({})",
        secrets_path.display()
    ));

    let storage_option = cliclack::select("How would you like to store secrets?")
        .item(
            "keyring",
            "System Keyring (recommended)",
            "Use secure system keyring for storing API keys and secrets",
        )
        .item(
            "file",
            "File-based Storage",
            "Store secrets in a local file (useful when keyring access is restricted)",
        )
        .interact()?;

    match storage_option {
        "keyring" => {
            // Set to empty string to enable keyring (absence or empty = enabled)
            config.set_param("GOOSE_DISABLE_KEYRING", Value::String("".to_string()))?;
            cliclack::outro("Secret storage set to system keyring (secure)")?;
            let _ =
                cliclack::log::info("You may need to restart goose for this change to take effect");
        }
        "file" => {
            // Set the disable flag to use file storage
            config.set_param("GOOSE_DISABLE_KEYRING", Value::String("true".to_string()))?;
            cliclack::outro(format!(
                "Secret storage set to file ({}). Keep this file secure!",
                secrets_path.display(),
            ))?;
            let _ =
                cliclack::log::info("You may need to restart goose for this change to take effect");
        }
        _ => unreachable!(),
    };

    Ok(())
}

/// Configure experiment features that can be used with goose
/// Dialog for toggling which experiments are enabled/disabled
pub fn toggle_experiments_dialog() -> anyhow::Result<()> {
    let experiments = ExperimentManager::get_all()?;

    if experiments.is_empty() {
        cliclack::outro("No experiments supported yet.")?;
        return Ok(());
    }

    // Get currently enabled experiments for the selection
    let enabled_experiments: Vec<&String> = experiments
        .iter()
        .filter(|(_, enabled)| *enabled)
        .map(|(name, _)| name)
        .collect();

    // Let user toggle experiments
    let selected = cliclack::multiselect(
        "enable experiments: (use \"space\" to toggle and \"enter\" to submit)",
    )
    .required(false)
    .items(
        &experiments
            .iter()
            .map(|(name, _)| (name, name.as_str(), MULTISELECT_VISIBILITY_HINT))
            .collect::<Vec<_>>(),
    )
    .initial_values(enabled_experiments)
    .interact()?;

    // Update enabled status for each experiments
    for name in experiments.iter().map(|(name, _)| name) {
        ExperimentManager::set_enabled(name, selected.iter().any(|&s| s.as_str() == name))?;
    }

    cliclack::outro("Experiments settings updated successfully")?;
    Ok(())
}

pub async fn configure_tool_permissions_dialog() -> anyhow::Result<()> {
    let mut extensions: Vec<String> = get_enabled_extensions()
        .into_iter()
        .map(|ext| ext.name().clone())
        .collect();
    extensions.push("platform".to_string());

    extensions.sort();

    let selected_extension_name = cliclack::select("Choose an extension to configure tools")
        .items(
            &extensions
                .iter()
                .map(|ext| (ext.clone(), ext.clone(), ""))
                .collect::<Vec<_>>(),
        )
        .filter_mode()
        .interact()?;

    let agent = Agent::new();

    let session = agent
        .config
        .session_manager
        .create_session(
            std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from(".")),
            "Tool Permission Configuration".to_string(),
            SessionType::Hidden,
            agent.config.goose_mode,
        )
        .await?;

    let extension_config = get_extension_by_name(&selected_extension_name);
    if let Some(config) = extension_config.as_ref() {
        agent
            .add_extension(config.clone(), &session.id)
            .await
            .unwrap_or_else(|_| {
                println!(
                    "{} Failed to check extension: {}",
                    style("Error").red().italic(),
                    config.name()
                );
            });
    } else {
        println!(
            "{} Configuration not found for extension: {}",
            style("Warning").yellow().italic(),
            selected_extension_name
        );
        return Ok(());
    }

    let permission_manager = PermissionManager::instance();
    let selected_tools = agent
        .list_tools(&session.id, Some(selected_extension_name.clone()))
        .await
        .into_iter()
        .map(|tool| {
            ToolInfo::new(
                &tool.name,
                tool.description
                    .as_ref()
                    .map(|d| d.as_ref())
                    .unwrap_or_default(),
                get_parameter_names(&tool),
                permission_manager.get_user_permission(&tool.name),
            )
        })
        .collect::<Vec<ToolInfo>>();

    let tool_name = cliclack::select("Choose a tool to update permission")
        .items(
            &selected_tools
                .iter()
                .map(|tool| {
                    let first_description = tool
                        .description
                        .split('.')
                        .next()
                        .unwrap_or("No description available")
                        .trim();
                    (tool.name.clone(), tool.name.clone(), first_description)
                })
                .collect::<Vec<_>>(),
        )
        .filter_mode()
        .interact()?;

    // Find the selected tool
    let tool = selected_tools
        .iter()
        .find(|tool| tool.name == tool_name)
        .unwrap();

    // Display tool description and current permission level
    let current_permission = match tool.permission {
        Some(PermissionLevel::AlwaysAllow) => "Always Allow",
        Some(PermissionLevel::AskBefore) => "Ask Before",
        Some(PermissionLevel::NeverAllow) => "Never Allow",
        None => "Not Set",
    };

    // Allow user to set the permission level
    let permission = cliclack::select(format!(
        "Set permission level for tool {}, current permission level: {}",
        tool.name, current_permission
    ))
    .item(
        "always_allow",
        "Always Allow",
        "Allow this tool to execute without asking",
    )
    .item(
        "ask_before",
        "Ask Before",
        "Prompt before executing this tool",
    )
    .item(
        "never_allow",
        "Never Allow",
        "Prevent this tool from executing",
    )
    .interact()?;

    let permission_label = match permission {
        "always_allow" => "Always Allow",
        "ask_before" => "Ask Before",
        "never_allow" => "Never Allow",
        _ => unreachable!(),
    };

    // Update the permission level in the configuration
    let new_permission = match permission {
        "always_allow" => PermissionLevel::AlwaysAllow,
        "ask_before" => PermissionLevel::AskBefore,
        "never_allow" => PermissionLevel::NeverAllow,
        _ => unreachable!(),
    };

    permission_manager.update_user_permission(&tool.name, new_permission);

    cliclack::outro(format!(
        "Updated permission level for tool {} to {}.",
        tool.name, permission_label
    ))?;

    cliclack::outro(format!(
        "Changes saved to {}",
        permission_manager.get_config_path().display()
    ))?;

    Ok(())
}

pub fn configure_max_turns_dialog() -> anyhow::Result<()> {
    let config = Config::global();

    let current_max_turns: u32 = config.get_param("GOOSE_MAX_TURNS").unwrap_or(1000);

    let max_turns_input: String =
        cliclack::input("Set maximum number of agent turns without user input:")
            .placeholder(&current_max_turns.to_string())
            .default_input(&current_max_turns.to_string())
            .validate(|input: &String| match input.parse::<u32>() {
                Ok(value) => {
                    if value < 1 {
                        Err("Value must be at least 1")
                    } else {
                        Ok(())
                    }
                }
                Err(_) => Err("Please enter a valid number"),
            })
            .interact()?;

    let max_turns: u32 = max_turns_input.parse()?;
    config.set_param("GOOSE_MAX_TURNS", max_turns)?;

    cliclack::outro(format!(
        "Set maximum turns to {} - goose will ask for input after {} consecutive actions",
        max_turns, max_turns
    ))?;

    Ok(())
}

fn print_config_file_saved() -> anyhow::Result<()> {
    let config = Config::global();
    cliclack::outro(format!(
        "Configuration saved successfully to {}",
        config.path()
    ))?;
    Ok(())
}
