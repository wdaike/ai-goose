use crate::conversation::message::{ActionRequiredData, Message, MessageContent};
use rmcp::model::Role;

pub fn format_message_for_transcript(message: &Message) -> String {
    let content_parts: Vec<String> = message
        .content
        .iter()
        .filter_map(|content| match content {
            MessageContent::Text(text) => Some(text.text.clone()),
            MessageContent::Image(image) => Some(format!("[image: {}]", image.mime_type)),
            MessageContent::ToolRequest(request) => match &request.tool_call {
                Ok(call) => Some(format!(
                    "tool_request({}): {}",
                    call.name,
                    serde_json::to_string(&call.arguments)
                        .unwrap_or_else(|_| "<<invalid json>>".to_string())
                )),
                Err(_) => Some("tool_request: [error]".to_string()),
            },
            MessageContent::ToolResponse(response) => match &response.tool_result {
                Ok(result) => {
                    let text_items: Vec<String> = result
                        .content
                        .iter()
                        .filter_map(|content| content.as_text().map(|text| text.text.clone()))
                        .collect();
                    Some(if text_items.is_empty() {
                        "tool_response: [non-text content]".to_string()
                    } else {
                        format!("tool_response: {}", text_items.join("\n"))
                    })
                }
                Err(_) => Some("tool_response: [error]".to_string()),
            },
            MessageContent::ToolConfirmationRequest(request) => {
                Some(format!("tool_confirmation_request: {}", request.tool_name))
            }
            MessageContent::ActionRequired(action) => match &action.data {
                ActionRequiredData::ToolConfirmation { tool_name, .. } => {
                    Some(format!("action_required(tool_confirmation): {tool_name}"))
                }
                ActionRequiredData::Elicitation { message, .. } => {
                    Some(format!("action_required(elicitation): {message}"))
                }
                ActionRequiredData::ElicitationResponse { id, .. } => {
                    Some(format!("action_required(elicitation_response): {id}"))
                }
            },
            MessageContent::FrontendToolRequest(request) => match &request.tool_call {
                Ok(call) => Some(format!("frontend_tool_request: {}", call.name)),
                Err(_) => Some("frontend_tool_request: [error]".to_string()),
            },
            MessageContent::Thinking(_) | MessageContent::RedactedThinking(_) => None,
            MessageContent::SystemNotification(notification) => {
                Some(format!("system_notification: {}", notification.msg))
            }
        })
        .collect();

    let role = match message.role {
        Role::User => "user",
        Role::Assistant => "assistant",
    };
    if content_parts.is_empty() {
        format!("[{role}]: <empty message>")
    } else {
        format!("[{role}]: {}", content_parts.join("\n"))
    }
}
