use anyhow::Result;
use async_trait::async_trait;
use futures::future::BoxFuture;
use goose_providers::errors::ProviderError;
use goose_providers::model::ModelConfig;
use rmcp::model::Tool;

use super::base::{MessageStream, Provider, ProviderDef, ProviderMetadata};
use crate::config::ExtensionConfig;
use crate::conversation::message::Message;

const CODEX_PROVIDER_NAME: &str = "codex";
pub const CODEX_DEFAULT_MODEL: &str = "current";
pub const CODEX_KNOWN_MODELS: &[&str] = &[CODEX_DEFAULT_MODEL];
pub const CODEX_DOC_URL: &str = "https://developers.openai.com/codex/";

#[derive(Debug, serde::Serialize)]
pub struct CodexProvider;

impl goose_providers::base::ProviderDescriptor for CodexProvider {
    fn metadata() -> ProviderMetadata {
        ProviderMetadata::new(
            CODEX_PROVIDER_NAME,
            "OpenAI Codex",
            "Native Codex App Server runtime",
            CODEX_DEFAULT_MODEL,
            CODEX_KNOWN_MODELS.to_vec(),
            CODEX_DOC_URL,
            Vec::new(),
        )
    }
}

impl ProviderDef for CodexProvider {
    type Provider = Self;

    fn from_env(
        _extensions: Vec<ExtensionConfig>,
        _tls_config: Option<crate::providers::api_client::TlsConfig>,
    ) -> BoxFuture<'static, Result<Self::Provider>> {
        Box::pin(async { Ok(Self) })
    }
}

#[async_trait]
impl Provider for CodexProvider {
    fn get_name(&self) -> &str {
        CODEX_PROVIDER_NAME
    }

    async fn stream(
        &self,
        model_config: &ModelConfig,
        system: &str,
        messages: &[Message],
        _tools: &[Tool],
    ) -> Result<MessageStream, ProviderError> {
        if super::cli_common::is_session_description_request(system) {
            let (message, usage) = super::cli_common::generate_simple_session_description(
                &model_config.model_name,
                messages,
            )?;
            return Ok(super::base::stream_from_single_message(message, usage));
        }

        Err(ProviderError::RequestFailed(
            "Native Codex completions are handled by CodexAgentCore".to_string(),
        ))
    }

    async fn fetch_supported_models(&self) -> Result<Vec<String>, ProviderError> {
        Ok(CODEX_KNOWN_MODELS
            .iter()
            .map(|model| (*model).to_string())
            .collect())
    }
}
