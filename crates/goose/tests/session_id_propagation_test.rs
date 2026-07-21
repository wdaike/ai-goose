#[tokio::test]
#[cfg(feature = "otel")]
async fn test_session_id_propagates_to_log_records() {
    use opentelemetry::logs::AnyValue;
    use opentelemetry::Key;
    use opentelemetry_appender_tracing::layer::{
        OpenTelemetryTracingBridge, TracingSpanAttributes,
    };
    use opentelemetry_sdk::logs::{InMemoryLogExporterBuilder, SdkLoggerProvider};
    use tracing_subscriber::prelude::*;

    let exporter = InMemoryLogExporterBuilder::default().build();
    let provider = SdkLoggerProvider::builder()
        .with_simple_exporter(exporter.clone())
        .build();

    let layer = OpenTelemetryTracingBridge::builder(&provider)
        .with_tracing_span_attributes(TracingSpanAttributes::allowlist(["session.id"]))
        .build();
    let subscriber = tracing_subscriber::registry().with(layer);
    let _guard = tracing::subscriber::set_default(subscriber);

    let span = tracing::info_span!("test", session.id = "test-session-42");
    let _enter = span.enter();
    tracing::info!("hello from test");
    drop(_enter);
    drop(_guard);

    provider.force_flush().unwrap();
    let logs = exporter.get_emitted_logs().unwrap();
    assert_eq!(logs.len(), 1);
    let log = &logs[0];

    let has_session_id = log.record.attributes_iter().any(|(k, v)| {
        k == &Key::new("session.id")
            && matches!(v, AnyValue::String(s) if s.as_str() == "test-session-42")
    });
    assert!(has_session_id);
}
