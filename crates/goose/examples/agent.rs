use futures::StreamExt;
use goose::agents::{Agent, AgentEvent, SessionConfig};
use goose::config::GooseMode;
use goose::conversation::message::Message;
use goose::session::session_manager::SessionType;

fn main() -> anyhow::Result<()> {
    goose::codex::run(run)
}

async fn run() -> anyhow::Result<()> {
    let agent = Agent::new();

    let session = agent
        .config
        .session_manager
        .create_session(
            std::env::current_dir()?,
            "Codex agent example".to_string(),
            SessionType::Hidden,
            GooseMode::default(),
        )
        .await?;

    let session_config = SessionConfig {
        id: session.id,
        schedule_id: None,
        max_turns: None,
        retry_config: None,
    };

    let user_message = Message::user()
        .with_text("can you summarize the readme.md in this dir using just a haiku?");

    let mut stream = agent.reply(user_message, session_config, None).await?;

    while let Some(Ok(AgentEvent::Message(message))) = stream.next().await {
        println!("{}", serde_json::to_string_pretty(&message)?);
        println!("\n");
    }

    Ok(())
}
