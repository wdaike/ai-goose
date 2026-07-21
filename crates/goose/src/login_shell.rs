//! Recovering the user's real shell environment.
//!
//! When goose is launched from a desktop app it inherits a minimal PATH, and
//! under Flatpak it needs `flatpak-spawn --host` to reach the host system at
//! all. Hooks are the remaining caller.

#[cfg(not(windows))]
use std::process::Stdio;
#[cfg(not(windows))]
use std::time::Duration;

/// Check if the current process is running inside a Flatpak sandbox.
///
/// When inside Flatpak, shell commands must be wrapped with `flatpak-spawn --host`
/// to execute on the host system rather than inside the sandbox.
#[cfg(not(windows))]
pub fn is_flatpak() -> bool {
    std::path::Path::new("/.flatpak-info").exists()
}

#[cfg(not(windows))]
const FLATPAK_HOST_ARGS: [&str; 2] = ["--host", "--watch-bus"];

#[cfg(not(windows))]
pub fn flatpak_spawn_command() -> tokio::process::Command {
    let mut command = tokio::process::Command::new("flatpak-spawn");
    command.args(FLATPAK_HOST_ARGS);
    command
}

#[cfg(not(windows))]
fn flatpak_spawn_process() -> std::process::Command {
    let mut command = std::process::Command::new("flatpak-spawn");
    command.args(FLATPAK_HOST_ARGS);
    command
}

#[cfg(not(windows))]
enum UnixShellFlavor {
    Posix,
    Nushell,
}

#[cfg(not(windows))]
fn unix_shell_flavor(shell: &str) -> UnixShellFlavor {
    let name = std::path::Path::new(shell)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or(shell)
        .to_ascii_lowercase();

    match name.as_str() {
        "nu" | "nushell" => UnixShellFlavor::Nushell,
        _ => UnixShellFlavor::Posix,
    }
}

#[cfg(not(windows))]
fn unix_login_shell_command_args(shell: &str) -> [&'static str; 4] {
    let probe = match unix_shell_flavor(shell) {
        UnixShellFlavor::Nushell => "print ($env.PATH | str join (char esep))",
        UnixShellFlavor::Posix => "echo $PATH",
    };

    ["-l", "-i", "-c", probe]
}

/// Resolve the preferred Unix shell, respecting GOOSE_SHELL.
///
/// Auto-detected shells are returned as basenames (e.g. `"bash"`) so that
/// `Command::new` resolves them on `PATH` at spawn time — this also keeps
/// Flatpak happy, where absolute paths from inside the sandbox don't match
/// the host filesystem.
#[cfg(not(windows))]
fn unix_shell() -> String {
    if let Ok(shell) = std::env::var("GOOSE_SHELL") {
        return shell;
    }
    if which::which("bash").is_ok() {
        "bash".to_string()
    } else {
        "sh".to_string()
    }
}

/// Resolve the user's full PATH by running a login shell.
#[cfg(not(windows))]
pub fn resolve_login_shell_path() -> Option<String> {
    use process_wrap::std::{CommandWrap, ProcessSession};

    let shell = unix_shell();
    let login_args = unix_login_shell_command_args(&shell);

    let mut cmd = if is_flatpak() {
        let mut c = flatpak_spawn_process();
        c.arg(&shell).args(login_args);
        CommandWrap::from(c)
    } else {
        let mut c = std::process::Command::new(&shell);
        c.args(login_args);
        CommandWrap::from(c)
    };

    cmd.command_mut()
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    // Spawn in a new session so that bash's interactive job-control setup
    // (TIOCSPGRP) cannot steal the terminal foreground from goose, which
    // would cause goose to receive SIGTTIN and be suspended on startup.
    cmd.wrap(ProcessSession);

    let mut child = cmd.spawn().ok()?;

    let mut stdout = child.stdout().take()?;
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        use std::io::Read;
        if stdout.read_to_end(&mut buf).is_ok() {
            let _ = tx.send(buf);
        }
    });

    match rx.recv_timeout(Duration::from_secs(5)) {
        Ok(buf)
            if child
                .wait()
                .is_ok_and(|s: std::process::ExitStatus| s.success()) =>
        {
            // Take the last non-empty line — interactive shells may emit
            // extra output from profile scripts before our echo.
            String::from_utf8_lossy(&buf)
                .lines()
                .rev()
                .find(|line| !line.trim().is_empty())
                .map(|line| line.trim().to_string())
                .filter(|path| !path.is_empty())
        }
        _ => {
            let _ = child.kill();
            None
        }
    }
}

#[cfg(test)]
#[cfg(not(windows))]
mod tests {
    use super::*;

    #[test]
    fn unix_shell_flavor_detects_nushell_names() {
        assert!(matches!(
            unix_shell_flavor("/opt/homebrew/bin/nu"),
            UnixShellFlavor::Nushell
        ));
        assert!(matches!(
            unix_shell_flavor("nushell"),
            UnixShellFlavor::Nushell
        ));
        assert!(matches!(
            unix_shell_flavor("/bin/bash"),
            UnixShellFlavor::Posix
        ));
    }

    #[test]
    fn unix_login_shell_command_args_use_nushell_probe() {
        assert_eq!(
            unix_login_shell_command_args("nu"),
            ["-l", "-i", "-c", "print ($env.PATH | str join (char esep))"]
        );
        assert_eq!(
            unix_login_shell_command_args("bash"),
            ["-l", "-i", "-c", "echo $PATH"]
        );
    }
}
