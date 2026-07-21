use super::api_client::TlsConfig;
use anyhow::Result;
use futures::future::BoxFuture;
pub use goose_providers::conversation::token_usage::{
    CostSource, DraftStats, ProviderStats, ProviderUsage, Usage,
};
use serde::{Deserialize, Serialize};

pub const DEFAULT_PROVIDER_TIMEOUT_SECS: u64 = 600;

use crate::config::ExtensionConfig;
use utoipa::ToSchema;

use std::path::PathBuf;

pub use goose_providers::base::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub enum ProviderType {
    Preferred,
    Builtin,
    Declarative,
    Custom,
}

pub trait ProviderDef: ProviderDescriptor + Send + Sync {
    type Provider: Provider + 'static;

    fn from_env(
        extensions: Vec<ExtensionConfig>,
        tls_config: Option<TlsConfig>,
    ) -> BoxFuture<'static, Result<Self::Provider>>
    where
        Self: Sized;

    fn from_env_with_working_dir(
        extensions: Vec<ExtensionConfig>,
        _working_dir: PathBuf,
        tls_config: Option<TlsConfig>,
    ) -> BoxFuture<'static, Result<Self::Provider>>
    where
        Self: Sized,
    {
        Self::from_env(extensions, tls_config)
    }
}
