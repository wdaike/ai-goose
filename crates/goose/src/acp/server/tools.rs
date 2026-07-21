use super::*;
use crate::agents::extension::get_parameter_names;
use crate::agents::reply_parts::is_tool_visible_to_app;
use crate::config::permission::PermissionLevel;
use goose_sdk_types::custom_requests::{ToolListItem, ToolPermissionLevel};

impl GooseAcpAgent {
    pub(super) async fn on_get_tools(
        &self,
        req: GetToolsRequest,
    ) -> Result<GetToolsResponse, agent_client_protocol::Error> {
        let session_id = &req.session_id;
        let agent = self.get_session_agent(&req.session_id).await?;
        let goose_mode = agent.goose_mode().await;
        let permission_manager = self.permission_manager();

        let mut tools: Vec<ToolListItem> = agent
            .list_tools(session_id, req.extension_name)
            .await
            .into_iter()
            .map(|tool| {
                let permission = permission_manager
                    .get_user_permission(&tool.name)
                    .or_else(|| {
                        if goose_mode == GooseMode::SmartApprove {
                            permission_manager.get_smart_approve_permission(&tool.name)
                        } else if goose_mode == GooseMode::Approve {
                            Some(PermissionLevel::AskBefore)
                        } else {
                            None
                        }
                    })
                    .map(|p| match p {
                        PermissionLevel::AlwaysAllow => ToolPermissionLevel::AlwaysAllow,
                        PermissionLevel::AskBefore => ToolPermissionLevel::AskBefore,
                        PermissionLevel::NeverAllow => ToolPermissionLevel::NeverAllow,
                    });
                ToolListItem {
                    name: tool.name.to_string(),
                    description: tool
                        .description
                        .as_ref()
                        .map(|d| d.as_ref().to_string())
                        .unwrap_or_default(),
                    parameters: get_parameter_names(&tool),
                    permission,
                    input_schema: serde_json::Value::Object(tool.input_schema.as_ref().clone()),
                    output_schema: tool
                        .output_schema
                        .as_ref()
                        .map(|s| serde_json::to_value(s).unwrap_or(serde_json::Value::Null)),
                }
            })
            .collect();
        tools.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(GetToolsResponse { tools })
    }

    pub(super) async fn on_call_tool(
        &self,
        req: GooseToolCallRequest,
    ) -> Result<GooseToolCallResponse, agent_client_protocol::Error> {
        let session_id = &req.session_id;
        let agent = self.get_session_agent(&req.session_id).await?;
        let tools = agent.list_tools(session_id, None).await;

        let Some(tool) = tools.iter().find(|t| *t.name == req.name) else {
            return Err(agent_client_protocol::Error::invalid_params().data("tool not found"));
        };

        if !is_tool_visible_to_app(tool) {
            return Err(agent_client_protocol::Error::invalid_params()
                .data("tool is not visible to app clients"));
        }

        let arguments = match req.arguments {
            serde_json::Value::Object(_) => req.arguments,
            serde_json::Value::Null => serde_json::Value::Object(Default::default()),
            _ => {
                return Err(agent_client_protocol::Error::invalid_params()
                    .data("tool arguments must be an object"));
            }
        };

        let result = agent
            .call_tool(session_id, &req.name, arguments)
            .await
            .map_err(|e| agent_client_protocol::Error::internal_error().data(e.to_string()))?;

        Ok(GooseToolCallResponse {
            content: result.content,
            structured_content: result.structured_content,
            is_error: result.is_error.unwrap_or(false),
            meta: result.meta,
        })
    }

    pub(super) async fn on_set_tool_permissions(
        &self,
        req: SetToolPermissionsRequest,
    ) -> Result<SetToolPermissionsResponse, agent_client_protocol::Error> {
        let permission_manager = self.permission_manager();
        for entry in &req.tool_permissions {
            let level = match entry.permission {
                ToolPermissionLevel::AlwaysAllow => PermissionLevel::AlwaysAllow,
                ToolPermissionLevel::AskBefore => PermissionLevel::AskBefore,
                ToolPermissionLevel::NeverAllow => PermissionLevel::NeverAllow,
            };
            permission_manager.update_user_permission(&entry.tool_name, level);
        }
        Ok(SetToolPermissionsResponse {})
    }
}
