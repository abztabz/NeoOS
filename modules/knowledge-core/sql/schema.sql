-- NeoOS Knowledge Core foundation schema blueprint.
-- Source-controlled PostgreSQL design evidence. Deploy through a governed migration.

create extension if not exists vector;
create extension if not exists pgcrypto;

create schema if not exists knowledge_core;
revoke all on schema knowledge_core from public;

-- Keep future objects private by default. Consumer/runtime privileges are granted
-- only after a NeoOS identity and least-privilege database role model is approved.
alter default privileges in schema knowledge_core revoke all on tables from public;
alter default privileges in schema knowledge_core revoke all on sequences from public;

create table if not exists knowledge_core.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text not null,
  canonical_url text,
  publisher text,
  authority_class text not null check (authority_class in (
    'primary-authority', 'peer-reviewed', 'official-documentation',
    'reputable-secondary', 'community', 'unknown'
  )),
  license_spdx text,
  license_uri text,
  freshness_policy text,
  last_checked_at timestamptz,
  status text not null default 'active' check (status in ('candidate', 'active', 'challenged', 'retired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_core.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references knowledge_core.knowledge_sources(id) on delete restrict,
  title text not null,
  author text,
  published_at timestamptz,
  retrieved_at timestamptz not null default now(),
  canonical_url text,
  content_hash text not null,
  mime_type text,
  language text,
  project_scope text not null default 'global',
  knowledge_domain text,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'verified', 'challenged')),
  lifecycle_status text not null default 'ingested' check (lifecycle_status in (
    'candidate', 'ingested', 'verified', 'active', 'challenged', 'superseded', 'archived'
  )),
  license_status text,
  untrusted_source boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_id, content_hash)
);

create table if not exists knowledge_core.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references knowledge_core.knowledge_documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  section text,
  page_number integer check (page_number is null or page_number > 0),
  content text not null,
  content_hash text not null,
  lexical tsvector generated always as (to_tsvector('simple', content)) stored,
  embedding vector,
  embedding_model text,
  embedding_dimensions integer check (embedding_dimensions is null or embedding_dimensions > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists knowledge_chunks_document_idx on knowledge_core.knowledge_chunks(document_id);
create index if not exists knowledge_chunks_lexical_idx on knowledge_core.knowledge_chunks using gin(lexical);
create index if not exists knowledge_documents_scope_idx on knowledge_core.knowledge_documents(project_scope, lifecycle_status);
create index if not exists knowledge_documents_source_idx on knowledge_core.knowledge_documents(source_id);

-- HNSW/IVFFlat is intentionally deferred until NeoOS standardizes one embedding dimension per indexed corpus.

create table if not exists knowledge_core.neoos_decisions (
  id uuid primary key default gen_random_uuid(),
  decision_key text not null unique,
  project_scope text not null default 'global',
  decision text not null,
  rationale text not null,
  alternatives jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  status text not null,
  supersedes uuid references knowledge_core.neoos_decisions(id) on delete set null,
  created_by text,
  decided_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists neoos_decisions_scope_idx on knowledge_core.neoos_decisions(project_scope, status);

create table if not exists knowledge_core.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references knowledge_core.knowledge_sources(id) on delete set null,
  input_type text not null,
  input_locator text,
  project_scope text not null default 'global',
  status text not null default 'queued' check (status in ('queued', 'running', 'blocked', 'failed', 'completed')),
  content_hash text,
  error_code text,
  error_detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists knowledge_core.knowledge_queries (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  project_scope text not null default 'global',
  freshness_requirement text not null default 'stable' check (freshness_requirement in ('historical', 'stable', 'current', 'live')),
  requested_by text,
  live_research_required boolean not null default false,
  route jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists knowledge_core.knowledge_query_evidence (
  id uuid primary key default gen_random_uuid(),
  query_id uuid not null references knowledge_core.knowledge_queries(id) on delete cascade,
  chunk_id uuid references knowledge_core.knowledge_chunks(id) on delete set null,
  decision_id uuid references knowledge_core.neoos_decisions(id) on delete set null,
  evidence_kind text not null check (evidence_kind in ('knowledge', 'decision', 'external-candidate')),
  score double precision not null check (score >= 0 and score <= 1),
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (
    (evidence_kind = 'knowledge' and chunk_id is not null and decision_id is null)
    or (evidence_kind = 'decision' and decision_id is not null and chunk_id is null)
    or (evidence_kind = 'external-candidate' and chunk_id is null and decision_id is null)
  )
);
create index if not exists knowledge_query_evidence_query_idx on knowledge_core.knowledge_query_evidence(query_id, score desc);

create table if not exists knowledge_core.audit_log (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table knowledge_core.knowledge_sources enable row level security;
alter table knowledge_core.knowledge_documents enable row level security;
alter table knowledge_core.knowledge_chunks enable row level security;
alter table knowledge_core.neoos_decisions enable row level security;
alter table knowledge_core.ingestion_jobs enable row level security;
alter table knowledge_core.knowledge_queries enable row level security;
alter table knowledge_core.knowledge_query_evidence enable row level security;
alter table knowledge_core.audit_log enable row level security;

revoke all on all tables in schema knowledge_core from public;
revoke all on all sequences in schema knowledge_core from public;

-- Foundation intentionally exposes no client/database-user policies.
-- Knowledge Core remains server-mediated. Least-privilege runtime roles and
-- consumer-specific policies are added only when the NeoOS identity model is approved.
