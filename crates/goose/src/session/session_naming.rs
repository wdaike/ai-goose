use std::sync::LazyLock;

use goose_providers::conversation::Conversation;
use regex::Regex;

use crate::utils::safe_truncate;

pub static MSG_COUNT_FOR_SESSION_NAME_GENERATION: usize = 3;

const SESSION_NAME_WORD_COUNT: usize = 4;
const SESSION_NAME_MAX_LEN: usize = 100;

fn strip_xml_tags(text: &str) -> String {
    static BLOCK_RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?s)<([a-zA-Z][a-zA-Z0-9_]*)[^>]*>.*?</[a-zA-Z][a-zA-Z0-9_]*>").unwrap()
    });
    static TAG_RE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"</?[a-zA-Z][a-zA-Z0-9_]*[^>]*>").unwrap());
    let pass1 = BLOCK_RE.replace_all(text, "");
    TAG_RE.replace_all(&pass1, "").into_owned()
}

/// Derive a short session title from the opening user message. Codex owns
/// inference, so this stays a local text transform rather than a model call.
pub(crate) fn generate_session_name(messages: &Conversation) -> String {
    let text = messages
        .iter()
        .filter(|m| m.role == rmcp::model::Role::User)
        .flat_map(|m| m.content.iter())
        .filter_map(|c| c.filter_for_audience(rmcp::model::Role::User))
        .filter_map(|c| c.as_text().map(|s| s.to_string()))
        .next()
        .unwrap_or_default();

    let title = strip_xml_tags(&text)
        .split_whitespace()
        .take(SESSION_NAME_WORD_COUNT)
        .collect::<Vec<_>>()
        .join(" ");

    if title.is_empty() {
        "New session".to_string()
    } else {
        safe_truncate(&title, SESSION_NAME_MAX_LEN)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use goose_providers::conversation::message::Message;

    #[test]
    fn test_strip_xml_tags() {
        assert_eq!(strip_xml_tags("<think>reasoning</think>answer"), "answer");
        assert_eq!(strip_xml_tags("before<t>mid</t>after"), "beforeafter");
        assert_eq!(strip_xml_tags("no tags here"), "no tags here");
        assert_eq!(strip_xml_tags("a < b > c"), "a < b > c");
        assert_eq!(strip_xml_tags("<think>日本語</think>hello"), "hello");
        assert_eq!(strip_xml_tags(""), "");
        assert_eq!(strip_xml_tags("<br/>self closing"), "self closing");
    }

    #[test]
    fn test_generate_session_name() {
        let conversation =
            Conversation::new_unvalidated(vec![Message::user().with_text("list the files here")]);
        assert_eq!(generate_session_name(&conversation), "list the files here");
    }

    #[test]
    fn test_generate_session_name_empty() {
        let conversation = Conversation::new_unvalidated(vec![]);
        assert_eq!(generate_session_name(&conversation), "New session");
    }
}
