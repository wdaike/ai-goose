use crate::config::paths::Paths;
use crate::config::GooseMode;
use crate::conversation::message::{MessageUsage, TokenState};
use goose_types::conversation::token_usage::CostSource;

use crate::session::extension_data::ExtensionData;
use anyhow::Result;
use chrono::{DateTime, Utc};
use goose_types::conversation::token_usage::Usage;
use goose_types::model::ModelConfig;
use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Pool, Sqlite};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock};
use tracing::info;
use utoipa::ToSchema;

pub const CURRENT_SCHEMA_VERSION: i32 = 15;
pub const SESSIONS_FOLDER: &str = "sessions";
pub const DB_NAME: &str = "sessions.db";

#[derive(
    Debug,
    Clone,
    Copy,
    Serialize,
    Deserialize,
    ToSchema,
    PartialEq,
    Eq,
    Default,
    strum::Display,
    strum::EnumString,
)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum SessionType {
    #[default]
    User,
    Scheduled,
    SubAgent,
    Hidden,
    Terminal,
    Acp,
}

static SESSION_STORAGE: LazyLock<Arc<SessionStorage>> =
    LazyLock::new(|| Arc::new(SessionStorage::new(Paths::data_dir())));

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Session {
    pub id: String,
    #[schema(value_type = String)]
    pub working_dir: PathBuf,
    #[serde(alias = "description")]
    pub name: String,
    #[serde(default)]
    pub user_set_name: bool,
    #[serde(default)]
    pub session_type: SessionType,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub extension_data: ExtensionData,
    #[serde(default)]
    pub usage: Usage,
    #[serde(default)]
    pub accumulated_usage: Usage,
    pub accumulated_cost: Option<f64>,
    pub schedule_id: Option<String>,
    pub message_count: usize,
    #[serde(default)]
    pub last_message_at: Option<DateTime<Utc>>,
    pub provider_name: Option<String>,
    pub model_config: Option<ModelConfig>,
    #[serde(default)]
    pub goose_mode: GooseMode,
    #[serde(default)]
    pub archived_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub parent_session_id: Option<String>,
    #[serde(default)]
    pub last_message_snippet: Option<String>,
}

impl From<&Session> for TokenState {
    fn from(session: &Session) -> Self {
        Self {
            input_tokens: session.usage.input_tokens.unwrap_or(0),
            output_tokens: session.usage.output_tokens.unwrap_or(0),
            total_tokens: session.usage.total_tokens.unwrap_or(0),
            cache_read_tokens: session.usage.cache_read_input_tokens.unwrap_or(0),
            cache_write_tokens: session.usage.cache_write_input_tokens.unwrap_or(0),
            accumulated_input_tokens: session.accumulated_usage.input_tokens.unwrap_or(0),
            accumulated_output_tokens: session.accumulated_usage.output_tokens.unwrap_or(0),
            accumulated_total_tokens: session.accumulated_usage.total_tokens.unwrap_or(0),
            accumulated_cache_read_tokens: session
                .accumulated_usage
                .cache_read_input_tokens
                .unwrap_or(0),
            accumulated_cache_write_tokens: session
                .accumulated_usage
                .cache_write_input_tokens
                .unwrap_or(0),
            accumulated_cost: session.accumulated_cost,
        }
    }
}

pub fn token_state_from_session_and_totals(
    session: &Session,
    totals: &SessionUsageTotals,
) -> TokenState {
    TokenState {
        input_tokens: session.usage.input_tokens.unwrap_or(0),
        output_tokens: session.usage.output_tokens.unwrap_or(0),
        total_tokens: session.usage.total_tokens.unwrap_or(0),
        cache_read_tokens: session.usage.cache_read_input_tokens.unwrap_or(0),
        cache_write_tokens: session.usage.cache_write_input_tokens.unwrap_or(0),
        accumulated_input_tokens: totals.accumulated_usage.input_tokens.unwrap_or(0),
        accumulated_output_tokens: totals.accumulated_usage.output_tokens.unwrap_or(0),
        accumulated_total_tokens: totals.accumulated_usage.total_tokens.unwrap_or(0),
        accumulated_cache_read_tokens: totals
            .accumulated_usage
            .cache_read_input_tokens
            .unwrap_or(0),
        accumulated_cache_write_tokens: totals
            .accumulated_usage
            .cache_write_input_tokens
            .unwrap_or(0),
        accumulated_cost: totals.accumulated_cost,
    }
}

pub struct SessionUpdateBuilder<'a> {
    session_manager: &'a SessionManager,
    session_id: String,
    name: Option<String>,
    user_set_name: Option<bool>,
    session_type: Option<SessionType>,
    working_dir: Option<PathBuf>,
    extension_data: Option<ExtensionData>,
    usage: Option<Usage>,
    accumulated_usage: Option<Usage>,
    accumulated_cost: Option<Option<f64>>,
    schedule_id: Option<Option<String>>,
    provider_name: Option<Option<String>>,
    model_config: Option<Option<ModelConfig>>,
    goose_mode: Option<GooseMode>,
    archived_at: Option<Option<DateTime<Utc>>>,

    project_id: Option<Option<String>>,
    parent_session_id: Option<Option<String>>,
}

#[derive(Serialize, ToSchema, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SessionInsights {
    pub total_sessions: usize,
    pub total_tokens: i64,
}

#[derive(Debug, Clone, Default)]
pub struct SessionUsageTotals {
    pub accumulated_usage: Usage,
    pub accumulated_cost: Option<f64>,
}

impl<'a> SessionUpdateBuilder<'a> {
    fn new(session_manager: &'a SessionManager, session_id: String) -> Self {
        Self {
            session_manager,
            session_id,
            name: None,
            user_set_name: None,
            session_type: None,
            working_dir: None,
            extension_data: None,
            usage: None,
            accumulated_usage: None,
            accumulated_cost: None,
            schedule_id: None,
            provider_name: None,
            model_config: None,
            goose_mode: None,
            archived_at: None,
            project_id: None,
            parent_session_id: None,
        }
    }

    pub async fn apply(self) -> Result<()> {
        self.session_manager.apply_update_inner(self).await
    }

    pub fn user_provided_name(mut self, name: impl Into<String>) -> Self {
        let name = name.into().trim().to_string();
        if !name.is_empty() {
            self.name = Some(name);
            self.user_set_name = Some(true);
        }
        self
    }

    pub fn system_generated_name(mut self, name: impl Into<String>) -> Self {
        let name = name.into().trim().to_string();
        if !name.is_empty() {
            self.name = Some(name);
            self.user_set_name = Some(false);
        }
        self
    }

    pub fn session_type(mut self, session_type: SessionType) -> Self {
        self.session_type = Some(session_type);
        self
    }

    pub fn working_dir(mut self, working_dir: PathBuf) -> Self {
        self.working_dir = Some(working_dir);
        self
    }

    pub fn extension_data(mut self, data: ExtensionData) -> Self {
        self.extension_data = Some(data);
        self
    }

    pub fn usage(mut self, usage: Usage) -> Self {
        self.usage = Some(usage);
        self
    }

    pub fn accumulated_usage(mut self, usage: Usage) -> Self {
        self.accumulated_usage = Some(usage);
        self
    }

    pub fn accumulated_cost(mut self, cost: Option<f64>) -> Self {
        self.accumulated_cost = Some(cost);
        self
    }

    pub fn schedule_id(mut self, schedule_id: Option<String>) -> Self {
        self.schedule_id = Some(schedule_id);
        self
    }

    pub fn provider_name(mut self, provider_name: impl Into<String>) -> Self {
        self.provider_name = Some(Some(provider_name.into()));
        self
    }

    pub fn model_config(mut self, model_config: ModelConfig) -> Self {
        self.model_config = Some(Some(model_config));
        self
    }

    pub fn clear_model_config(mut self) -> Self {
        self.model_config = Some(None);
        self
    }

    pub fn goose_mode(mut self, mode: GooseMode) -> Self {
        self.goose_mode = Some(mode);
        self
    }

    pub fn archived_at(mut self, archived_at: Option<DateTime<Utc>>) -> Self {
        self.archived_at = Some(archived_at);
        self
    }

    pub fn project_id(mut self, project_id: Option<String>) -> Self {
        self.project_id = Some(project_id);
        self
    }

    pub fn parent_session_id(mut self, parent_session_id: Option<String>) -> Self {
        self.parent_session_id = Some(parent_session_id);
        self
    }
}

pub struct SessionManager {
    storage: Arc<SessionStorage>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SessionListCursor {
    pub(crate) sort_at: DateTime<Utc>,
    pub(crate) session_id: String,
}

#[derive(Debug, Clone)]
pub(crate) struct SessionListPage {
    pub(crate) sessions: Vec<Session>,
    pub(crate) next_cursor: Option<SessionListCursor>,
}

#[derive(Debug, Default, Clone)]
pub(crate) struct SessionListFilters<'a> {
    pub(crate) types: Option<&'a [SessionType]>,
    pub(crate) working_dir: Option<&'a Path>,
    pub(crate) keyword: Option<&'a str>,
}

#[derive(Debug, Clone)]
pub(crate) struct SessionListPageQuery<'a> {
    pub(crate) filters: SessionListFilters<'a>,
    pub(crate) cursor: Option<&'a SessionListCursor>,
    pub(crate) page_size: usize,
}

#[derive(Debug, Default)]
struct SessionListQuery<'a> {
    filters: SessionListFilters<'a>,
    cursor: Option<&'a SessionListCursor>,
    limit: Option<usize>,
}

fn keyword_terms(query: Option<&str>) -> Vec<String> {
    query
        .unwrap_or_default()
        .split_whitespace()
        .map(|word| word.to_lowercase())
        .collect()
}

#[derive(Debug, Clone)]
pub struct SessionNameUpdate {
    pub session_id: String,
    pub name: String,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub message_count: usize,
    pub user_set_name: bool,
}

impl SessionManager {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            storage: Arc::new(SessionStorage::new(data_dir)),
        }
    }

    pub fn instance() -> Self {
        Self {
            storage: Arc::clone(&SESSION_STORAGE),
        }
    }

    pub fn storage(&self) -> &Arc<SessionStorage> {
        &self.storage
    }

    pub async fn create_session(
        &self,
        working_dir: PathBuf,
        name: String,
        session_type: SessionType,
        goose_mode: GooseMode,
    ) -> Result<Session> {
        self.storage
            .create_session(working_dir, name, session_type, goose_mode)
            .await
    }

    pub async fn get_session(&self, id: &str, include_messages: bool) -> Result<Session> {
        self.storage.get_session(id, include_messages).await
    }

    pub fn update(&self, id: &str) -> SessionUpdateBuilder<'_> {
        SessionUpdateBuilder::new(self, id.to_string())
    }

    async fn apply_update_inner(&self, builder: SessionUpdateBuilder<'_>) -> Result<()> {
        self.storage.apply_update(builder).await
    }

    pub async fn list_sessions(&self) -> Result<Vec<Session>> {
        self.storage.list_sessions().await
    }

    pub async fn list_sessions_by_types(&self, types: &[SessionType]) -> Result<Vec<Session>> {
        self.storage.list_sessions_by_types(Some(types)).await
    }

    pub(crate) async fn list_sessions_paged(
        &self,
        query: SessionListPageQuery<'_>,
    ) -> Result<SessionListPage> {
        self.storage.list_sessions_paged(query).await
    }

    pub async fn list_all_sessions(&self) -> Result<Vec<Session>> {
        self.storage.list_sessions_by_types(None).await
    }

    pub async fn delete_session(&self, id: &str) -> Result<()> {
        self.storage.delete_session(id).await
    }

    pub async fn get_insights(&self) -> Result<SessionInsights> {
        self.storage
            .get_insights(&[SessionType::User, SessionType::Scheduled])
            .await
    }

    pub async fn get_session_usage_totals(&self, id: &str) -> Result<SessionUsageTotals> {
        self.storage.get_session_usage_totals(id).await
    }

    pub async fn record_usage_metrics(
        &self,
        session_id: &str,
        schedule_id: Option<String>,
        current_usage: Usage,
        model: &str,
        ledger: &MessageUsage,
    ) -> Result<()> {
        self.storage
            .record_usage_metrics(session_id, schedule_id, current_usage, model, ledger)
            .await
    }

    pub async fn copy_session(&self, session_id: &str, new_name: String) -> Result<Session> {
        self.storage.copy_session(self, session_id, new_name).await
    }
}

pub struct SessionStorage {
    pool: Pool<Sqlite>,
    initialized: tokio::sync::OnceCell<()>,
}

pub(crate) fn session_sort_at(session: &Session) -> DateTime<Utc> {
    session.last_message_at.unwrap_or(session.updated_at)
}

impl Default for Session {
    fn default() -> Self {
        Self {
            id: String::new(),
            working_dir: std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
            name: String::new(),
            user_set_name: false,
            session_type: SessionType::default(),
            created_at: Default::default(),
            updated_at: Default::default(),
            extension_data: ExtensionData::default(),
            usage: Usage::default(),
            accumulated_usage: Usage::default(),
            accumulated_cost: None,
            schedule_id: None,
            message_count: 0,
            last_message_at: None,
            provider_name: None,
            model_config: None,
            goose_mode: GooseMode::default(),
            archived_at: None,
            project_id: None,
            parent_session_id: None,
            last_message_snippet: None,
        }
    }
}

impl sqlx::FromRow<'_, sqlx::sqlite::SqliteRow> for Session {
    fn from_row(row: &sqlx::sqlite::SqliteRow) -> Result<Self, sqlx::Error> {
        use sqlx::Row;

        let model_config_json: Option<String> = row.try_get("model_config_json").ok().flatten();
        let model_config = model_config_json.and_then(|json| serde_json::from_str(&json).ok());

        let name: String = {
            let name_val: String = row.try_get("name").unwrap_or_default();
            if !name_val.is_empty() {
                name_val
            } else {
                row.try_get("description").unwrap_or_default()
            }
        };

        let user_set_name = row.try_get("user_set_name").unwrap_or(false);

        let session_type_str: String = row
            .try_get("session_type")
            .unwrap_or_else(|_| "user".to_string());
        let session_type = session_type_str.parse().unwrap_or_default();

        Ok(Session {
            id: row.try_get("id")?,
            working_dir: PathBuf::from(row.try_get::<String, _>("working_dir")?),
            name,
            user_set_name,
            session_type,
            created_at: row.try_get("created_at")?,
            updated_at: row.try_get("updated_at")?,
            extension_data: serde_json::from_str(&row.try_get::<String, _>("extension_data")?)
                .unwrap_or_default(),
            usage: Usage {
                input_tokens: row.try_get("input_tokens")?,
                output_tokens: row.try_get("output_tokens")?,
                total_tokens: row.try_get("total_tokens")?,
                cache_read_input_tokens: row.try_get("cache_read_tokens").ok().flatten(),
                cache_write_input_tokens: row.try_get("cache_write_tokens").ok().flatten(),
            },
            accumulated_usage: Usage {
                input_tokens: row.try_get("accumulated_input_tokens")?,
                output_tokens: row.try_get("accumulated_output_tokens")?,
                total_tokens: row.try_get("accumulated_total_tokens")?,
                cache_read_input_tokens: row
                    .try_get("accumulated_cache_read_tokens")
                    .ok()
                    .flatten(),
                cache_write_input_tokens: row
                    .try_get("accumulated_cache_write_tokens")
                    .ok()
                    .flatten(),
            },
            accumulated_cost: row.try_get("accumulated_cost").ok().flatten(),
            schedule_id: row.try_get("schedule_id")?,
            message_count: usize::from(
                serde_json::from_str::<ExtensionData>(
                    &row.try_get::<String, _>("extension_data")
                        .unwrap_or_default(),
                )
                .ok()
                .and_then(|data| data.get_extension_state("codex", "v0").cloned())
                .is_some(),
            ),
            last_message_at: row.try_get("updated_at").ok(),
            provider_name: row.try_get("provider_name").ok().flatten(),
            model_config,
            goose_mode: row
                .try_get::<String, _>("goose_mode")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or_default(),
            archived_at: row.try_get("archived_at").ok(),
            project_id: row.try_get("project_id").ok().flatten(),
            parent_session_id: row.try_get("parent_session_id").ok().flatten(),
            last_message_snippet: None,
        })
    }
}

async fn insert_usage_ledger_row(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    session_id: &str,
    model: Option<&str>,
    usage: &MessageUsage,
) -> Result<()> {
    let cost_source = usage.cost_source.map(|cs| match cs {
        CostSource::ProviderReported => "provider_reported",
        CostSource::Estimated => "estimated",
    });

    sqlx::query(
        r#"
        INSERT INTO usage_ledger (
            session_id, created_timestamp, model,
            input_tokens, output_tokens, total_tokens,
            cache_read_tokens, cache_write_tokens,
            cost, cost_source, is_compaction
        )
        VALUES (?, strftime('%s','now'), ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(session_id)
    .bind(model)
    .bind(usage.input_tokens)
    .bind(usage.output_tokens)
    .bind(usage.total_tokens)
    .bind(usage.cache_read_tokens)
    .bind(usage.cache_write_tokens)
    .bind(usage.cost)
    .bind(cost_source)
    .bind(usage.is_compaction as i64)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

impl SessionStorage {
    fn create_pool(path: &Path) -> Pool<Sqlite> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("Failed to create session database directory");
        }

        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .foreign_keys(true)
            .busy_timeout(std::time::Duration::from_secs(30))
            .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal);

        SqlitePoolOptions::new().connect_lazy_with(options)
    }

    pub fn new(data_dir: PathBuf) -> Self {
        let db_path = data_dir.join(SESSIONS_FOLDER).join(DB_NAME);
        Self {
            pool: Self::create_pool(&db_path),
            initialized: tokio::sync::OnceCell::new(),
        }
    }

    pub(crate) async fn pool(&self) -> Result<&Pool<Sqlite>> {
        self.initialized
            .get_or_try_init(|| async {
                let schema_exists = sqlx::query_scalar::<_, bool>(
                    r#"SELECT EXISTS (SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version')"#,
                )
                .fetch_one(&self.pool)
                .await
                .unwrap_or(false);

                if schema_exists {
                    Self::run_migrations(&self.pool).await?;
                } else {
                    Self::create_schema(&self.pool).await?;
                }
                Ok::<(), anyhow::Error>(())
            })
            .await?;
        Ok(&self.pool)
    }

    pub async fn create(session_dir: &Path) -> Result<Self> {
        let storage = Self::new(session_dir.to_path_buf());
        Self::create_schema(&storage.pool).await?;
        Ok(storage)
    }

    async fn create_schema(pool: &Pool<Sqlite>) -> Result<()> {
        // Run schema creation under `BEGIN IMMEDIATE` so SQLite serializes
        // writers across processes. Combined with `IF NOT EXISTS` on every
        // DDL statement and `INSERT OR IGNORE` on the bootstrap version
        // row, this makes init safe under concurrent first-run startup —
        // the previous flow:
        //
        //   SELECT EXISTS('schema_version') → false
        //   CREATE TABLE schema_version (...)
        //
        // raced when two processes both saw "doesn't exist" and the
        // second one's CREATE TABLE failed with `table already exists`,
        // which surfaced to callers as "Could not create session".
        let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        "#,
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query("INSERT OR IGNORE INTO schema_version (version) VALUES (?)")
            .bind(CURRENT_SCHEMA_VERSION)
            .execute(&mut *tx)
            .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                user_set_name BOOLEAN DEFAULT FALSE,
                session_type TEXT NOT NULL DEFAULT 'user',
                working_dir TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                extension_data TEXT DEFAULT '{}',
                total_tokens INTEGER,
                input_tokens INTEGER,
                output_tokens INTEGER,
                cache_read_tokens INTEGER,
                cache_write_tokens INTEGER,
                accumulated_total_tokens INTEGER,
                accumulated_input_tokens INTEGER,
                accumulated_output_tokens INTEGER,
                accumulated_cache_read_tokens INTEGER,
                accumulated_cache_write_tokens INTEGER,
                accumulated_cost REAL,
                schedule_id TEXT,
                provider_name TEXT,
                model_config_json TEXT,
                goose_mode TEXT NOT NULL DEFAULT 'auto',
                archived_at TIMESTAMP,
                project_id TEXT,
                parent_session_id TEXT
            )
        "#,
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS usage_ledger (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                created_timestamp INTEGER NOT NULL,
                model TEXT,
                input_tokens INTEGER,
                output_tokens INTEGER,
                total_tokens INTEGER,
                cache_read_tokens INTEGER,
                cache_write_tokens INTEGER,
                cost REAL,
                cost_source TEXT,
                is_compaction INTEGER DEFAULT 0
            )
        "#,
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC)")
            .execute(&mut *tx)
            .await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_sessions_type ON sessions(session_type)")
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id)",
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_usage_ledger_session ON usage_ledger(session_id)",
        )
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        // The inventory tables already use `CREATE TABLE IF NOT EXISTS`
        // and run on the shared pool, so they don't need to be inside
        // the same transaction.

        Ok(())
    }

    async fn run_migrations(pool: &Pool<Sqlite>) -> Result<()> {
        let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;

        let current_version = Self::get_schema_version(&mut tx).await?;

        if current_version < CURRENT_SCHEMA_VERSION {
            info!(
                "Running database migrations from v{} to v{}...",
                current_version, CURRENT_SCHEMA_VERSION
            );

            for version in (current_version + 1)..=CURRENT_SCHEMA_VERSION {
                info!("  Applying migration v{}...", version);
                Self::apply_migration(&mut tx, version).await?;
                Self::update_schema_version(&mut tx, version).await?;
                info!("  ✓ Migration v{} complete", version);
            }

            info!("All migrations complete");
        }

        tx.commit().await?;
        Ok(())
    }

    async fn get_schema_version(tx: &mut sqlx::Transaction<'_, Sqlite>) -> Result<i32> {
        let table_exists = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS (
                SELECT name FROM sqlite_master
                WHERE type='table' AND name='schema_version'
            )
        "#,
        )
        .fetch_one(&mut **tx)
        .await?;

        if !table_exists {
            return Ok(0);
        }

        let version = sqlx::query_scalar::<_, i32>("SELECT MAX(version) FROM schema_version")
            .fetch_one(&mut **tx)
            .await?;

        Ok(version)
    }

    async fn update_schema_version(
        tx: &mut sqlx::Transaction<'_, Sqlite>,
        version: i32,
    ) -> Result<()> {
        sqlx::query("INSERT INTO schema_version (version) VALUES (?)")
            .bind(version)
            .execute(&mut **tx)
            .await?;
        Ok(())
    }

    #[allow(clippy::too_many_lines)]
    async fn apply_migration(tx: &mut sqlx::Transaction<'_, Sqlite>, version: i32) -> Result<()> {
        match version {
            1 => {
                sqlx::query(
                    r#"
                    CREATE TABLE IF NOT EXISTS schema_version (
                        version INTEGER PRIMARY KEY,
                        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                "#,
                )
                .execute(&mut **tx)
                .await?;
            }
            2 => {
                sqlx::query(
                    r#"
                    ALTER TABLE sessions ADD COLUMN user_recipe_values_json TEXT
                "#,
                )
                .execute(&mut **tx)
                .await?;
            }
            3 => {
                sqlx::query(
                    r#"
                    ALTER TABLE messages ADD COLUMN metadata_json TEXT
                "#,
                )
                .execute(&mut **tx)
                .await?;
            }
            4 => {
                sqlx::query(
                    r#"
                    ALTER TABLE sessions ADD COLUMN name TEXT DEFAULT ''
                "#,
                )
                .execute(&mut **tx)
                .await?;

                sqlx::query(
                    r#"
                    ALTER TABLE sessions ADD COLUMN user_set_name BOOLEAN DEFAULT FALSE
                "#,
                )
                .execute(&mut **tx)
                .await?;
            }
            5 => {
                sqlx::query(
                    r#"
                    ALTER TABLE sessions ADD COLUMN session_type TEXT NOT NULL DEFAULT 'user'
                "#,
                )
                .execute(&mut **tx)
                .await?;

                sqlx::query("CREATE INDEX idx_sessions_type ON sessions(session_type)")
                    .execute(&mut **tx)
                    .await?;
            }
            6 => {
                sqlx::query(
                    r#"
                    ALTER TABLE sessions ADD COLUMN provider_name TEXT
                "#,
                )
                .execute(&mut **tx)
                .await?;

                sqlx::query(
                    r#"
                    ALTER TABLE sessions ADD COLUMN model_config_json TEXT
                "#,
                )
                .execute(&mut **tx)
                .await?;
            }
            7 => {
                sqlx::query(
                    r#"
                    ALTER TABLE messages ADD COLUMN message_id TEXT
                "#,
                )
                .execute(&mut **tx)
                .await?;

                sqlx::query(
                    r#"
                    UPDATE messages
                    SET message_id = 'msg_' || session_id || '_' || id
                "#,
                )
                .execute(&mut **tx)
                .await?;

                sqlx::query("CREATE INDEX idx_messages_message_id ON messages(message_id)")
                    .execute(&mut **tx)
                    .await?;
            }
            8 => {
                sqlx::query(
                    r#"
                    ALTER TABLE sessions ADD COLUMN goose_mode TEXT NOT NULL DEFAULT 'auto'
                "#,
                )
                .execute(&mut **tx)
                .await?;
            }
            9 => {
                sqlx::query(
                    r#"
                    UPDATE sessions
                    SET session_type = 'acp'
                    WHERE session_type = 'user'
                      AND name = 'ACP Session'
                      AND user_set_name = FALSE
                "#,
                )
                .execute(&mut **tx)
                .await?;
            }
            10 => {
                // Check if thread_id column already exists (e.g. fresh schema)
                let has_thread_id = sqlx::query_scalar::<_, i32>(
                    "SELECT COUNT(*) FROM pragma_table_info('sessions') WHERE name = 'thread_id'",
                )
                .fetch_one(&mut **tx)
                .await?
                    > 0;
                if !has_thread_id {
                    sqlx::query("ALTER TABLE sessions ADD COLUMN thread_id TEXT")
                        .execute(&mut **tx)
                        .await?;
                }
                sqlx::query(
                    "CREATE INDEX IF NOT EXISTS idx_sessions_thread ON sessions(thread_id)",
                )
                .execute(&mut **tx)
                .await?;
                sqlx::query(
                    "CREATE TABLE IF NOT EXISTS threads (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL DEFAULT 'New Chat',
                        user_set_name BOOLEAN DEFAULT FALSE,
                        working_dir TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        archived_at TIMESTAMP,
                        metadata_json TEXT DEFAULT '{}'
                    )",
                )
                .execute(&mut **tx)
                .await?;
                sqlx::query(
                    "CREATE TABLE IF NOT EXISTS thread_messages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        thread_id TEXT NOT NULL REFERENCES threads(id),
                        session_id TEXT,
                        message_id TEXT,
                        role TEXT NOT NULL,
                        content_json TEXT NOT NULL,
                        created_timestamp INTEGER NOT NULL,
                        metadata_json TEXT DEFAULT '{}'
                    )",
                )
                .execute(&mut **tx)
                .await?;
                sqlx::query("CREATE INDEX IF NOT EXISTS idx_thread_messages_thread ON thread_messages(thread_id)")
                    .execute(&mut **tx)
                    .await?;
                sqlx::query("CREATE INDEX IF NOT EXISTS idx_thread_messages_message_id ON thread_messages(message_id)")
                    .execute(&mut **tx)
                    .await?;
            }
            11 => {
                // Provider inventory tables; the inventory cache was removed
                // when goose moved to Codex's model catalog. Existing databases
                // keep the now-unused tables.
            }
            12 => {
                // Add archived_at, project_id columns to sessions.
                let has_archived_at = sqlx::query_scalar::<_, i32>(
                    "SELECT COUNT(*) FROM pragma_table_info('sessions') WHERE name = 'archived_at'",
                )
                .fetch_one(&mut **tx)
                .await?
                    > 0;
                if !has_archived_at {
                    sqlx::query("ALTER TABLE sessions ADD COLUMN archived_at TIMESTAMP")
                        .execute(&mut **tx)
                        .await?;
                }

                let has_project_id = sqlx::query_scalar::<_, i32>(
                    "SELECT COUNT(*) FROM pragma_table_info('sessions') WHERE name = 'project_id'",
                )
                .fetch_one(&mut **tx)
                .await?
                    > 0;
                if !has_project_id {
                    sqlx::query("ALTER TABLE sessions ADD COLUMN project_id TEXT")
                        .execute(&mut **tx)
                        .await?;
                }
            }
            13 => {
                let has_accumulated_cost = sqlx::query_scalar::<_, i32>(
                    "SELECT COUNT(*) FROM pragma_table_info('sessions') WHERE name = 'accumulated_cost'",
                )
                .fetch_one(&mut **tx)
                .await?
                    > 0;
                if !has_accumulated_cost {
                    sqlx::query("ALTER TABLE sessions ADD COLUMN accumulated_cost REAL")
                        .execute(&mut **tx)
                        .await?;
                }
            }
            14 => {
                for column in [
                    "cache_read_tokens",
                    "cache_write_tokens",
                    "accumulated_cache_read_tokens",
                    "accumulated_cache_write_tokens",
                ] {
                    let has_column = sqlx::query_scalar::<_, i32>(
                        "SELECT COUNT(*) FROM pragma_table_info('sessions') WHERE name = ?",
                    )
                    .bind(column)
                    .fetch_one(&mut **tx)
                    .await?
                        > 0;
                    if !has_column {
                        sqlx::query(sqlx::AssertSqlSafe(format!(
                            "ALTER TABLE sessions ADD COLUMN {column} INTEGER"
                        )))
                        .execute(&mut **tx)
                        .await?;
                    }
                }
            }
            15 => {
                let has_parent = sqlx::query_scalar::<_, i32>(
                    "SELECT COUNT(*) FROM pragma_table_info('sessions') WHERE name = 'parent_session_id'",
                )
                .fetch_one(&mut **tx)
                .await?
                    > 0;
                if !has_parent {
                    sqlx::query("ALTER TABLE sessions ADD COLUMN parent_session_id TEXT")
                        .execute(&mut **tx)
                        .await?;
                    sqlx::query(
                        "CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id)",
                    )
                    .execute(&mut **tx)
                    .await?;
                }

                sqlx::query(
                    r#"
                    CREATE TABLE IF NOT EXISTS usage_ledger (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                        created_timestamp INTEGER NOT NULL,
                        model TEXT,
                        input_tokens INTEGER,
                        output_tokens INTEGER,
                        total_tokens INTEGER,
                        cache_read_tokens INTEGER,
                        cache_write_tokens INTEGER,
                        cost REAL,
                        cost_source TEXT,
                        is_compaction INTEGER DEFAULT 0
                    )
                    "#,
                )
                .execute(&mut **tx)
                .await?;
                sqlx::query(
                    "CREATE INDEX IF NOT EXISTS idx_usage_ledger_session ON usage_ledger(session_id)",
                )
                .execute(&mut **tx)
                .await?;
            }
            _ => {
                anyhow::bail!("Unknown migration version: {}", version);
            }
        }

        Ok(())
    }

    async fn create_session(
        &self,
        working_dir: PathBuf,
        name: String,
        session_type: SessionType,
        goose_mode: GooseMode,
    ) -> Result<Session> {
        let pool = self.pool().await?;
        let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;

        let today = chrono::Utc::now().format("%Y%m%d").to_string();
        let session = sqlx::query_as(
            r#"
                INSERT INTO sessions (id, name, user_set_name, session_type, working_dir, extension_data, goose_mode)
                VALUES (
                    ? || '_' || CAST(COALESCE((
                        SELECT MAX(CAST(SUBSTR(id, 10) AS INTEGER))
                        FROM sessions
                        WHERE id LIKE ? || '_%'
                    ), 0) + 1 AS TEXT),
                    ?,
                    FALSE,
                    ?,
                    ?,
                    '{}',
                    ?
                )
                RETURNING *
                "#,
        )
            .bind(&today)
            .bind(&today)
            .bind(&name)
            .bind(session_type.to_string())
            .bind(&*working_dir.to_string_lossy())
            .bind(goose_mode.to_string())
            .fetch_one(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(session)
    }

    async fn get_session(&self, id: &str, _include_messages: bool) -> Result<Session> {
        let pool = self.pool().await?;
        let mut session = sqlx::query_as::<_, Session>(
            r#"
        SELECT id, working_dir, name, description, user_set_name, session_type, created_at, updated_at, extension_data,
               total_tokens, input_tokens, output_tokens,
               cache_read_tokens, cache_write_tokens,
               accumulated_total_tokens, accumulated_input_tokens, accumulated_output_tokens,
               accumulated_cache_read_tokens, accumulated_cache_write_tokens,
               accumulated_cost,
               schedule_id,
               provider_name, model_config_json, goose_mode,
               archived_at, project_id, parent_session_id
        FROM sessions
        WHERE id = ?
    "#,
        )
            .bind(id)
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Session not found"))?;

        // Codex owns the conversation. A session "has messages" exactly when a
        // Codex thread has been started for it, which is all the desktop needs
        // to tell real sessions from never-used ones.
        let has_thread = session
            .extension_data
            .get_extension_state("codex", "v0")
            .is_some();
        session.message_count = usize::from(has_thread);
        session.last_message_at = Some(session.updated_at);

        Ok(session)
    }

    #[allow(clippy::too_many_lines)]
    async fn apply_update(&self, builder: SessionUpdateBuilder<'_>) -> Result<()> {
        let mut updates = Vec::new();
        let mut query = String::from("UPDATE sessions SET ");

        macro_rules! add_update {
            ($field:expr, $name:expr) => {
                if $field.is_some() {
                    if !updates.is_empty() {
                        query.push_str(", ");
                    }
                    updates.push($name);
                    query.push_str($name);
                    query.push_str(" = ?");
                }
            };
        }

        add_update!(builder.name, "name");
        add_update!(builder.user_set_name, "user_set_name");
        add_update!(builder.session_type, "session_type");
        add_update!(builder.working_dir, "working_dir");
        add_update!(builder.extension_data, "extension_data");
        add_update!(builder.usage, "total_tokens");
        add_update!(builder.usage, "input_tokens");
        add_update!(builder.usage, "output_tokens");
        add_update!(builder.usage, "cache_read_tokens");
        add_update!(builder.usage, "cache_write_tokens");
        add_update!(builder.accumulated_usage, "accumulated_total_tokens");
        add_update!(builder.accumulated_usage, "accumulated_input_tokens");
        add_update!(builder.accumulated_usage, "accumulated_output_tokens");
        add_update!(builder.accumulated_usage, "accumulated_cache_read_tokens");
        add_update!(builder.accumulated_usage, "accumulated_cache_write_tokens");
        add_update!(builder.accumulated_cost, "accumulated_cost");
        add_update!(builder.schedule_id, "schedule_id");
        add_update!(builder.provider_name, "provider_name");
        add_update!(builder.model_config, "model_config_json");
        add_update!(builder.goose_mode, "goose_mode");
        add_update!(builder.archived_at, "archived_at");

        add_update!(builder.project_id, "project_id");
        add_update!(builder.parent_session_id, "parent_session_id");

        if updates.is_empty() {
            return Ok(());
        }

        query.push_str(", ");
        query.push_str("updated_at = datetime('now') WHERE id = ?");

        let mut q = sqlx::query(sqlx::AssertSqlSafe(query));

        if let Some(name) = builder.name {
            q = q.bind(name);
        }
        if let Some(user_set_name) = builder.user_set_name {
            q = q.bind(user_set_name);
        }
        if let Some(session_type) = builder.session_type {
            q = q.bind(session_type.to_string());
        }
        if let Some(wd) = builder.working_dir {
            q = q.bind(wd.to_string_lossy().to_string());
        }
        if let Some(ed) = builder.extension_data {
            q = q.bind(serde_json::to_string(&ed)?);
        }
        if let Some(u) = builder.usage {
            q = q
                .bind(u.total_tokens)
                .bind(u.input_tokens)
                .bind(u.output_tokens)
                .bind(u.cache_read_input_tokens)
                .bind(u.cache_write_input_tokens);
        }
        if let Some(u) = builder.accumulated_usage {
            q = q
                .bind(u.total_tokens)
                .bind(u.input_tokens)
                .bind(u.output_tokens)
                .bind(u.cache_read_input_tokens)
                .bind(u.cache_write_input_tokens);
        }
        if let Some(ac) = builder.accumulated_cost {
            q = q.bind(ac);
        }
        if let Some(sid) = builder.schedule_id {
            q = q.bind(sid);
        }
        if let Some(provider_name) = builder.provider_name {
            q = q.bind(provider_name);
        }
        if let Some(model_config) = builder.model_config {
            let model_config_json = model_config
                .map(|mc| serde_json::to_string(&mc))
                .transpose()?;
            q = q.bind(model_config_json);
        }
        if let Some(goose_mode) = builder.goose_mode {
            q = q.bind(goose_mode.to_string());
        }
        if let Some(ref archived_at) = builder.archived_at {
            q = q.bind(archived_at.as_ref());
        }

        if let Some(ref project_id) = builder.project_id {
            q = q.bind(project_id.as_ref());
        }
        if let Some(ref parent_session_id) = builder.parent_session_id {
            q = q.bind(parent_session_id.as_ref());
        }

        let pool = self.pool().await?;
        let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
        q = q.bind(&builder.session_id);
        let result = q.execute(&mut *tx).await?;

        if result.rows_affected() == 0 {
            return Err(anyhow::anyhow!("Session not found: {}", builder.session_id));
        }

        tx.commit().await?;
        Ok(())
    }

    async fn list_sessions_matching(&self, query: SessionListQuery<'_>) -> Result<Vec<Session>> {
        let filters = &query.filters;
        if matches!(filters.types, Some(types) if types.is_empty()) {
            return Ok(Vec::new());
        }

        let keywords = keyword_terms(filters.keyword);
        let mut where_clauses = Vec::new();
        let mut having_clauses = Vec::new();
        let sort_timestamp_sql = "unixepoch(s.updated_at)".to_string();
        if let Some(types) = filters.types {
            let placeholders = types.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
            where_clauses.push(format!("s.session_type IN ({})", placeholders));
        }
        if filters.working_dir.is_some() {
            where_clauses.push("s.working_dir = ?".to_string());
        }
        // Codex owns message content; session listing filters by name only,
        // matching any of the keyword terms.
        if !keywords.is_empty() {
            let ors = keywords
                .iter()
                .map(|_| "instr(LOWER(s.name), ?) > 0")
                .collect::<Vec<_>>()
                .join(" OR ");
            where_clauses.push(format!("({ors})"));
        }
        if query.cursor.is_some() {
            having_clauses.push(format!(
                "({sort_timestamp_sql} < ? OR ({sort_timestamp_sql} = ? AND s.id < ?))"
            ));
        }

        let where_clause = if where_clauses.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", where_clauses.join(" AND "))
        };
        let having_clause = if having_clauses.is_empty() {
            String::new()
        } else {
            format!("HAVING {}", having_clauses.join(" AND "))
        };
        let order_by = "ORDER BY sort_timestamp DESC, s.id DESC";
        let limit_clause = if query.limit.is_some() { "LIMIT ?" } else { "" };

        let sql = format!(
            r#"
            SELECT s.id, s.working_dir, s.name, s.description, s.user_set_name, s.session_type, s.created_at, s.updated_at, s.extension_data,
                   s.total_tokens, s.input_tokens, s.output_tokens,
                   s.cache_read_tokens, s.cache_write_tokens,
                   s.accumulated_total_tokens, s.accumulated_input_tokens, s.accumulated_output_tokens,
                   s.accumulated_cache_read_tokens, s.accumulated_cache_write_tokens,
                   s.accumulated_cost,
                   s.schedule_id,
                   s.provider_name, s.model_config_json, s.goose_mode,
                   s.archived_at, s.project_id, s.parent_session_id,
                   {} as sort_timestamp
            FROM sessions s
            {}
            GROUP BY s.id
            {}
            {}
            {}
            "#,
            sort_timestamp_sql, where_clause, having_clause, order_by, limit_clause
        );

        let mut q = sqlx::query_as::<_, Session>(sqlx::AssertSqlSafe(sql));
        if let Some(types) = filters.types {
            for session_type in types {
                q = q.bind(session_type.to_string());
            }
        }
        if let Some(working_dir) = filters.working_dir {
            q = q.bind(working_dir.to_string_lossy().to_string());
        }
        for term in keywords {
            q = q.bind(term);
        }
        if let Some(cursor) = query.cursor {
            let sort_at = cursor.sort_at.timestamp();
            q = q.bind(sort_at);
            q = q.bind(sort_at);
            q = q.bind(&cursor.session_id);
        }
        if let Some(limit) = query.limit {
            q = q.bind(limit as i64);
        }

        let pool = self.pool().await?;
        q.fetch_all(pool).await.map_err(Into::into)
    }

    async fn list_sessions_by_types(&self, types: Option<&[SessionType]>) -> Result<Vec<Session>> {
        self.list_sessions_matching(SessionListQuery {
            filters: SessionListFilters {
                types,
                ..Default::default()
            },
            ..Default::default()
        })
        .await
    }

    async fn list_sessions_paged(
        &self,
        query: SessionListPageQuery<'_>,
    ) -> Result<SessionListPage> {
        if matches!(query.filters.types, Some(types) if types.is_empty()) || query.page_size == 0 {
            return Ok(SessionListPage {
                sessions: Vec::new(),
                next_cursor: None,
            });
        }

        let page_size = query.page_size;
        let mut sessions = self
            .list_sessions_matching(SessionListQuery {
                filters: query.filters,
                cursor: query.cursor,
                limit: Some(page_size + 1),
            })
            .await?;
        let has_next_page = sessions.len() > page_size;
        let next_cursor = if has_next_page {
            let anchor = &sessions[page_size - 1];
            Some(SessionListCursor {
                sort_at: session_sort_at(anchor),
                session_id: anchor.id.clone(),
            })
        } else {
            None
        };
        if has_next_page {
            sessions.truncate(page_size);
        }
        Ok(SessionListPage {
            sessions,
            next_cursor,
        })
    }

    async fn list_sessions(&self) -> Result<Vec<Session>> {
        self.list_sessions_by_types(Some(&[SessionType::User, SessionType::Scheduled]))
            .await
    }

    async fn delete_session(&self, session_id: &str) -> Result<()> {
        let pool = self.pool().await?;
        let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;

        let exists =
            sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM sessions WHERE id = ?)")
                .bind(session_id)
                .fetch_one(&mut *tx)
                .await?;

        if !exists {
            return Err(anyhow::anyhow!("Session not found"));
        }

        sqlx::query("DELETE FROM usage_ledger WHERE session_id = ?")
            .bind(session_id)
            .execute(&mut *tx)
            .await?;

        sqlx::query("DELETE FROM sessions WHERE id = ?")
            .bind(session_id)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }

    async fn get_insights(&self, types: &[SessionType]) -> Result<SessionInsights> {
        if types.is_empty() {
            return Ok(SessionInsights {
                total_sessions: 0,
                total_tokens: 0,
            });
        }

        let placeholders: String = types.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        let query = format!(
            r#"
            SELECT COUNT(*) as total_sessions,
                   COALESCE(SUM(COALESCE(accumulated_total_tokens, total_tokens, 0)), 0) as total_tokens
            FROM sessions
            WHERE session_type IN ({})
            "#,
            placeholders
        );

        let pool = self.pool().await?;
        let mut q = sqlx::query_as::<_, (i64, Option<i64>)>(sqlx::AssertSqlSafe(query));
        for t in types {
            q = q.bind(t.to_string());
        }

        let row = q.fetch_one(pool).await?;

        Ok(SessionInsights {
            total_sessions: row.0 as usize,
            total_tokens: row.1.unwrap_or(0),
        })
    }

    async fn record_usage_metrics(
        &self,
        session_id: &str,
        schedule_id: Option<String>,
        current_usage: Usage,
        model: &str,
        ledger: &MessageUsage,
    ) -> Result<()> {
        let pool = self.pool().await?;
        let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;

        sqlx::query(
            r#"
            INSERT INTO usage_ledger (
                session_id, created_timestamp,
                input_tokens, output_tokens, total_tokens,
                cache_read_tokens, cache_write_tokens,
                cost, cost_source
            )
            SELECT s.id, strftime('%s','now'),
                   MAX(COALESCE(s.accumulated_input_tokens, 0) - l.input_sum, 0),
                   MAX(COALESCE(s.accumulated_output_tokens, 0) - l.output_sum, 0),
                   MAX(COALESCE(s.accumulated_total_tokens, 0) - l.total_sum, 0),
                   MAX(COALESCE(s.accumulated_cache_read_tokens, 0) - l.cache_read_sum, 0),
                   MAX(COALESCE(s.accumulated_cache_write_tokens, 0) - l.cache_write_sum, 0),
                   CASE WHEN s.accumulated_cost IS NULL OR s.accumulated_cost <= l.cost_sum THEN NULL
                        ELSE s.accumulated_cost - l.cost_sum END,
                   'carried_forward'
            FROM sessions s,
                 (SELECT COALESCE(SUM(input_tokens), 0) AS input_sum,
                         COALESCE(SUM(output_tokens), 0) AS output_sum,
                         COALESCE(SUM(total_tokens), 0) AS total_sum,
                         COALESCE(SUM(cache_read_tokens), 0) AS cache_read_sum,
                         COALESCE(SUM(cache_write_tokens), 0) AS cache_write_sum,
                         COALESCE(SUM(cost), 0.0) AS cost_sum
                  FROM usage_ledger WHERE session_id = ?) l
            WHERE s.id = ?
              AND (COALESCE(s.accumulated_input_tokens, 0) > l.input_sum
                   OR COALESCE(s.accumulated_output_tokens, 0) > l.output_sum
                   OR COALESCE(s.accumulated_total_tokens, 0) > l.total_sum
                   OR COALESCE(s.accumulated_cost, 0.0) > l.cost_sum + 1e-9)
            "#,
        )
        .bind(session_id)
        .bind(session_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            UPDATE sessions SET
                schedule_id = ?,
                total_tokens = ?, input_tokens = ?, output_tokens = ?,
                cache_read_tokens = ?, cache_write_tokens = ?,
                accumulated_total_tokens = COALESCE(accumulated_total_tokens, 0) + ?,
                accumulated_input_tokens = COALESCE(accumulated_input_tokens, 0) + ?,
                accumulated_output_tokens = COALESCE(accumulated_output_tokens, 0) + ?,
                accumulated_cache_read_tokens = COALESCE(accumulated_cache_read_tokens, 0) + ?,
                accumulated_cache_write_tokens = COALESCE(accumulated_cache_write_tokens, 0) + ?,
                accumulated_cost = CASE
                    WHEN ? IS NULL THEN accumulated_cost
                    ELSE COALESCE(accumulated_cost, 0) + ?
                END,
                updated_at = datetime('now')
            WHERE id = ?
            "#,
        )
        .bind(schedule_id)
        .bind(current_usage.total_tokens)
        .bind(current_usage.input_tokens)
        .bind(current_usage.output_tokens)
        .bind(current_usage.cache_read_input_tokens)
        .bind(current_usage.cache_write_input_tokens)
        .bind(ledger.total_tokens.unwrap_or(0))
        .bind(ledger.input_tokens.unwrap_or(0))
        .bind(ledger.output_tokens.unwrap_or(0))
        .bind(ledger.cache_read_tokens.unwrap_or(0))
        .bind(ledger.cache_write_tokens.unwrap_or(0))
        .bind(ledger.cost)
        .bind(ledger.cost)
        .bind(session_id)
        .execute(&mut *tx)
        .await?;

        insert_usage_ledger_row(&mut tx, session_id, Some(model), ledger).await?;

        tx.commit().await?;
        Ok(())
    }

    async fn get_session_usage_totals(&self, session_id: &str) -> Result<SessionUsageTotals> {
        let pool = self.pool().await?;
        let rows = sqlx::query_as::<
            _,
            (
                Option<i64>,
                Option<i64>,
                Option<i64>,
                Option<i64>,
                Option<i64>,
                Option<f64>,
                Option<i64>,
                Option<i64>,
                Option<i64>,
                Option<i64>,
                Option<i64>,
                Option<f64>,
            ),
        >(
            r#"
            WITH RECURSIVE tree(id) AS (
                SELECT id FROM sessions WHERE id = ?
                UNION
                SELECT s.id FROM sessions s JOIN tree ON s.parent_session_id = tree.id
            )
            SELECT
                s.accumulated_input_tokens, s.accumulated_output_tokens, s.accumulated_total_tokens,
                s.accumulated_cache_read_tokens, s.accumulated_cache_write_tokens, s.accumulated_cost,
                SUM(u.input_tokens), SUM(u.output_tokens), SUM(u.total_tokens),
                SUM(u.cache_read_tokens), SUM(u.cache_write_tokens), SUM(u.cost)
            FROM sessions s
            LEFT JOIN usage_ledger u ON u.session_id = s.id
            WHERE s.id IN (SELECT id FROM tree)
            GROUP BY s.id
            "#,
        )
        .bind(session_id)
        .fetch_all(pool)
        .await?;

        let mut input = 0i64;
        let mut output = 0i64;
        let mut total = 0i64;
        let mut cache_read = 0i64;
        let mut cache_write = 0i64;
        let mut cost: Option<f64> = None;

        let larger =
            |acc: Option<i64>, ledger: Option<i64>| acc.unwrap_or(0).max(ledger.unwrap_or(0));

        for row in rows {
            let (
                acc_in,
                acc_out,
                acc_total,
                acc_cr,
                acc_cw,
                acc_cost,
                l_in,
                l_out,
                l_total,
                l_cr,
                l_cw,
                l_cost,
            ) = row;
            input += larger(acc_in, l_in);
            output += larger(acc_out, l_out);
            total += larger(acc_total, l_total);
            cache_read += larger(acc_cr, l_cr);
            cache_write += larger(acc_cw, l_cw);
            if acc_cost.is_some() || l_cost.is_some() {
                let c = acc_cost.unwrap_or(0.0).max(l_cost.unwrap_or(0.0));
                cost = Some(cost.unwrap_or(0.0) + c);
            }
        }

        let opt = |v: i64| Some(i32::try_from(v).unwrap_or(i32::MAX));
        Ok(SessionUsageTotals {
            accumulated_usage: Usage::new(opt(input), opt(output), opt(total))
                .with_cache_tokens(opt(cache_read), opt(cache_write)),
            accumulated_cost: cost,
        })
    }

    async fn copy_session(
        &self,
        session_manager: &SessionManager,
        session_id: &str,
        new_name: String,
    ) -> Result<Session> {
        let original_session = self.get_session(session_id, false).await?;

        let new_session = self
            .create_session(
                original_session.working_dir.clone(),
                new_name,
                original_session.session_type,
                original_session.goose_mode,
            )
            .await?;

        let mut builder = session_manager
            .update(&new_session.id)
            .extension_data(original_session.extension_data)
            .schedule_id(original_session.schedule_id);

        if let Some(project_id) = original_session.project_id {
            builder = builder.project_id(Some(project_id));
        }
        if let Some(provider_name) = original_session.provider_name {
            builder = builder.provider_name(provider_name);
        }
        if let Some(model_config) = original_session.model_config {
            builder = builder.model_config(model_config);
        }
        builder = builder.goose_mode(original_session.goose_mode);

        builder.apply().await?;

        self.get_session(&new_session.id, false).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use goose_types::conversation::token_usage::CostSource;
    use tempfile::TempDir;
    use test_case::test_case;

    async fn create_session_for_list(
        sm: &SessionManager,
        working_dir: &str,
        _has_message: bool,
    ) -> String {
        sm.create_session(
            PathBuf::from(working_dir),
            format!("Session in {working_dir}"),
            SessionType::User,
            GooseMode::default(),
        )
        .await
        .unwrap()
        .id
    }

    async fn create_session_for_list_with_message(
        sm: &SessionManager,
        working_dir: &str,
        name: &str,
    ) -> String {
        let id = create_session_for_list(sm, working_dir, false).await;
        sm.update(&id)
            .system_generated_name(name.to_string())
            .apply()
            .await
            .unwrap();
        id
    }

    async fn set_sessions_updated_at(
        sm: &SessionManager,
        session_ids: &[String],
        updated_at: &str,
    ) {
        let pool = sm.storage().pool().await.unwrap();
        let updated_at = chrono::DateTime::parse_from_rfc3339(updated_at).unwrap();
        let timestamp = updated_at.format("%Y-%m-%d %H:%M:%S").to_string();

        for session_id in session_ids {
            sqlx::query("UPDATE sessions SET updated_at = ? WHERE id = ?")
                .bind(&timestamp)
                .bind(session_id)
                .execute(pool)
                .await
                .unwrap();
        }
    }
    async fn expected_session_list_ids(sm: &SessionManager, session_ids: &[String]) -> Vec<String> {
        let mut sessions = Vec::new();
        for session_id in session_ids {
            sessions.push(sm.get_session(session_id, false).await.unwrap());
        }
        sessions.sort_by(|a, b| {
            session_sort_at(b)
                .cmp(&session_sort_at(a))
                .then_with(|| b.id.cmp(&a.id))
        });
        sessions.into_iter().map(|session| session.id).collect()
    }

    async fn assert_session_list_page(
        sm: &SessionManager,
        cursor: Option<&SessionListCursor>,
        working_dir: Option<&str>,
        page_size: usize,
        expected_ids: &[String],
        expected_next_cursor: bool,
    ) -> Option<SessionListCursor> {
        let types = [SessionType::User];
        let page = sm
            .list_sessions_paged(SessionListPageQuery {
                filters: SessionListFilters {
                    types: Some(&types),
                    working_dir: working_dir.map(Path::new),
                    ..Default::default()
                },
                cursor,
                page_size,
            })
            .await
            .unwrap();
        let ids = page
            .sessions
            .iter()
            .map(|session| session.id.clone())
            .collect::<Vec<_>>();
        assert_eq!(ids.as_slice(), expected_ids);
        assert_eq!(page.next_cursor.is_some(), expected_next_cursor);
        page.next_cursor
    }

    async fn run_lock_upgrade_attempt(
        pool: Pool<Sqlite>,
        session_id: String,
        begin_statement: &'static str,
        worker_id: i32,
        barrier: Option<Arc<tokio::sync::Barrier>>,
    ) -> anyhow::Result<()> {
        let mut tx = pool.begin_with(begin_statement).await?;

        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM sessions WHERE id = ?")
            .bind(&session_id)
            .fetch_one(&mut *tx)
            .await?;

        if let Some(barrier) = barrier {
            barrier.wait().await;
        }

        sqlx::query("UPDATE sessions SET total_tokens = ? WHERE id = ?")
            .bind(worker_id)
            .bind(&session_id)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }

    async fn run_lock_upgrade_race(
        pool: Pool<Sqlite>,
        session_id: String,
        begin_statement: &'static str,
        use_barrier: bool,
    ) -> Vec<anyhow::Result<()>> {
        let barrier = if use_barrier {
            Some(Arc::new(tokio::sync::Barrier::new(2)))
        } else {
            None
        };
        let mut handles = Vec::new();

        for worker_id in 0..2 {
            let pool = pool.clone();
            let session_id = session_id.clone();
            let barrier = barrier.clone();
            handles.push(tokio::spawn(async move {
                run_lock_upgrade_attempt(pool, session_id, begin_statement, worker_id, barrier)
                    .await
            }));
        }

        let mut results = Vec::new();
        for handle in handles {
            results.push(handle.await.expect("lock-upgrade task panicked"));
        }
        results
    }

    #[tokio::test]
    async fn test_begin_immediate_prevents_lock_upgrade_deadlock() {
        let temp_dir = TempDir::new().unwrap();
        let session_manager = SessionManager::new(temp_dir.path().to_path_buf());

        let session = session_manager
            .create_session(
                PathBuf::from("/tmp/lock-upgrade-test"),
                "Lock Upgrade Session".to_string(),
                SessionType::User,
                GooseMode::default(),
            )
            .await
            .unwrap();

        let pool = session_manager.storage().pool.clone();

        let results = run_lock_upgrade_race(pool.clone(), session.id.clone(), "BEGIN", true).await;
        assert!(
            results.iter().any(Result::is_err),
            "BEGIN (DEFERRED) should cause SQLITE_BUSY when two tasks try to upgrade SHARED → RESERVED"
        );

        let results = run_lock_upgrade_race(pool, session.id, "BEGIN IMMEDIATE", false).await;
        assert!(
            results.iter().all(Result::is_ok),
            "BEGIN IMMEDIATE should serialize contention without SQLITE_BUSY: {:?}",
            results
                .iter()
                .filter_map(|r| r.as_ref().err().map(ToString::to_string))
                .collect::<Vec<_>>()
        );
    }

    #[tokio::test]
    async fn test_session_list_paged_first_second_and_final_page() {
        let temp_dir = TempDir::new().unwrap();
        let sm = SessionManager::new(temp_dir.path().to_path_buf());
        let mut expected_ids = Vec::new();
        for _ in 0..5 {
            expected_ids.push(create_session_for_list(&sm, "/tmp/session-list", true).await);
        }
        let expected_ids = expected_session_list_ids(&sm, &expected_ids).await;

        let cursor = assert_session_list_page(&sm, None, None, 2, &expected_ids[0..2], true).await;
        let cursor =
            assert_session_list_page(&sm, cursor.as_ref(), None, 2, &expected_ids[2..4], true)
                .await;
        assert_session_list_page(&sm, cursor.as_ref(), None, 2, &expected_ids[4..5], false).await;
    }
    #[tokio::test]
    async fn test_session_list_paged_uses_id_tiebreaker_for_duplicate_activity_time() {
        let temp_dir = TempDir::new().unwrap();
        let sm = SessionManager::new(temp_dir.path().to_path_buf());
        let mut expected_ids = Vec::new();
        for _ in 0..3 {
            expected_ids.push(create_session_for_list(&sm, "/tmp/session-list", true).await);
        }
        set_sessions_updated_at(&sm, &expected_ids, "2024-01-01T00:00:00Z").await;
        let expected_ids = expected_session_list_ids(&sm, &expected_ids).await;

        let cursor = assert_session_list_page(&sm, None, None, 2, &expected_ids[0..2], true).await;
        assert_session_list_page(&sm, cursor.as_ref(), None, 2, &expected_ids[2..3], false).await;
    }

    #[tokio::test]
    async fn test_session_list_paged_filters_by_keyword() {
        let temp_dir = TempDir::new().unwrap();
        let sm = SessionManager::new(temp_dir.path().to_path_buf());
        let target = create_session_for_list_with_message(
            &sm,
            "/tmp/session-list",
            "Discuss Postgres migrations",
        )
        .await;
        create_session_for_list_with_message(&sm, "/tmp/session-list", "Plan the mobile release")
            .await;

        let types = [SessionType::User];
        let page = sm
            .list_sessions_paged(SessionListPageQuery {
                filters: SessionListFilters {
                    types: Some(&types),
                    keyword: Some("postgres"),
                    ..Default::default()
                },
                cursor: None,
                page_size: 10,
            })
            .await
            .unwrap();
        let ids = page
            .sessions
            .iter()
            .map(|session| session.id.clone())
            .collect::<Vec<_>>();

        assert_eq!(ids, vec![target]);
        assert!(page.next_cursor.is_none());
    }

    #[tokio::test]
    async fn test_session_list_paged_keyword_uses_or_terms() {
        let temp_dir = TempDir::new().unwrap();
        let sm = SessionManager::new(temp_dir.path().to_path_buf());
        let postgres = create_session_for_list_with_message(
            &sm,
            "/tmp/session-list",
            "Postgres migration plan",
        )
        .await;
        let sqlite =
            create_session_for_list_with_message(&sm, "/tmp/session-list", "SQLite backup notes")
                .await;
        create_session_for_list_with_message(&sm, "/tmp/session-list", "Mobile release notes")
            .await;
        let expected_ids = expected_session_list_ids(&sm, &[postgres, sqlite]).await;

        let types = [SessionType::User];
        let page = sm
            .list_sessions_paged(SessionListPageQuery {
                filters: SessionListFilters {
                    types: Some(&types),
                    keyword: Some("postgres sqlite"),
                    ..Default::default()
                },
                cursor: None,
                page_size: 10,
            })
            .await
            .unwrap();
        let ids = page
            .sessions
            .iter()
            .map(|session| session.id.clone())
            .collect::<Vec<_>>();

        assert_eq!(ids, expected_ids);
        assert!(page.next_cursor.is_none());
    }

    #[tokio::test]
    async fn test_session_list_paged_empty_keyword_matches_plain_list() {
        let temp_dir = TempDir::new().unwrap();
        let sm = SessionManager::new(temp_dir.path().to_path_buf());
        let expected_ids = vec![
            create_session_for_list_with_message(&sm, "/tmp/session-list", "first message").await,
            create_session_for_list_with_message(&sm, "/tmp/session-list", "second message").await,
        ];
        let expected_ids = expected_session_list_ids(&sm, &expected_ids).await;

        let types = [SessionType::User];
        let page = sm
            .list_sessions_paged(SessionListPageQuery {
                filters: SessionListFilters {
                    types: Some(&types),
                    keyword: Some("   "),
                    ..Default::default()
                },
                cursor: None,
                page_size: 10,
            })
            .await
            .unwrap();
        let ids = page
            .sessions
            .iter()
            .map(|session| session.id.clone())
            .collect::<Vec<_>>();

        assert_eq!(ids, expected_ids);
    }

    #[tokio::test]
    async fn test_session_list_paged_keyword_treats_like_wildcards_as_literals() {
        let temp_dir = TempDir::new().unwrap();
        let sm = SessionManager::new(temp_dir.path().to_path_buf());
        let percent_id =
            create_session_for_list_with_message(&sm, "/tmp/session-list", "Deploy is 100% done")
                .await;
        let underscore_id = create_session_for_list_with_message(
            &sm,
            "/tmp/session-list",
            "feature_flag is enabled",
        )
        .await;
        create_session_for_list_with_message(&sm, "/tmp/session-list", "plain message").await;

        let types = [SessionType::User];
        let percent_page = sm
            .list_sessions_paged(SessionListPageQuery {
                filters: SessionListFilters {
                    types: Some(&types),
                    keyword: Some("%"),
                    ..Default::default()
                },
                cursor: None,
                page_size: 10,
            })
            .await
            .unwrap();
        let percent_ids = percent_page
            .sessions
            .iter()
            .map(|session| session.id.clone())
            .collect::<Vec<_>>();
        assert_eq!(percent_ids, vec![percent_id]);

        let underscore_page = sm
            .list_sessions_paged(SessionListPageQuery {
                filters: SessionListFilters {
                    types: Some(&types),
                    keyword: Some("_"),
                    ..Default::default()
                },
                cursor: None,
                page_size: 10,
            })
            .await
            .unwrap();
        let underscore_ids = underscore_page
            .sessions
            .iter()
            .map(|session| session.id.clone())
            .collect::<Vec<_>>();
        assert_eq!(underscore_ids, vec![underscore_id]);
    }

    #[tokio::test]
    async fn test_session_list_paged_keyword_combines_with_cwd_and_pagination() {
        let temp_dir = TempDir::new().unwrap();
        let sm = SessionManager::new(temp_dir.path().to_path_buf());
        let expected_ids = vec![
            create_session_for_list_with_message(&sm, "/tmp/session-list/a", "Postgres plan one")
                .await,
            create_session_for_list_with_message(&sm, "/tmp/session-list/a", "Postgres plan two")
                .await,
        ];
        create_session_for_list_with_message(&sm, "/tmp/session-list/a", "Mobile release").await;
        create_session_for_list_with_message(&sm, "/tmp/session-list/b", "Postgres plan other")
            .await;
        let expected_ids = expected_session_list_ids(&sm, &expected_ids).await;

        let types = [SessionType::User];
        let filters = SessionListFilters {
            types: Some(&types),
            working_dir: Some(Path::new("/tmp/session-list/a")),
            keyword: Some("postgres"),
        };
        let cursor = sm
            .list_sessions_paged(SessionListPageQuery {
                filters: filters.clone(),
                cursor: None,
                page_size: 1,
            })
            .await
            .unwrap();
        let ids = cursor
            .sessions
            .iter()
            .map(|session| session.id.clone())
            .collect::<Vec<_>>();
        assert_eq!(ids, expected_ids[0..1]);
        assert!(cursor.next_cursor.is_some());

        let page = sm
            .list_sessions_paged(SessionListPageQuery {
                filters,
                cursor: cursor.next_cursor.as_ref(),
                page_size: 1,
            })
            .await
            .unwrap();
        let ids = page
            .sessions
            .iter()
            .map(|session| session.id.clone())
            .collect::<Vec<_>>();
        assert_eq!(ids, expected_ids[1..2]);
        assert!(page.next_cursor.is_none());
    }
    #[test_case(GooseMode::Approve)]
    #[test_case(GooseMode::SmartApprove)]
    #[test_case(GooseMode::Chat)]
    #[tokio::test]
    async fn test_goose_mode_persists(mode: GooseMode) {
        let temp_dir = TempDir::new().unwrap();
        let sm = SessionManager::new(temp_dir.path().to_path_buf());

        let session = sm
            .create_session(
                temp_dir.path().to_path_buf(),
                "test".into(),
                SessionType::User,
                mode,
            )
            .await
            .unwrap();

        let reloaded = sm.get_session(&session.id, false).await.unwrap();
        assert_eq!(reloaded.goose_mode, mode);
    }

    #[tokio::test]
    async fn test_goose_mode_update() {
        let temp_dir = TempDir::new().unwrap();
        let sm = SessionManager::new(temp_dir.path().to_path_buf());

        let session = sm
            .create_session(
                temp_dir.path().to_path_buf(),
                "test".into(),
                SessionType::User,
                GooseMode::default(),
            )
            .await
            .unwrap();

        sm.update(&session.id)
            .goose_mode(GooseMode::Approve)
            .apply()
            .await
            .unwrap();

        let reloaded = sm.get_session(&session.id, false).await.unwrap();
        assert_eq!(reloaded.goose_mode, GooseMode::Approve);
    }

    #[tokio::test]
    async fn test_goose_mode_malformed_defaults_to_auto() {
        let temp_dir = TempDir::new().unwrap();
        let sm = SessionManager::new(temp_dir.path().to_path_buf());

        let session = sm
            .create_session(
                temp_dir.path().to_path_buf(),
                "test".into(),
                SessionType::User,
                GooseMode::Approve,
            )
            .await
            .unwrap();

        let pool = &sm.storage().pool;
        sqlx::query("UPDATE sessions SET goose_mode = 'garbage' WHERE id = ?")
            .bind(&session.id)
            .execute(pool)
            .await
            .unwrap();

        let reloaded = sm.get_session(&session.id, false).await.unwrap();
        assert_eq!(reloaded.goose_mode, GooseMode::default());
    }

    #[tokio::test]
    async fn test_acp_session_migration() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join(SESSIONS_FOLDER).join(DB_NAME);

        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }

        let pool = SqlitePoolOptions::new()
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(&db_path)
                    .create_if_missing(true),
            )
            .await
            .unwrap();

        SessionStorage::create_schema(&pool).await.unwrap();

        // Demote the schema back to v8 to simulate a database
        // that has never seen migration 9.
        sqlx::query("UPDATE schema_version SET version = 8")
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query(
            "INSERT INTO sessions (id, name, user_set_name, session_type, working_dir, extension_data, goose_mode)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind("user_id")
        .bind("User Session")
        .bind(false)
        .bind("user")
        .bind("/tmp")
        .bind("{}")
        .bind("auto")
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO sessions (id, name, user_set_name, session_type, working_dir, extension_data, goose_mode)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind("acp_id")
        .bind("ACP Session")
        .bind(false)
        .bind("user")
        .bind("/tmp")
        .bind("{}")
        .bind("auto")
        .execute(&pool)
        .await
        .unwrap();

        pool.close().await;

        let sm = SessionManager::new(temp_dir.path().to_path_buf());
        sm.storage().pool().await.unwrap(); // Triggers migration

        let user_session = sm.storage().get_session("user_id", false).await.unwrap();
        assert_eq!(user_session.session_type, SessionType::User);

        let acp_session = sm.storage().get_session("acp_id", false).await.unwrap();
        assert_eq!(acp_session.session_type, SessionType::Acp);
    }

    #[tokio::test]
    async fn test_cache_token_columns_migration_and_round_trip() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join(SESSIONS_FOLDER).join(DB_NAME);

        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }

        let pool = SqlitePoolOptions::new()
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(&db_path)
                    .create_if_missing(true),
            )
            .await
            .unwrap();

        SessionStorage::create_schema(&pool).await.unwrap();

        // Recreate a v13-shaped database without cache token columns.
        for column in [
            "cache_read_tokens",
            "cache_write_tokens",
            "accumulated_cache_read_tokens",
            "accumulated_cache_write_tokens",
        ] {
            sqlx::query(sqlx::AssertSqlSafe(format!(
                "ALTER TABLE sessions DROP COLUMN {column}"
            )))
            .execute(&pool)
            .await
            .unwrap();
        }
        sqlx::query("UPDATE schema_version SET version = 13")
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query(
            "INSERT INTO sessions (id, name, user_set_name, session_type, working_dir, extension_data, goose_mode)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind("cache_id")
        .bind("Cache Session")
        .bind(false)
        .bind("user")
        .bind("/tmp")
        .bind("{}")
        .bind("auto")
        .execute(&pool)
        .await
        .unwrap();

        pool.close().await;

        let sm = SessionManager::new(temp_dir.path().to_path_buf());
        sm.storage().pool().await.unwrap(); // Triggers migration

        let usage =
            Usage::new(Some(8000), Some(500), None).with_cache_tokens(Some(5000), Some(1000));
        let accumulated_usage =
            Usage::new(Some(24000), Some(1500), None).with_cache_tokens(Some(15000), Some(3000));

        sm.update("cache_id")
            .usage(usage)
            .accumulated_usage(accumulated_usage)
            .apply()
            .await
            .unwrap();

        let loaded = sm.get_session("cache_id", false).await.unwrap();
        assert_eq!(loaded.usage, usage);
        assert_eq!(loaded.accumulated_usage, accumulated_usage);
    }

    fn message_usage(input: i32, output: i32, cost: f64, is_compaction: bool) -> MessageUsage {
        MessageUsage {
            input_tokens: Some(input),
            output_tokens: Some(output),
            total_tokens: Some(input + output),
            cost: Some(cost),
            cost_source: Some(CostSource::Estimated),
            is_compaction,
            ..Default::default()
        }
    }

    async fn new_session(sm: &SessionManager) -> String {
        sm.create_session(
            PathBuf::from("/tmp"),
            "s".to_string(),
            SessionType::User,
            GooseMode::default(),
        )
        .await
        .unwrap()
        .id
    }

    async fn seed_ledger(
        sm: &SessionManager,
        session_id: &str,
        usage: &MessageUsage,
    ) -> Result<()> {
        let pool = sm.storage().pool().await?;
        let mut tx = pool.begin().await?;
        insert_usage_ledger_row(&mut tx, session_id, None, usage).await?;
        tx.commit().await?;
        Ok(())
    }

    #[tokio::test]
    async fn test_usage_totals_include_subagent_tree() {
        let temp_dir = TempDir::new().unwrap();
        let sm = SessionManager::new(temp_dir.path().to_path_buf());
        let parent = new_session(&sm).await;
        let child = new_session(&sm).await;
        sm.update(&child)
            .parent_session_id(Some(parent.clone()))
            .apply()
            .await
            .unwrap();

        seed_ledger(&sm, &parent, &message_usage(100, 20, 0.10, false))
            .await
            .unwrap();
        seed_ledger(&sm, &child, &message_usage(40, 8, 0.04, false))
            .await
            .unwrap();

        let parent_totals = sm.get_session_usage_totals(&parent).await.unwrap();
        assert_eq!(parent_totals.accumulated_usage.input_tokens, Some(140));
        assert!((parent_totals.accumulated_cost.unwrap() - 0.14).abs() < 1e-9);

        let child_totals = sm.get_session_usage_totals(&child).await.unwrap();
        assert_eq!(child_totals.accumulated_usage.input_tokens, Some(40));
        assert!((child_totals.accumulated_cost.unwrap() - 0.04).abs() < 1e-9);
    }

    #[tokio::test]
    async fn test_ledger_reconciles_spend_recorded_on_pre_v15_builds() {
        let temp_dir = TempDir::new().unwrap();
        let sm = SessionManager::new(temp_dir.path().to_path_buf());
        let id = new_session(&sm).await;

        sm.update(&id)
            .accumulated_usage(Usage::new(Some(5000), Some(1000), Some(6000)))
            .accumulated_cost(Some(5.0))
            .apply()
            .await
            .unwrap();

        sm.record_usage_metrics(
            &id,
            None,
            Usage::new(Some(100), Some(20), Some(120)),
            "test-model",
            &message_usage(100, 20, 0.01, false),
        )
        .await
        .unwrap();

        let totals = sm.get_session_usage_totals(&id).await.unwrap();
        assert_eq!(totals.accumulated_usage.total_tokens, Some(6120));
        assert!((totals.accumulated_cost.unwrap() - 5.01).abs() < 1e-9);

        let session = sm.get_session(&id, false).await.unwrap();
        sm.update(&id)
            .accumulated_usage(
                session.accumulated_usage + Usage::new(Some(500), Some(50), Some(550)),
            )
            .accumulated_cost(Some(session.accumulated_cost.unwrap() + 0.50))
            .apply()
            .await
            .unwrap();

        sm.record_usage_metrics(
            &id,
            None,
            Usage::new(Some(30), Some(5), Some(35)),
            "test-model",
            &message_usage(30, 5, 0.03, false),
        )
        .await
        .unwrap();

        let totals = sm.get_session_usage_totals(&id).await.unwrap();
        assert_eq!(totals.accumulated_usage.input_tokens, Some(5630));
        assert_eq!(totals.accumulated_usage.output_tokens, Some(1075));
        assert_eq!(totals.accumulated_usage.total_tokens, Some(6705));
        assert!((totals.accumulated_cost.unwrap() - 5.54).abs() < 1e-9);

        let session = sm.get_session(&id, false).await.unwrap();
        assert_eq!(session.accumulated_usage, totals.accumulated_usage);
        assert!((session.accumulated_cost.unwrap() - 5.54).abs() < 1e-9);
    }

    #[tokio::test]
    async fn test_usage_totals_read_through_unreconciled_drift() {
        let temp_dir = TempDir::new().unwrap();
        let sm = SessionManager::new(temp_dir.path().to_path_buf());
        let id = new_session(&sm).await;

        sm.record_usage_metrics(
            &id,
            None,
            Usage::new(Some(100), Some(20), Some(120)),
            "test-model",
            &message_usage(100, 20, 0.10, false),
        )
        .await
        .unwrap();

        let session = sm.get_session(&id, false).await.unwrap();
        sm.update(&id)
            .accumulated_usage(
                session.accumulated_usage + Usage::new(Some(500), Some(50), Some(550)),
            )
            .accumulated_cost(Some(session.accumulated_cost.unwrap() + 0.50))
            .apply()
            .await
            .unwrap();

        let totals = sm.get_session_usage_totals(&id).await.unwrap();
        assert_eq!(totals.accumulated_usage.input_tokens, Some(600));
        assert_eq!(totals.accumulated_usage.total_tokens, Some(670));
        assert!((totals.accumulated_cost.unwrap() - 0.60).abs() < 1e-9);
    }

    #[tokio::test]
    async fn test_usage_totals_fall_back_to_accumulated_for_legacy_sessions() {
        let temp_dir = TempDir::new().unwrap();
        let sm = SessionManager::new(temp_dir.path().to_path_buf());
        let id = new_session(&sm).await;

        sm.update(&id)
            .accumulated_usage(Usage::new(Some(500), Some(100), Some(600)))
            .accumulated_cost(Some(0.42))
            .apply()
            .await
            .unwrap();

        let totals = sm.get_session_usage_totals(&id).await.unwrap();
        assert_eq!(totals.accumulated_usage.input_tokens, Some(500));
        assert_eq!(totals.accumulated_cost, Some(0.42));
    }
    #[tokio::test]
    async fn test_usage_totals_mixed_legacy_and_ledger_tree() {
        let temp_dir = TempDir::new().unwrap();
        let sm = SessionManager::new(temp_dir.path().to_path_buf());
        let parent = new_session(&sm).await;
        let child = new_session(&sm).await;
        sm.update(&child)
            .parent_session_id(Some(parent.clone()))
            .apply()
            .await
            .unwrap();

        seed_ledger(&sm, &parent, &message_usage(100, 20, 0.10, false))
            .await
            .unwrap();
        sm.update(&child)
            .accumulated_usage(Usage::new(Some(300), Some(60), Some(360)))
            .accumulated_cost(Some(0.25))
            .apply()
            .await
            .unwrap();

        let totals = sm.get_session_usage_totals(&parent).await.unwrap();
        assert_eq!(totals.accumulated_usage.input_tokens, Some(400));
        assert_eq!(totals.accumulated_usage.output_tokens, Some(80));
        assert!((totals.accumulated_cost.unwrap() - 0.35).abs() < 1e-9);
    }

    #[tokio::test]
    async fn test_delete_session_with_ledger_rows() {
        let temp_dir = TempDir::new().unwrap();
        let sm = SessionManager::new(temp_dir.path().to_path_buf());
        let id = new_session(&sm).await;

        seed_ledger(&sm, &id, &message_usage(100, 20, 0.10, false))
            .await
            .unwrap();

        sm.delete_session(&id).await.unwrap();
        assert!(sm.get_session(&id, false).await.is_err());
    }
}
