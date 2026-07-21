use crate::thinking::ThinkingEffort;
use serde::de::Deserializer;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use utoipa::ToSchema;

pub const DEFAULT_CONTEXT_LIMIT: usize = 128_000;

/// Request param keys that describe model-family-agnostic reasoning behavior and
/// are therefore safe to carry across a model switch or subagent delegation.
/// Provider-specific keys (e.g. `anthropic_beta`) are deliberately excluded so
/// they can't bleed into a request targeting a different model family.
const INHERITED_SESSION_PARAM_KEYS: &[&str] = &[
    "thinking_effort",
    "thinking_budget",
    "budget_tokens",
    "enable_thinking",
    "preserve_thinking_context",
    "preserve_unsigned_thinking",
];

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ModelConfig {
    pub model_name: String,
    pub context_limit: Option<usize>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<i32>,
    pub toolshim: bool,
    pub toolshim_model: Option<String>,
    /// Provider-specific request parameters (e.g., anthropic_beta headers)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub request_params: Option<HashMap<String, Value>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<bool>,
}

impl<'de> Deserialize<'de> for ModelConfig {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct RawModelConfig {
            model_name: String,
            context_limit: Option<usize>,
            temperature: Option<f32>,
            max_tokens: Option<i32>,
            toolshim: bool,
            toolshim_model: Option<String>,
            #[serde(default, skip_serializing_if = "Option::is_none")]
            request_params: Option<HashMap<String, Value>>,
            #[serde(default, skip_serializing_if = "Option::is_none")]
            reasoning: Option<bool>,
        }

        let raw = RawModelConfig::deserialize(deserializer)?;
        let mut config = Self {
            model_name: raw.model_name,
            context_limit: raw.context_limit,
            temperature: raw.temperature,
            max_tokens: raw.max_tokens,
            toolshim: raw.toolshim,
            toolshim_model: raw.toolshim_model,
            request_params: raw.request_params,
            reasoning: raw.reasoning,
        };
        config.normalize_effort_suffix();
        Ok(config)
    }
}

impl ModelConfig {
    pub fn new(model_name: impl AsRef<str>) -> Self {
        let mut config = Self {
            model_name: model_name.as_ref().to_string(),
            context_limit: None,
            temperature: None,
            max_tokens: None,
            toolshim: false,
            toolshim_model: None,
            request_params: None,
            reasoning: None,
        };
        config.normalize_effort_suffix();
        config
    }

    pub fn with_context_limit(mut self, limit: Option<usize>) -> Self {
        if limit.is_some() {
            self.context_limit = limit;
        }
        self
    }

    pub fn with_temperature(mut self, temp: Option<f32>) -> Self {
        self.temperature = temp;
        self
    }

    pub fn with_max_tokens(mut self, tokens: Option<i32>) -> Self {
        self.max_tokens = tokens;
        self
    }

    pub fn with_default_context_limit(mut self, limit: Option<usize>) -> Self {
        if self.context_limit.is_none() {
            self.context_limit = limit;
        }
        self
    }

    pub fn with_default_max_tokens(mut self, tokens: Option<i32>) -> Self {
        if self.max_tokens.is_none() {
            self.max_tokens = tokens;
        }
        self
    }

    pub fn with_toolshim(mut self, toolshim: bool) -> Self {
        self.toolshim = toolshim;
        self
    }

    pub fn with_toolshim_model(mut self, model: Option<String>) -> Self {
        self.toolshim_model = model;
        self
    }

    pub fn with_merged_request_params(mut self, params: HashMap<String, Value>) -> Self {
        match self.request_params.as_mut() {
            Some(existing) => {
                for (k, v) in params {
                    existing.insert(k, v);
                }
            }
            None => {
                self.request_params = Some(params);
            }
        }
        self
    }

    pub fn with_thinking_effort(mut self, effort: ThinkingEffort) -> Self {
        let params = self.request_params.get_or_insert_with(HashMap::new);
        params.insert(
            "thinking_effort".to_string(),
            serde_json::json!(effort.to_string()),
        );
        self
    }

    pub fn with_default_thinking_effort(mut self, effort: Option<ThinkingEffort>) -> Self {
        if self.thinking_effort().is_none() {
            if let Some(effort) = effort {
                self = self.with_thinking_effort(effort);
            }
        }
        self
    }

    pub fn with_inherited_session_settings_from(
        mut self,
        previous: Option<&ModelConfig>,
        request_params: Option<HashMap<String, Value>>,
    ) -> Self {
        if let Some(previous_params) = previous.and_then(|p| p.request_params.as_ref()) {
            for key in INHERITED_SESSION_PARAM_KEYS {
                if let Some(value) = previous_params.get(*key) {
                    self.request_params
                        .get_or_insert_with(HashMap::new)
                        .entry(key.to_string())
                        .or_insert_with(|| value.clone());
                }
            }
        }

        if let Some(request_params) = request_params {
            self = self.with_merged_request_params(request_params);
        }

        self
    }

    pub fn context_limit(&self) -> usize {
        self.context_limit.unwrap_or(DEFAULT_CONTEXT_LIMIT)
    }

    pub fn max_output_tokens(&self) -> i32 {
        if let Some(tokens) = self.max_tokens {
            return tokens;
        }

        4_096
    }

    /// Split a trailing effort suffix (`gpt-5-high`) off the model name and
    /// record it as the thinking effort.
    pub fn normalize_effort_suffix(&mut self) {
        let parts: Vec<&str> = self.model_name.split('-').collect();
        let last = match parts.last() {
            Some(l) => *l,
            None => return,
        };
        let effort = match last {
            "none" => ThinkingEffort::Off,
            "low" => ThinkingEffort::Low,
            "medium" => ThinkingEffort::Medium,
            "high" => ThinkingEffort::High,
            "xhigh" => ThinkingEffort::Max,
            _ => return,
        };
        self.model_name = parts[..parts.len() - 1].join("-");
        let has_explicit_effort = self
            .request_params
            .as_ref()
            .and_then(|p| p.get("thinking_effort"))
            .is_some();
        if !has_explicit_effort {
            let params = self.request_params.get_or_insert_with(HashMap::new);
            params.insert(
                "thinking_effort".to_string(),
                serde_json::json!(effort.to_string()),
            );
        }
    }

    pub fn thinking_effort(&self) -> Option<ThinkingEffort> {
        self.request_param::<String>("thinking_effort")
            .and_then(|s| s.parse::<ThinkingEffort>().ok())
    }

    pub fn request_param<T: for<'de> serde::Deserialize<'de>>(
        &self,
        request_key: &str,
    ) -> Option<T> {
        self.request_params
            .as_ref()
            .and_then(|params| params.get(request_key))
            .and_then(|v| serde_json::from_value(v.clone()).ok())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    mod thinking_effort_tests {
        use super::*;

        fn config_with_params(model_name: &str, params: HashMap<String, Value>) -> ModelConfig {
            ModelConfig::new(model_name).with_merged_request_params(params)
        }

        #[test]
        fn from_request_params() {
            let mut params = HashMap::new();
            params.insert("thinking_effort".to_string(), serde_json::json!("medium"));
            let config = config_with_params("test", params);
            assert_eq!(config.thinking_effort(), Some(ThinkingEffort::Medium));
        }

        #[test]
        fn with_thinking_effort_sets_request_param() {
            let config = ModelConfig::new("test").with_thinking_effort(ThinkingEffort::High);

            assert_eq!(
                config
                    .request_params
                    .as_ref()
                    .and_then(|params| params.get("thinking_effort")),
                Some(&serde_json::json!("high"))
            );
        }

        #[test]
        fn preserves_explicit_thinking_effort() {
            let previous = config_with_params(
                "previous",
                HashMap::from([("thinking_effort".to_string(), serde_json::json!("high"))]),
            );
            let config = ModelConfig::new("next")
                .with_inherited_session_settings_from(Some(&previous), None);

            assert_eq!(
                config
                    .request_params
                    .as_ref()
                    .and_then(|params| params.get("thinking_effort")),
                Some(&serde_json::json!("high"))
            );
        }

        #[test]
        fn does_not_override_existing_thinking_effort() {
            let previous = config_with_params(
                "previous",
                HashMap::from([("thinking_effort".to_string(), serde_json::json!("high"))]),
            );
            let config = config_with_params(
                "next",
                HashMap::from([("thinking_effort".to_string(), serde_json::json!("low"))]),
            )
            .with_inherited_session_settings_from(Some(&previous), None);

            assert_eq!(
                config
                    .request_params
                    .as_ref()
                    .and_then(|params| params.get("thinking_effort")),
                Some(&serde_json::json!("low"))
            );
        }

        #[test]
        fn inherits_reasoning_controls_but_not_provider_specific_params() {
            let previous = config_with_params(
                "previous",
                HashMap::from([
                    ("budget_tokens".to_string(), serde_json::json!(8192)),
                    (
                        "preserve_thinking_context".to_string(),
                        serde_json::json!(true),
                    ),
                    ("anthropic_beta".to_string(), serde_json::json!("beta")),
                ]),
            );
            let config = ModelConfig::new("next")
                .with_inherited_session_settings_from(Some(&previous), None);

            let params = config.request_params.expect("reasoning controls inherited");
            assert_eq!(params.get("budget_tokens"), Some(&serde_json::json!(8192)));
            assert_eq!(
                params.get("preserve_thinking_context"),
                Some(&serde_json::json!(true))
            );
            assert_eq!(params.get("anthropic_beta"), None);
        }

        #[test]
        fn explicit_request_params_override_preserved_session_settings() {
            let previous = config_with_params(
                "previous",
                HashMap::from([("thinking_effort".to_string(), serde_json::json!("high"))]),
            );
            let config = ModelConfig::new("next").with_inherited_session_settings_from(
                Some(&previous),
                Some(HashMap::from([(
                    "thinking_effort".to_string(),
                    serde_json::json!("low"),
                )])),
            );

            assert_eq!(
                config
                    .request_params
                    .as_ref()
                    .and_then(|params| params.get("thinking_effort")),
                Some(&serde_json::json!("low"))
            );
        }

        #[test]
        fn effort_suffix_stripped_from_model_name() {
            let _guard = env_lock::lock_env([
                ("GOOSE_THINKING_EFFORT", None::<&str>),
                ("GOOSE_MAX_TOKENS", None::<&str>),
                ("GOOSE_TEMPERATURE", None::<&str>),
                ("GOOSE_CONTEXT_LIMIT", None::<&str>),
                ("GOOSE_TOOLSHIM", None::<&str>),
                ("GOOSE_TOOLSHIM_OLLAMA_MODEL", None::<&str>),
            ]);
            let config = ModelConfig::new("o3-mini-high");
            assert_eq!(config.model_name, "o3-mini");
            assert_eq!(config.thinking_effort(), Some(ThinkingEffort::High));
        }

        #[test]
        fn none_suffix_stripped_from_model_name() {
            let _guard = env_lock::lock_env([
                ("GOOSE_THINKING_EFFORT", Some("high")),
                ("GOOSE_MAX_TOKENS", None::<&str>),
                ("GOOSE_TEMPERATURE", None::<&str>),
                ("GOOSE_CONTEXT_LIMIT", None::<&str>),
                ("GOOSE_TOOLSHIM", None::<&str>),
                ("GOOSE_TOOLSHIM_OLLAMA_MODEL", None::<&str>),
            ]);
            let config = ModelConfig::new("o3-mini-none");
            assert_eq!(config.model_name, "o3-mini");
            assert_eq!(config.thinking_effort(), Some(ThinkingEffort::Off));
        }

        #[test]
        fn xhigh_suffix_stripped_from_model_name() {
            let _guard = env_lock::lock_env([
                ("GOOSE_THINKING_EFFORT", Some("low")),
                ("GOOSE_MAX_TOKENS", None::<&str>),
                ("GOOSE_TEMPERATURE", None::<&str>),
                ("GOOSE_CONTEXT_LIMIT", None::<&str>),
                ("GOOSE_TOOLSHIM", None::<&str>),
                ("GOOSE_TOOLSHIM_OLLAMA_MODEL", None::<&str>),
            ]);
            let config = ModelConfig::new("gpt-5.4-xhigh");
            assert_eq!(config.model_name, "gpt-5.4");
            assert_eq!(config.thinking_effort(), Some(ThinkingEffort::Max));
        }

        #[test]
        fn effort_suffix_not_stripped_when_thinking_effort_set() {
            let _guard = env_lock::lock_env([
                ("GOOSE_THINKING_EFFORT", None::<&str>),
                ("GOOSE_MAX_TOKENS", None::<&str>),
                ("GOOSE_TEMPERATURE", None::<&str>),
                ("GOOSE_CONTEXT_LIMIT", None::<&str>),
                ("GOOSE_TOOLSHIM", None::<&str>),
                ("GOOSE_TOOLSHIM_OLLAMA_MODEL", None::<&str>),
            ]);
            let mut params = HashMap::new();
            params.insert("thinking_effort".to_string(), serde_json::json!("low"));
            let mut config = ModelConfig::new("o3-mini-high");
            // Suffix was already normalized during new(), but if request_params
            // were set before construction, the suffix would not be stripped.
            // Verify the normalized state:
            assert_eq!(config.model_name, "o3-mini");

            // Now simulate setting explicit effort after construction
            config.request_params = Some(params);
            assert_eq!(config.thinking_effort(), Some(ThinkingEffort::Low));
        }

        #[test]
        fn no_suffix_no_change() {
            let _guard = env_lock::lock_env([
                ("GOOSE_THINKING_EFFORT", None::<&str>),
                ("GOOSE_MAX_TOKENS", None::<&str>),
                ("GOOSE_TEMPERATURE", None::<&str>),
                ("GOOSE_CONTEXT_LIMIT", None::<&str>),
                ("GOOSE_TOOLSHIM", None::<&str>),
                ("GOOSE_TOOLSHIM_OLLAMA_MODEL", None::<&str>),
            ]);
            let config = ModelConfig::new("o3-mini");
            assert_eq!(config.model_name, "o3-mini");
        }

        #[test]
        fn effort_suffix_stripped_for_any_model() {
            let _guard = env_lock::lock_env([
                ("GOOSE_THINKING_EFFORT", None::<&str>),
                ("GOOSE_MAX_TOKENS", None::<&str>),
                ("GOOSE_TEMPERATURE", None::<&str>),
                ("GOOSE_CONTEXT_LIMIT", None::<&str>),
                ("GOOSE_TOOLSHIM", None::<&str>),
                ("GOOSE_TOOLSHIM_OLLAMA_MODEL", None::<&str>),
            ]);
            let config = ModelConfig::new("claude-sonnet-4-high");
            assert_eq!(config.model_name, "claude-sonnet-4");
            assert_eq!(config.thinking_effort(), Some(ThinkingEffort::High));
        }

        #[test]
        fn parse_aliases() {
            assert_eq!("off".parse::<ThinkingEffort>(), Ok(ThinkingEffort::Off));
            assert_eq!(
                "disabled".parse::<ThinkingEffort>(),
                Ok(ThinkingEffort::Off)
            );
            assert_eq!("med".parse::<ThinkingEffort>(), Ok(ThinkingEffort::Medium));
            assert_eq!("max".parse::<ThinkingEffort>(), Ok(ThinkingEffort::Max));
            assert_eq!("xhigh".parse::<ThinkingEffort>(), Ok(ThinkingEffort::Max));
            assert!("invalid".parse::<ThinkingEffort>().is_err());
        }
    }
}
