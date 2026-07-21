use indexmap::IndexMap;

use crate::utils::sanitize_unicode_tags;

/// Instructions goose contributes to a Codex turn.
///
/// Codex assembles the system prompt itself - including `AGENTS.md` discovery -
/// so goose only carries an optional override and the keyed extras that
/// recipes and the ACP client inject.
pub struct PromptManager {
    system_prompt_override: Option<String>,
    system_prompt_extras: IndexMap<String, String>,
}

impl Default for PromptManager {
    fn default() -> Self {
        PromptManager::new()
    }
}

impl PromptManager {
    pub fn new() -> Self {
        PromptManager {
            system_prompt_override: None,
            system_prompt_extras: IndexMap::new(),
        }
    }

    /// Add an additional instruction to the system prompt with a key.
    /// Using the same key will replace the previous instruction.
    pub fn add_system_prompt_extra(&mut self, key: String, instruction: String) {
        self.system_prompt_extras.insert(key, instruction);
    }

    pub fn remove_system_prompt_extra(&mut self, key: &str) {
        self.system_prompt_extras.shift_remove(key);
    }

    pub fn set_system_prompt_override(&mut self, template: String) {
        self.system_prompt_override = Some(template);
    }

    pub fn clear_system_prompt_override(&mut self) {
        self.system_prompt_override = None;
    }

    /// Returns `(base_instructions, developer_instructions)` for a Codex turn.
    pub fn codex_instructions(&self) -> (Option<String>, Option<String>) {
        let base = self
            .system_prompt_override
            .as_deref()
            .map(sanitize_unicode_tags);
        let developer = (!self.system_prompt_extras.is_empty()).then(|| {
            self.system_prompt_extras
                .values()
                .map(|instruction| sanitize_unicode_tags(instruction))
                .collect::<Vec<_>>()
                .join("\n\n")
        });
        (base, developer)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codex_instructions_are_empty_without_contributions() {
        assert_eq!(PromptManager::new().codex_instructions(), (None, None));
    }

    #[test]
    fn codex_instructions_join_extras_in_insertion_order() {
        let mut manager = PromptManager::new();
        manager.add_system_prompt_extra("a".to_string(), "first".to_string());
        manager.add_system_prompt_extra("b".to_string(), "second".to_string());
        manager.set_system_prompt_override("base".to_string());

        assert_eq!(
            manager.codex_instructions(),
            (
                Some("base".to_string()),
                Some("first\n\nsecond".to_string())
            )
        );
    }

    #[test]
    fn removing_the_last_extra_drops_developer_instructions() {
        let mut manager = PromptManager::new();
        manager.add_system_prompt_extra("a".to_string(), "first".to_string());
        manager.remove_system_prompt_extra("a");

        assert_eq!(manager.codex_instructions(), (None, None));
    }
}
