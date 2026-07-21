use rmcp::model::Tool;
use serde_json::Value;

pub fn is_tool_visible_to_app(tool: &Tool) -> bool {
    visibility(tool).is_none_or(|visibility| visibility.contains(&"app"))
}

pub fn is_tool_visible_to_model(tool: &Tool) -> bool {
    visibility(tool).is_none_or(|visibility| visibility.contains(&"model"))
}

fn visibility(tool: &Tool) -> Option<Vec<&str>> {
    let visibility = tool.meta.as_ref()?.0.get("ui")?.get("visibility")?;
    let values = visibility.as_array()?;
    Some(values.iter().filter_map(Value::as_str).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rmcp::object;
    use serde_json::json;

    fn tool_with_visibility(visibility: Value) -> Tool {
        Tool::new("test", "test", object!({ "type": "object" })).with_meta(rmcp::model::Meta(
            json!({ "ui": { "visibility": visibility } })
                .as_object()
                .unwrap()
                .clone(),
        ))
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
