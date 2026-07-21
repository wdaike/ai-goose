use crate::agents::extension::PlatformExtensionContext;
use crate::agents::mcp_client::{Error, McpClientTrait};
use crate::agents::tool_execution::ToolCallContext;
use crate::config::paths::Paths;
use crate::goose_apps::GooseApp;
use async_trait::async_trait;
use rmcp::model::{
    CallToolResult, Content, Implementation, InitializeResult, JsonObject, ListResourcesResult,
    ListToolsResult, Meta, RawResource, ReadResourceResult, Resource, ResourceContents,
    ServerCapabilities, Tool as McpTool,
};
use schemars::{schema_for, JsonSchema};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use tokio_util::sync::CancellationToken;

pub static EXTENSION_NAME: &str = "apps";

/// Parameters for delete_app tool
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
struct DeleteAppParams {
    /// Name of the app to delete
    name: String,
}

/// Parameters for list_apps tool
#[derive(Debug, Serialize, Deserialize, JsonSchema)]
struct ListAppsParams {
    // No parameters needed - lists all apps
}

pub struct AppsManagerClient {
    info: InitializeResult,
    context: PlatformExtensionContext,
    apps_dir: PathBuf,
}

impl AppsManagerClient {
    pub fn new(context: PlatformExtensionContext) -> Result<Self, String> {
        let apps_dir = Paths::in_data_dir(EXTENSION_NAME);

        fs::create_dir_all(&apps_dir)
            .map_err(|e| format!("Failed to create apps directory: {}", e))?;

        let client = Self {
            info: Self::create_info(),
            context,
            apps_dir,
        };

        client.ensure_default_apps()?;

        Ok(client)
    }

    fn create_info() -> InitializeResult {
        InitializeResult::new(
            ServerCapabilities::builder()
                .enable_tools()
                .enable_resources()
                .build(),
        )
        .with_server_info(Implementation::new(EXTENSION_NAME, "1.0.0").with_title("Apps Manager"))
        .with_instructions(
            "Use this extension to create, manage, and iterate on custom HTML/CSS/JavaScript apps.",
        )
    }

    fn ensure_default_apps(&self) -> Result<(), String> {
        // TODO(Douwe): we have the same check in cache, consider unifying that
        const CLOCK_HTML: &str = include_str!("../../goose_apps/clock.html");

        // Check if clock app exists
        let clock_path = self.apps_dir.join("clock.html");
        if !clock_path.exists() {
            // Parse and save the default clock app
            let clock_app = GooseApp::from_html(CLOCK_HTML)?;
            self.save_app(&clock_app)?;
        }

        Ok(())
    }

    fn list_stored_apps(&self) -> Result<Vec<String>, String> {
        let mut apps = Vec::new();

        let entries = fs::read_dir(&self.apps_dir)
            .map_err(|e| format!("Failed to read apps directory: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();

            if path.extension().and_then(|s| s.to_str()) == Some("html") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    apps.push(stem.to_string());
                }
            }
        }

        apps.sort();
        Ok(apps)
    }

    fn load_app(&self, name: &str) -> Result<GooseApp, String> {
        let path = self.apps_dir.join(format!("{}.html", name));

        let html =
            fs::read_to_string(&path).map_err(|e| format!("Failed to read app file: {}", e))?;

        GooseApp::from_html(&html)
    }

    fn save_app(&self, app: &GooseApp) -> Result<(), String> {
        let path = self.apps_dir.join(format!("{}.html", app.resource.name));

        let html_content = app.to_html()?;

        fs::write(&path, html_content).map_err(|e| format!("Failed to write app file: {}", e))?;

        Ok(())
    }

    fn delete_app(&self, name: &str) -> Result<(), String> {
        let path = self.apps_dir.join(format!("{}.html", name));

        fs::remove_file(&path).map_err(|e| format!("Failed to delete app file: {}", e))?;

        Ok(())
    }

    fn with_platform_notification(
        &self,
        result: CallToolResult,
        event_type: &str,
        app_name: &str,
    ) -> CallToolResult {
        let mut params = serde_json::Map::new();
        params.insert("app_name".to_string(), json!(app_name));
        self.context
            .result_with_platform_notification(result, EXTENSION_NAME, event_type, params)
    }

    async fn handle_list_apps(
        &self,
        _arguments: Option<JsonObject>,
    ) -> Result<CallToolResult, String> {
        let app_names = self.list_stored_apps()?;

        if app_names.is_empty() {
            return Ok(CallToolResult::success(vec![Content::text(
                "No apps found. Create your first app with the create_app tool!".to_string(),
            )]));
        }

        let mut apps_info = vec![format!("Found {} app(s):\n", app_names.len())];

        for name in app_names {
            match self.load_app(&name) {
                Ok(app) => {
                    let description = app
                        .resource
                        .description
                        .as_deref()
                        .unwrap_or("No description");

                    let size = if let Some(ref props) = app.window_props {
                        format!(" ({}x{})", props.width, props.height)
                    } else {
                        String::new()
                    };

                    apps_info.push(format!("- {}{}: {}", name, size, description));
                }
                Err(e) => {
                    apps_info.push(format!("- {}: (error loading: {})", name, e));
                }
            }
        }

        Ok(CallToolResult::success(vec![Content::text(
            apps_info.join("\n"),
        )]))
    }

    async fn handle_delete_app(
        &self,
        arguments: Option<JsonObject>,
    ) -> Result<CallToolResult, String> {
        let args = arguments.ok_or("Missing arguments")?;

        let name = extract_string(&args, "name")?;

        self.delete_app(&name)?;

        let result =
            CallToolResult::success(vec![Content::text(format!("Deleted app '{}'", name))]);

        Ok(self.with_platform_notification(result, "app_deleted", &name))
    }
}

#[async_trait]
impl McpClientTrait for AppsManagerClient {
    async fn list_tools(
        &self,
        _session_id: &str,
        _next_cursor: Option<String>,
        _cancel_token: CancellationToken,
    ) -> Result<ListToolsResult, Error> {
        let tools = vec![
            McpTool::new(
                "list_apps".to_string(),
                "List all available Goose apps with their names and descriptions. Use this to see what apps exist before creating or modifying apps.".to_string(),
                schema::<ListAppsParams>(),
            ),
            McpTool::new(
                "delete_app".to_string(),
                "Delete an app permanently".to_string(),
                schema::<DeleteAppParams>(),
            ),
        ];

        Ok(ListToolsResult {
            tools,
            next_cursor: None,
            meta: None,
        })
    }

    async fn call_tool(
        &self,
        _ctx: &ToolCallContext,
        name: &str,
        arguments: Option<JsonObject>,
        _cancel_token: CancellationToken,
    ) -> Result<CallToolResult, Error> {
        let result = match name {
            "list_apps" => self.handle_list_apps(arguments).await,
            "delete_app" => self.handle_delete_app(arguments).await,
            _ => Err(format!("Unknown tool: {}", name)),
        };

        match result {
            Ok(result) => Ok(result),
            Err(error) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Error: {}",
                error
            ))])),
        }
    }

    async fn list_resources(
        &self,
        _session_id: &str,
        _next_cursor: Option<String>,
        _cancel_token: CancellationToken,
    ) -> Result<ListResourcesResult, Error> {
        let app_names = self
            .list_stored_apps()
            .map_err(|_| Error::TransportClosed)?;

        let mut resources = Vec::new();

        for name in app_names {
            if let Ok(app) = self.load_app(&name) {
                let meta = if let Some(ref window_props) = app.window_props {
                    let mut meta_obj = Meta::new();
                    meta_obj.insert(
                        "window".to_string(),
                        json!({
                            "width": window_props.width,
                            "height": window_props.height,
                            "resizable": window_props.resizable,
                        }),
                    );
                    Some(meta_obj)
                } else {
                    None
                };

                let raw_resource = RawResource {
                    uri: app.resource.uri.clone(),
                    name: app.resource.name.clone(),
                    title: None,
                    description: app.resource.description.clone(),
                    mime_type: Some(app.resource.mime_type.clone()),
                    size: None,
                    icons: None,
                    meta,
                };
                resources.push(Resource {
                    raw: raw_resource,
                    annotations: None,
                });
            }
        }

        Ok(ListResourcesResult {
            resources,
            next_cursor: None,
            meta: None,
        })
    }

    async fn read_resource(
        &self,
        _session_id: &str,
        uri: &str,
        _cancel_token: CancellationToken,
    ) -> Result<ReadResourceResult, Error> {
        let app_name = uri
            .strip_prefix("ui://apps/")
            .ok_or(Error::TransportClosed)?;

        let app = self
            .load_app(app_name)
            .map_err(|_| Error::TransportClosed)?;

        let html = app
            .resource
            .text
            .unwrap_or_else(|| String::from("No content"));

        Ok(ReadResourceResult::new(vec![ResourceContents::text(
            html, uri,
        )]))
    }

    fn get_info(&self) -> Option<&InitializeResult> {
        Some(&self.info)
    }
}

fn schema<T: JsonSchema>() -> JsonObject {
    let mut obj = serde_json::to_value(schema_for!(T))
        .map(|v| v.as_object().unwrap().clone())
        .expect("valid schema");
    // Ensure properties key exists (required by OpenAI-compatible APIs)
    obj.entry("properties")
        .or_insert_with(|| serde_json::json!({}));
    obj
}

fn extract_string(args: &JsonObject, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Missing or invalid '{}'", key))
}
