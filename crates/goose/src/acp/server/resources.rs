use super::*;

impl GooseAcpAgent {
    pub(super) async fn on_read_resource(
        &self,
        req: ReadResourceRequest,
    ) -> Result<ReadResourceResponse, agent_client_protocol::Error> {
        let agent = self.get_session_agent(&req.session_id).await?;
        let text = agent
            .read_mcp_resource(&req.session_id, &req.extension_name, &req.uri)
            .await
            .internal_err()?;
        Ok(ReadResourceResponse {
            result: serde_json::json!({
                "contents": [{ "uri": req.uri, "text": text }]
            }),
        })
    }
}
