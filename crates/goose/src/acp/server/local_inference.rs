use super::*;

fn local_inference_unavailable() -> agent_client_protocol::Error {
    agent_client_protocol::Error::invalid_params().data("Local inference not enabled")
}

impl GooseAcpAgent {
    pub(super) async fn on_local_inference_models_list(
        &self,
        _req: LocalInferenceModelsListRequest,
    ) -> Result<LocalInferenceModelsListResponse, agent_client_protocol::Error> {
        Err(local_inference_unavailable())
    }

    pub(super) async fn on_local_inference_model_download(
        &self,
        _req: LocalInferenceModelDownloadRequest,
    ) -> Result<LocalInferenceModelDownloadResponse, agent_client_protocol::Error> {
        Err(local_inference_unavailable())
    }

    pub(super) async fn on_local_inference_model_download_progress(
        &self,
        _req: LocalInferenceModelDownloadProgressRequest,
    ) -> Result<LocalInferenceModelDownloadProgressResponse, agent_client_protocol::Error> {
        Err(local_inference_unavailable())
    }

    pub(super) async fn on_local_inference_model_download_cancel(
        &self,
        _req: LocalInferenceModelDownloadCancelRequest,
    ) -> Result<EmptyResponse, agent_client_protocol::Error> {
        Err(local_inference_unavailable())
    }

    pub(super) async fn on_local_inference_model_delete(
        &self,
        _req: LocalInferenceModelDeleteRequest,
    ) -> Result<EmptyResponse, agent_client_protocol::Error> {
        Err(local_inference_unavailable())
    }

    pub(super) async fn on_local_inference_model_evict(
        &self,
        _req: LocalInferenceModelEvictRequest,
    ) -> Result<EmptyResponse, agent_client_protocol::Error> {
        Err(local_inference_unavailable())
    }

    pub(super) async fn on_local_inference_model_settings_read(
        &self,
        _req: LocalInferenceModelSettingsReadRequest,
    ) -> Result<LocalInferenceModelSettingsReadResponse, agent_client_protocol::Error> {
        Err(local_inference_unavailable())
    }

    pub(super) async fn on_local_inference_model_settings_update(
        &self,
        _req: LocalInferenceModelSettingsUpdateRequest,
    ) -> Result<LocalInferenceModelSettingsUpdateResponse, agent_client_protocol::Error> {
        Err(local_inference_unavailable())
    }

    pub(super) async fn on_local_inference_huggingface_search(
        &self,
        _req: LocalInferenceHuggingFaceSearchRequest,
    ) -> Result<LocalInferenceHuggingFaceSearchResponse, agent_client_protocol::Error> {
        Err(local_inference_unavailable())
    }

    pub(super) async fn on_local_inference_huggingface_repo_variants(
        &self,
        _req: LocalInferenceHuggingFaceRepoVariantsRequest,
    ) -> Result<LocalInferenceHuggingFaceRepoVariantsResponse, agent_client_protocol::Error> {
        Err(local_inference_unavailable())
    }

    pub(super) async fn on_local_inference_builtin_chat_templates_list(
        &self,
        _req: LocalInferenceBuiltinChatTemplatesListRequest,
    ) -> Result<LocalInferenceBuiltinChatTemplatesListResponse, agent_client_protocol::Error> {
        Err(local_inference_unavailable())
    }
}
