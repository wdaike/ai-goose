use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::ToSchema;

use crate::config::{Config, ConfigError};
use crate::providers::base::{ProviderMetadata, ProviderType};

pub const SECRET_STORE_ID_PREFIX: &str = "secret_store:";

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderSecretStorage {
    SecretStore,
    ProviderCache,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderSecretStatus {
    Valid,
    Expired,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ProviderSecret {
    pub id: String,
    pub provider: String,
    pub provider_display_name: String,
    pub name: String,
    pub storage: ProviderSecretStorage,
    pub expires_at: Option<DateTime<Utc>>,
    pub status: ProviderSecretStatus,
    pub configured: bool,
    pub has_secret: bool,
    pub can_delete: bool,
    pub can_configure: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub configure_provider: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum DeleteProviderSecretError {
    #[error("Invalid provider secret id: '{0}'")]
    InvalidId(String),
    #[error(transparent)]
    Config(#[from] ConfigError),
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

fn build_secret_store_secrets(
    stored_secrets: &HashMap<String, Value>,
    providers: &[(ProviderMetadata, ProviderType)],
) -> Vec<ProviderSecret> {
    let mut secrets = Vec::new();

    for (metadata, _) in providers {
        for config_key in metadata.config_keys.iter().filter(|key| key.secret) {
            if !stored_secrets.contains_key(&config_key.name) {
                continue;
            }
            secrets.push(ProviderSecret {
                id: format!(
                    "{}{}:{}",
                    SECRET_STORE_ID_PREFIX, metadata.name, config_key.name
                ),
                provider: metadata.name.clone(),
                provider_display_name: metadata.display_name.clone(),
                name: config_key.name.clone(),
                storage: ProviderSecretStorage::SecretStore,
                expires_at: None,
                status: ProviderSecretStatus::Unknown,
                configured: true,
                has_secret: true,
                can_delete: true,
                can_configure: false,
                configure_provider: None,
            });
        }
    }

    secrets
}

fn is_known_provider_secret(
    providers: &[(ProviderMetadata, ProviderType)],
    provider: &str,
    key: &str,
) -> bool {
    providers
        .iter()
        .filter(|(metadata, _)| metadata.name == provider)
        .flat_map(|(metadata, _)| metadata.config_keys.iter())
        .any(|config_key| config_key.secret && config_key.name == key)
}

fn parse_secret_store_id(id: &str) -> Option<(&str, &str)> {
    let rest = id.strip_prefix(SECRET_STORE_ID_PREFIX)?;
    rest.split_once(':')
}

pub async fn list_provider_secrets() -> Result<Vec<ProviderSecret>, ConfigError> {
    let config = Config::global();
    let stored_secrets = config.all_secrets()?;
    let providers = crate::providers::providers().await;

    let mut secrets = build_secret_store_secrets(&stored_secrets, &providers);

    secrets.sort_by(|a, b| {
        a.provider_display_name
            .cmp(&b.provider_display_name)
            .then_with(|| a.name.cmp(&b.name))
    });

    Ok(secrets)
}

pub async fn delete_provider_secret(id: &str) -> Result<(), DeleteProviderSecretError> {
    let config = Config::global();

    if let Some((provider, key)) = parse_secret_store_id(id) {
        let providers = crate::providers::providers().await;
        if !is_known_provider_secret(&providers, provider, key) {
            return Err(DeleteProviderSecretError::InvalidId(id.to_string()));
        }

        config.delete_secret(key)?;
        return Ok(());
    }

    Err(DeleteProviderSecretError::InvalidId(id.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::base::ConfigKey;

    fn test_providers() -> Vec<(ProviderMetadata, ProviderType)> {
        let metadata = ProviderMetadata::new(
            "codex",
            "OpenAI Codex",
            "Codex provider",
            "current",
            vec![],
            "https://example.com",
            vec![
                ConfigKey::new("CODEX_API_KEY", true, true, None, true),
                ConfigKey::new("CODEX_HOST", false, false, None, false),
            ],
        );
        vec![(metadata, ProviderType::Builtin)]
    }

    #[test]
    fn secret_store_listing_only_includes_provider_secret_keys() {
        let providers = test_providers();
        let stored_secrets = HashMap::from([
            (
                "CODEX_API_KEY".to_string(),
                Value::String("secret-value".to_string()),
            ),
            (
                "UNRELATED_SECRET".to_string(),
                Value::String("other-secret".to_string()),
            ),
            (
                "CODEX_HOST".to_string(),
                Value::String("https://api.openai.com".to_string()),
            ),
        ]);

        let secrets = build_secret_store_secrets(&stored_secrets, &providers);

        assert_eq!(secrets.len(), 1);
        assert_eq!(secrets[0].id, "secret_store:codex:CODEX_API_KEY");
        assert_eq!(secrets[0].name, "CODEX_API_KEY");
        assert_eq!(secrets[0].storage, ProviderSecretStorage::SecretStore);
        assert_eq!(secrets[0].status, ProviderSecretStatus::Unknown);
    }

    #[test]
    fn provider_secret_delete_validation_requires_provider_secret_key() {
        let providers = test_providers();

        assert!(is_known_provider_secret(
            &providers,
            "codex",
            "CODEX_API_KEY"
        ));
        assert!(!is_known_provider_secret(&providers, "codex", "CODEX_HOST"));
        assert!(!is_known_provider_secret(
            &providers,
            "codex",
            "UNRELATED_SECRET"
        ));
        assert!(!is_known_provider_secret(
            &providers,
            "other",
            "CODEX_API_KEY"
        ));
    }
}
