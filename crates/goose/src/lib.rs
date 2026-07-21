#![recursion_limit = "256"]

#[cfg(all(feature = "rustls-tls", feature = "native-tls"))]
compile_error!("Features `rustls-tls` and `native-tls` are mutually exclusive");

pub mod acp;
pub use goose_sdk_types::{custom_notifications, custom_requests};
pub mod agents;
pub mod checks;
pub mod codex;
pub mod config;
pub mod conversation_format;
pub mod conversation {
    pub use goose_types::conversation::*;
}
pub mod download_manager;
pub mod execution;
pub mod gateway;
pub mod goose_apps;
pub mod hints;
pub mod hooks;
pub mod instance_id;
pub mod logging;
pub mod login_shell;
pub mod mcp_utils;
pub mod model_config;
pub mod oauth;
#[cfg(feature = "otel")]
pub mod otel;
pub mod permission;
pub mod plugins;
#[cfg(feature = "telemetry")]
pub mod posthog;
pub mod prompt_template;
pub mod providers {
    pub const CODEX_PROVIDER_NAME: &str = "codex";
    pub const CODEX_DEFAULT_MODEL: &str = "current";
}
pub mod recipe;
pub mod recipe_deeplink;
pub mod scheduler;
pub mod scheduler_trait;
pub mod session;
pub mod session_context;
pub mod skills;
pub mod slash_commands;
pub mod source_roots;
pub mod sources;
pub mod subprocess;
pub mod token_counter;
pub mod tracing;
pub mod utils;
