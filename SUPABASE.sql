create table if not exists public.app_dados (
  id text primary key,
  dados jsonb not null,
  atualizado_em timestamptz not null default now()
);

-- bloqueia acesso público: só o servidor (chave secret) consegue ler e gravar
alter table public.app_dados enable row level security;
