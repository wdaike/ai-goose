use anyhow::Result;
use goose_providers::conversation::token_usage::{CostSource, ProviderUsage, Usage};
use rmcp::model::Tool;
use serde_json::{json, Value};

use crate::agents::Agent;
use crate::conversation::message::MessageUsage;

fn coerce_value(value: &str, schema: &Value) -> Value {
    match schema.get("type") {
        Some(Value::String(kind)) => match kind.as_str() {
            "number" | "integer" => coerce_number(value),
            "boolean" => coerce_boolean(value),
            _ => Value::String(value.to_string()),
        },
        Some(Value::Array(kinds)) => {
            for kind in kinds {
                match kind.as_str() {
                    Some("number" | "integer") if value.parse::<f64>().is_ok() => {
                        return coerce_number(value);
                    }
                    Some("boolean")
                        if matches!(value.to_lowercase().as_str(), "true" | "false") =>
                    {
                        return coerce_boolean(value);
                    }
                    _ => {}
                }
            }
            Value::String(value.to_string())
        }
        _ => Value::String(value.to_string()),
    }
}

fn coerce_number(value: &str) -> Value {
    let Ok(number) = value.parse::<f64>() else {
        return Value::String(value.to_string());
    };
    if number.fract() == 0.0 && number >= i64::MIN as f64 && number <= i64::MAX as f64 {
        json!(number as i64)
    } else {
        json!(number)
    }
}

fn coerce_boolean(value: &str) -> Value {
    match value.to_lowercase().as_str() {
        "true" => json!(true),
        "false" => json!(false),
        _ => Value::String(value.to_string()),
    }
}

pub(crate) fn coerce_tool_arguments(
    arguments: Option<serde_json::Map<String, Value>>,
    tool_schema: &Value,
) -> Option<serde_json::Map<String, Value>> {
    let properties = tool_schema.get("properties")?.as_object()?;
    Some(
        arguments?
            .into_iter()
            .map(|(name, value)| {
                let value = match (&value, properties.get(&name)) {
                    (Value::String(value), Some(schema)) => coerce_value(value, schema),
                    _ => value,
                };
                (name, value)
            })
            .collect(),
    )
}

impl Agent {
    pub(crate) async fn update_session_metrics(
        &self,
        session_id: &str,
        schedule_id: Option<String>,
        usage: &ProviderUsage,
        is_compaction_usage: bool,
    ) -> Result<ProviderUsage> {
        let manager = self.config.session_manager.clone();
        let session = manager.get_session(session_id, false).await?;
        let (chunk_cost, cost_source) =
            self.resolve_chunk_cost(usage, session.provider_name.as_deref());

        let mut enriched = usage.clone();
        enriched.cost = chunk_cost;
        enriched.cost_source = cost_source;
        let ledger = MessageUsage::from_provider_usage(&enriched, is_compaction_usage);
        let current_usage = if is_compaction_usage {
            let new_input = usage.usage.output_tokens;
            Usage::new(new_input, None, new_input)
        } else {
            usage.usage
        };

        manager
            .record_usage_metrics(
                session_id,
                schedule_id,
                current_usage,
                &usage.model,
                &ledger,
            )
            .await?;
        Ok(enriched)
    }

    fn resolve_chunk_cost(
        &self,
        usage: &ProviderUsage,
        provider_name: Option<&str>,
    ) -> (Option<f64>, Option<CostSource>) {
        if let Some(cost) = usage.cost {
            return (Some(cost), Some(CostSource::ProviderReported));
        }
        match provider_name
            .and_then(|name| {
                crate::providers::canonical::maybe_get_canonical_model(name, &usage.model)
            })
            .and_then(|model| model.cost.estimate_cost(&usage.usage))
        {
            Some(cost) => (Some(cost), Some(CostSource::Estimated)),
            None => (None, None),
        }
    }
}

pub fn is_tool_visible_to_app(tool: &Tool) -> bool {
    visibility(tool).is_none_or(|visibility| visibility.iter().any(|value| *value == "app"))
}

pub fn is_tool_visible_to_model(tool: &Tool) -> bool {
    visibility(tool).is_none_or(|visibility| visibility.iter().any(|value| *value == "model"))
}

fn visibility(tool: &Tool) -> Option<Vec<&str>> {
    let visibility = tool.meta.as_ref()?.0.get("ui")?.get("visibility")?;
    let Some(values) = visibility.as_array() else {
        return None;
    };
    Some(values.iter().filter_map(Value::as_str).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rmcp::object;

    fn tool_with_visibility(visibility: Value) -> Tool {
        Tool::new("test", "test", object!({ "type": "object" })).with_meta(rmcp::model::Meta(
            json!({ "ui": { "visibility": visibility } })
                .as_object()
                .unwrap()
                .clone(),
        ))
    }

    #[test]
    fn coerces_schema_primitive_types() {
        let arguments = json!({ "count": "3", "enabled": "true" })
            .as_object()
            .cloned();
        let schema = json!({
            "properties": {
                "count": { "type": "integer" },
                "enabled": { "type": "boolean" }
            }
        });
        let coerced = coerce_tool_arguments(arguments, &schema).unwrap();
        assert_eq!(coerced["count"], json!(3));
        assert_eq!(coerced["enabled"], json!(true));
    }

    #[test]
    fn honors_mcp_app_visibility() {
        let app_only = tool_with_visibility(json!(["app"]));
        assert!(is_tool_visible_to_app(&app_only));
        assert!(!is_tool_visible_to_model(&app_only));

        let model_only = tool_with_visibility(json!(["model"]));
        assert!(!is_tool_visible_to_app(&model_only));
        assert!(is_tool_visible_to_model(&model_only));
    }
}
