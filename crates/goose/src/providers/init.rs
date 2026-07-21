use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use super::{
    base::{Provider, ProviderMetadata},
    codex::CodexProvider,
    provider_registry::ProviderRegistry,
};
use crate::config::ExtensionConfig;
use crate::providers::base::ProviderType;
use crate::providers::provider_registry::ProviderEntry;
use anyhow::Result;
use tokio::sync::OnceCell;

static REGISTRY: OnceCell<RwLock<ProviderRegistry>> = OnceCell::const_new();

async fn init_registry() -> RwLock<ProviderRegistry> {
    let tls_config =
        crate::config::tls::provider_tls_config_from_config(crate::config::Config::global())
            .expect("failed to load provider TLS config");
    let registry = ProviderRegistry::new(tls_config).with_providers(|registry| {
        registry.register::<CodexProvider>(true);
    });
    RwLock::new(registry)
}

async fn get_registry() -> &'static RwLock<ProviderRegistry> {
    REGISTRY.get_or_init(init_registry).await
}

pub async fn providers() -> Vec<(ProviderMetadata, ProviderType)> {
    get_registry()
        .await
        .read()
        .unwrap()
        .all_metadata_with_types()
}

pub async fn get_from_registry(name: &str) -> Result<ProviderEntry> {
    let guard = get_registry().await.read().unwrap();
    guard
        .entries
        .get(name)
        .ok_or_else(|| anyhow::anyhow!("Unknown provider: {}", name))
        .cloned()
}

pub async fn create(name: &str, extensions: Vec<ExtensionConfig>) -> Result<Arc<dyn Provider>> {
    let entry = get_from_registry(name).await?;
    entry.create(extensions).await
}

pub async fn create_with_working_dir(
    name: &str,
    extensions: Vec<ExtensionConfig>,
    working_dir: PathBuf,
) -> Result<Arc<dyn Provider>> {
    let entry = get_from_registry(name).await?;
    entry.create_with_working_dir(extensions, working_dir).await
}

pub async fn create_with_default_model(
    name: impl AsRef<str>,
    extensions: Vec<ExtensionConfig>,
) -> Result<Arc<dyn Provider>> {
    get_from_registry(name.as_ref())
        .await?
        .create_with_default_model(extensions)
        .await
}

pub async fn cleanup_provider(name: &str) -> Result<()> {
    let cleanup_fn = {
        let registry = get_registry().await.read().unwrap();
        registry
            .entries
            .get(name)
            .and_then(|entry| entry.cleanup.clone())
    };
    if let Some(cleanup) = cleanup_fn {
        return cleanup().await;
    }
    Ok(())
}

pub async fn create_with_named_model(
    provider_name: &str,
    extensions: Vec<ExtensionConfig>,
) -> Result<Arc<dyn Provider>> {
    create(provider_name, extensions).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_registry_contains_only_codex() {
        let providers_list = providers().await;
        assert_eq!(providers_list.len(), 1);
        assert_eq!(providers_list[0].0.name, "codex");
        get_from_registry("codex")
            .await
            .expect("codex provider should be registered");
    }
}
