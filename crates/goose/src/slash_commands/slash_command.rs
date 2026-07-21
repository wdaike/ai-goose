use std::collections::HashSet;
use std::path::Path;

use super::types::{SlashCommandEntry, SlashCommandSource};
use super::util::normalize_command_name;

pub const COMPACT_TRIGGERS: &[&str] =
    &["/compact", "Please compact this conversation", "/summarize"];

pub struct CommandDef {
    pub name: &'static str,
    pub description: &'static str,
}

static COMMANDS: &[CommandDef] = &[
    CommandDef {
        name: "prompts",
        description: "List available prompts, optionally filtered by extension",
    },
    CommandDef {
        name: "prompt",
        description: "Execute a prompt or show its info with --info",
    },
    CommandDef {
        name: "compact",
        description: "Compact the conversation history",
    },
    CommandDef {
        name: "clear",
        description: "Clear the conversation history",
    },
    CommandDef {
        name: "skills",
        description: "List installed skills and other available sources",
    },
];

pub struct ParsedSlashCommand<'a> {
    pub command: &'a str,
    pub params_str: &'a str,
}

pub fn parse_slash_command(message_text: &str) -> Option<ParsedSlashCommand<'_>> {
    let mut trimmed = message_text.trim();
    if COMPACT_TRIGGERS.contains(&trimmed) {
        trimmed = COMPACT_TRIGGERS[0];
    }
    if !trimmed.starts_with('/') {
        return None;
    }

    let command_str = trimmed.strip_prefix('/').unwrap_or(trimmed);
    let (command, params_str) = command_str
        .split_once(' ')
        .map(|(command, params)| (command, params.trim()))
        .unwrap_or((command_str, ""));
    Some(ParsedSlashCommand {
        command,
        params_str,
    })
}

pub fn list_commands() -> &'static [CommandDef] {
    COMMANDS
}

pub fn list_builtin_commands() -> Vec<SlashCommandEntry> {
    list_commands()
        .iter()
        .map(|command| SlashCommandEntry {
            name: command.name.to_string(),
            description: command.description.to_string(),
            source: SlashCommandSource::Builtin,
            source_path: None,
            input_hint: None,
        })
        .collect()
}

pub fn list_acp_commands(working_dir: Option<&Path>) -> Vec<SlashCommandEntry> {
    merge_command_sources(
        list_builtin_commands(),
        super::skill_slash_command::list_commands(working_dir),
    )
}

pub(super) fn merge_command_sources(
    builtins: Vec<SlashCommandEntry>,
    skills: Vec<SlashCommandEntry>,
) -> Vec<SlashCommandEntry> {
    let mut commands = builtins;
    let reserved_names: HashSet<String> = commands
        .iter()
        .map(|command| normalize_command_name(&command.name))
        .collect();

    commands.extend(
        skills
            .into_iter()
            .filter(|command| !reserved_names.contains(&normalize_command_name(&command.name))),
    );
    commands
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_acp_safe_builtin_commands() {
        let commands = list_builtin_commands();
        let names: Vec<_> = commands
            .iter()
            .map(|command| command.name.as_str())
            .collect();

        assert_eq!(
            names,
            vec!["prompts", "prompt", "compact", "clear", "skills"]
        );
        assert!(commands
            .iter()
            .all(|command| command.source == SlashCommandSource::Builtin));
    }

    #[test]
    fn parse_command_and_params() {
        let parsed = parse_slash_command("/speckit.plan hello world").unwrap();
        assert_eq!(parsed.command, "speckit.plan");
        assert_eq!(parsed.params_str, "hello world");
    }

    fn entry(name: &str, source: SlashCommandSource) -> SlashCommandEntry {
        SlashCommandEntry {
            name: name.to_string(),
            description: format!("{name} description"),
            source,
            source_path: None,
            input_hint: None,
        }
    }

    #[test]
    fn merge_builtin_wins_over_skill() {
        let merged = merge_command_sources(
            vec![entry("compact", SlashCommandSource::Builtin)],
            vec![entry("compact", SlashCommandSource::Skill)],
        );

        let compact: Vec<_> = merged.iter().filter(|c| c.name == "compact").collect();
        assert_eq!(compact.len(), 1);
        assert_eq!(compact[0].source, SlashCommandSource::Builtin);
    }

    #[test]
    fn merge_dedupes_by_normalized_name() {
        let merged = merge_command_sources(
            vec![entry("Compact", SlashCommandSource::Builtin)],
            vec![entry("COMPACT", SlashCommandSource::Skill)],
        );

        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].source, SlashCommandSource::Builtin);
    }
}
