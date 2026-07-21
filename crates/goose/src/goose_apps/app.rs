use rmcp::model::ErrorData;
use serde::{Deserialize, Serialize};
use tracing::warn;
use utoipa::ToSchema;

use super::resource::McpAppResource;

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct WindowProps {
    pub width: u32,
    pub height: u32,
    pub resizable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GooseApp {
    #[serde(flatten)]
    pub resource: McpAppResource,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub mcp_servers: Vec<String>,
    #[serde(flatten, skip_serializing_if = "Option::is_none")]
    pub window_props: Option<WindowProps>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prd: Option<String>,
    /// Whether this app can be deleted by the user (i.e. not a bundled default).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub deletable: bool,
}

impl GooseApp {
    const METADATA_SCRIPT_TYPE: &'static str = "application/ld+json";
    const PRD_SCRIPT_TYPE: &'static str = "application/x-goose-prd";
    const GOOSE_APP_TYPE: &'static str = "GooseApp";
    const GOOSE_SCHEMA_CONTEXT: &'static str = "urn:goose.ai:schema";

    pub fn from_html(html: &str) -> Result<Self, String> {
        use regex::Regex;

        let metadata_re = Regex::new(&format!(
            r#"(?s)<script type="{}"[^>]*>\s*(.*?)\s*</script>"#,
            regex::escape(Self::METADATA_SCRIPT_TYPE)
        ))
        .map_err(|e| format!("Regex error: {}", e))?;

        let prd_re = Regex::new(&format!(
            r#"(?s)<script type="{}"[^>]*>\s*(.*?)\s*</script>"#,
            regex::escape(Self::PRD_SCRIPT_TYPE)
        ))
        .map_err(|e| format!("Regex error: {}", e))?;

        let json_str = metadata_re
            .captures(html)
            .and_then(|cap| cap.get(1))
            .ok_or_else(|| "No GooseApp JSON-LD metadata found in HTML".to_string())?
            .as_str();

        let metadata: serde_json::Value = serde_json::from_str(json_str)
            .map_err(|e| format!("Failed to parse metadata JSON: {}", e))?;

        let name = metadata
            .get("name")
            .and_then(|v| v.as_str())
            .ok_or("Missing 'name' in metadata")?
            .to_string();

        let description = metadata
            .get("description")
            .and_then(|v| v.as_str())
            .map(String::from);

        let width = metadata
            .get("width")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32);
        let height = metadata
            .get("height")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32);
        let resizable = metadata.get("resizable").and_then(|v| v.as_bool());

        let window_props = if width.is_some() || height.is_some() || resizable.is_some() {
            Some(WindowProps {
                width: width.unwrap_or(800),
                height: height.unwrap_or(600),
                resizable: resizable.unwrap_or(true),
            })
        } else {
            None
        };

        let mcp_servers = metadata
            .get("mcpServers")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();

        let prd = prd_re
            .captures(html)
            .and_then(|cap| cap.get(1))
            .map(|m| m.as_str().trim().to_string());

        let clean_html = metadata_re.replace(html, "");
        let clean_html = prd_re.replace(&clean_html, "").to_string();

        Ok(GooseApp {
            resource: McpAppResource {
                uri: format!("ui://apps/{}", name),
                name,
                description,
                mime_type: "text/html;profile=mcp-app".to_string(),
                text: Some(clean_html),
                blob: None,
                meta: None,
            },
            mcp_servers,
            window_props,
            prd,
            deletable: false,
        })
    }

    pub fn to_html(&self) -> Result<String, String> {
        let html = self
            .resource
            .text
            .as_ref()
            .ok_or("App has no HTML content")?;

        let mut metadata = serde_json::json!({
            "@context": Self::GOOSE_SCHEMA_CONTEXT,
            "@type": Self::GOOSE_APP_TYPE,
            "name": self.resource.name,
        });

        if let Some(ref desc) = self.resource.description {
            metadata["description"] = serde_json::json!(desc);
        }

        if let Some(ref props) = self.window_props {
            metadata["width"] = serde_json::json!(props.width);
            metadata["height"] = serde_json::json!(props.height);
            metadata["resizable"] = serde_json::json!(props.resizable);
        }

        if !self.mcp_servers.is_empty() {
            metadata["mcpServers"] = serde_json::json!(self.mcp_servers);
        }

        let metadata_json = serde_json::to_string_pretty(&metadata)
            .map_err(|e| format!("Failed to serialize metadata: {}", e))?;

        let metadata_script = format!(
            "  <script type=\"{}\">\n{}\n  </script>",
            Self::METADATA_SCRIPT_TYPE,
            metadata_json
        );

        let prd_script = if let Some(ref prd) = self.prd {
            if !prd.is_empty() {
                format!(
                    "  <script type=\"{}\">\n{}\n  </script>",
                    Self::PRD_SCRIPT_TYPE,
                    prd
                )
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        let scripts = if prd_script.is_empty() {
            format!("{}\n", metadata_script)
        } else {
            format!("{}\n{}\n", metadata_script, prd_script)
        };

        let result = if let Some(head_pos) = html.find("</head>") {
            let mut result = html.clone();
            result.insert_str(head_pos, &scripts);
            result
        } else if let Some(html_pos) = html.find("<html") {
            let after_html = html
                .get(html_pos..)
                .and_then(|s| s.find('>'))
                .map(|p| html_pos + p + 1);
            if let Some(pos) = after_html {
                let mut result = html.clone();
                result.insert_str(pos, &format!("\n<head>\n{}</head>", scripts));
                result
            } else {
                format!("<head>\n{}</head>\n{}", scripts, html)
            }
        } else {
            format!(
                "<html>\n<head>\n{}</head>\n<body>\n{}\n</body>\n</html>",
                scripts, html
            )
        };

        Ok(result)
    }
}

/// Discover MCP apps: `ui://` resources whose MIME type marks them as an app.
/// Codex owns every MCP connection, so the inventory and the resource bodies
/// both come from it.
pub async fn fetch_mcp_apps(
    agent: &crate::agents::Agent,
    session_id: &str,
) -> Result<Vec<GooseApp>, ErrorData> {
    const MCP_APP_MIME_TYPE: &str = "text/html;profile=mcp-app";

    let servers = agent
        .list_mcp_servers(session_id)
        .await
        .map_err(|error| ErrorData::internal_error(error.to_string(), None))?;

    let mut apps = Vec::new();
    for (server_name, resource) in servers.into_iter().flat_map(|server| {
        let name = server.name.clone();
        server
            .resources
            .into_iter()
            .map(move |resource| (name.clone(), resource))
    }) {
        if resource.mime_type.as_deref() != Some(MCP_APP_MIME_TYPE) {
            continue;
        }

        let html = match agent
            .read_mcp_resource(session_id, &server_name, &resource.uri)
            .await
        {
            Ok(contents) => contents,
            Err(error) => {
                warn!(
                    "Failed to read resource {} from {}: {}",
                    resource.uri, server_name, error
                );
                continue;
            }
        };
        if html.is_empty() {
            continue;
        }

        apps.push(GooseApp {
            resource: McpAppResource {
                uri: resource.uri.clone(),
                name: resource.name.clone(),
                description: resource.description.clone(),
                mime_type: MCP_APP_MIME_TYPE.to_string(),
                text: Some(html),
                blob: None,
                meta: None,
            },
            mcp_servers: vec![server_name],
            window_props: Some(window_props_from_meta(resource.meta.as_ref())),
            prd: None,
            deletable: false,
        });
    }

    Ok(apps)
}

fn window_props_from_meta(meta: Option<&serde_json::Value>) -> WindowProps {
    const DEFAULT: WindowProps = WindowProps {
        width: 800,
        height: 600,
        resizable: true,
    };

    let Some(window) = meta
        .and_then(|meta| meta.get("window"))
        .and_then(|window| window.as_object())
    else {
        return DEFAULT;
    };

    WindowProps {
        width: window
            .get("width")
            .and_then(|v| v.as_u64())
            .map_or(DEFAULT.width, |v| v as u32),
        height: window
            .get("height")
            .and_then(|v| v.as_u64())
            .map_or(DEFAULT.height, |v| v as u32),
        resizable: window
            .get("resizable")
            .and_then(|v| v.as_bool())
            .unwrap_or(DEFAULT.resizable),
    }
}
