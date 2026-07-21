use super::api_client::TlsConfig;
use super::base::{Provider, ProviderDef, ProviderMetadata, ProviderType};
use crate::config::ExtensionConfig;
use anyhow::Result;
use futures::future::BoxFuture;
use goose_providers::model::ModelConfig;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

pub type ProviderConstructor = Arc<
    dyn Fn(
            Vec<ExtensionConfig>,
            Option<PathBuf>,
            Option<TlsConfig>,
        ) -> BoxFuture<'static, Result<Arc<dyn Provider>>>
        + Send
        + Sync,
>;

pub type ProviderCleanup = Arc<dyn Fn() -> BoxFuture<'static, Result<()>> + Send + Sync>;

#[derive(Clone)]
pub struct ProviderEntry {
    metadata: ProviderMetadata,
    pub(crate) constructor: ProviderConstructor,
    pub(crate) cleanup: Option<ProviderCleanup>,
    provider_type: ProviderType,
    tls_config: Option<TlsConfig>,
}

impl ProviderEntry {
    pub fn metadata(&self) -> &ProviderMetadata {
        &self.metadata
    }

    pub fn provider_type(&self) -> ProviderType {
        self.provider_type
    }

    /// Apply provider-specific normalization to a model config: materialize
    /// global defaults and backfill `context_limit` from the provider's known
    /// models when the canonical registry didn't already resolve one. Used by
    /// the agent/session layer to resolve effective limits (e.g. for custom
    /// providers that declare explicit context limits in their config).
    pub fn normalize_model_config(&self, mut model: ModelConfig) -> Result<ModelConfig> {
        model = crate::model_config::materialize_model_config(&self.metadata.name, model)?;

        if model.context_limit.is_none() {
            if let Some(info) = self
                .metadata
                .known_models
                .iter()
                .find(|m| m.name.eq_ignore_ascii_case(&model.model_name) && m.context_limit > 0)
            {
                model.context_limit = Some(info.context_limit);
            }
        }

        Ok(model)
    }

    pub async fn create_with_default_model(
        &self,
        extensions: Vec<ExtensionConfig>,
    ) -> Result<Arc<dyn Provider>> {
        self.create(extensions).await
    }

    pub async fn create(&self, extensions: Vec<ExtensionConfig>) -> Result<Arc<dyn Provider>> {
        (self.constructor)(extensions, None, self.tls_config.clone()).await
    }

    pub async fn create_with_working_dir(
        &self,
        extensions: Vec<ExtensionConfig>,
        working_dir: PathBuf,
    ) -> Result<Arc<dyn Provider>> {
        (self.constructor)(extensions, Some(working_dir), self.tls_config.clone()).await
    }
}

#[derive(Default)]
pub struct ProviderRegistry {
    pub(crate) entries: HashMap<String, ProviderEntry>,
    tls_config: Option<TlsConfig>,
}

impl ProviderRegistry {
    pub fn new(tls_config: Option<TlsConfig>) -> Self {
        Self {
            entries: HashMap::new(),
            tls_config,
        }
    }

    pub fn register<F>(&mut self, preferred: bool)
    where
        F: ProviderDef + 'static,
    {
        let metadata = F::metadata();
        let name = metadata.name.clone();

        self.entries.insert(
            name,
            ProviderEntry {
                metadata,
                constructor: Arc::new(|extensions, working_dir, tls_config| {
                    Box::pin(async move {
                        let provider = match working_dir {
                            Some(working_dir) => {
                                F::from_env_with_working_dir(extensions, working_dir, tls_config)
                                    .await?
                            }
                            None => F::from_env(extensions, tls_config).await?,
                        };
                        Ok(Arc::new(provider) as Arc<dyn Provider>)
                    })
                }),
                cleanup: None,
                provider_type: if preferred {
                    ProviderType::Preferred
                } else {
                    ProviderType::Builtin
                },
                tls_config: self.tls_config.clone(),
            },
        );
    }

    pub fn set_cleanup(&mut self, name: &str, cleanup: ProviderCleanup) {
        if let Some(entry) = self.entries.get_mut(name) {
            entry.cleanup = Some(cleanup);
        }
    }

    pub fn with_providers<F>(mut self, setup: F) -> Self
    where
        F: FnOnce(&mut Self),
    {
        setup(&mut self);
        self
    }

    pub async fn create(
        &self,
        name: &str,
        extensions: Vec<ExtensionConfig>,
    ) -> Result<Arc<dyn Provider>> {
        let entry = self
            .entries
            .get(name)
            .ok_or_else(|| anyhow::anyhow!("Unknown provider: {}", name))?;

        entry.create(extensions).await
    }

    pub fn all_metadata_with_types(&self) -> Vec<(ProviderMetadata, ProviderType)> {
        self.entries
            .values()
            .map(|e| (e.metadata.clone(), e.provider_type))
            .collect()
    }
}
