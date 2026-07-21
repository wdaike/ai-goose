//! Goose-custom **agent → client** requests: server-initiated JSON-RPC requests
//! that expect a response from the client (unlike notifications, which are
//! fire-and-forget).
//!
//! goose currently sends none. The hook stays so the ACP schema generator has a
//! single place to collect them from when one is added.

use schemars::SchemaGenerator;

use crate::acp::custom_requests::CustomMethodSchema;

pub fn agent_request_schemas(_generator: &mut SchemaGenerator) -> Vec<CustomMethodSchema> {
    Vec::new()
}
