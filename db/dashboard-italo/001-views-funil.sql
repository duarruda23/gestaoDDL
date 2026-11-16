-- Dashboard de campanhas por funil: camada de leitura para a gestão Donas de Loja.
--
-- ONDE RODAR: no SQL Editor do Supabase "Dashboard-italo" (ref dhcasfqszrcftgwffere).
-- APLICADO EM PRODUÇÃO em 16/11/2026 (migrações gestao_views_funil e gestao_funcoes_search_path).
-- A role leitura_gestao foi criada SEM senha: falta o Eduardo definir (ver o PR #8).
-- Só cria objetos novos (tabelas mapa_*, config_imposto_meta, views v_gestao_*, role
-- leitura_gestao). Não altera nem apaga nenhuma tabela existente.
-- Rollback: db/dashboard-italo/001-rollback.sql.
--
-- Papel das regras daqui: o funil que as views devolvem para campanhas é só uma SUGESTÃO
-- pelo nome. O agrupamento que o gestor faz na aba Agrupar do app fica no banco da gestão
-- (tabelas funis_campanha e campanha_funil, migração 0009) e vale por cima da sugestão.
-- O funil das VENDAS continua vindo do produto, por mapa_produto_funil.
--
-- Regra de ouro: sales.campaign_id é nulo em todas as vendas, então a venda NÃO é
-- atribuída a campanha. Gasto vem da campanha (tag do nome → funil) e receita vem do
-- produto (nome → funil). O painel rotula isso.

begin;

-- 1. Funis (chaves estáveis usadas pelo app) ---------------------------------------
create table if not exists public.gestao_funis (
  chave text primary key,
  rotulo text not null,
  papel text not null check (papel in ('entrada', 'etapa', 'backend', 'complemento')),
  ordem int not null
);

insert into public.gestao_funis (chave, rotulo, papel, ordem) values
  ('desafio', 'Desafio Venda Todo Dia', 'entrada', 1),
  ('precificacao', 'Workshop de Precificação', 'entrada', 2),
  ('presencial', 'Eventos presenciais', 'entrada', 3),
  ('imersao', 'Imersão de Escala', 'entrada', 4),
  ('form_antes', 'Formulário antes da venda', 'entrada', 5),
  ('live', 'Live Direto ao Ponto', 'entrada', 6),
  ('grupo_vip', 'Grupo VIP', 'etapa', 7),
  ('mentoria', 'Mentoria', 'backend', 8),
  ('analise_perfil', 'Análise de Perfil', 'complemento', 9)
on conflict (chave) do nothing;

-- 2. Regras de classificação, editáveis (não ficam no código) ------------------------
-- Uma regra casa o nome (ILIKE) e aponta o funil. A de menor `prioridade` vence.
-- `campaign_id` explícito (meta_campaign_id) é exceção e vence qualquer padrão.
create table if not exists public.mapa_campanha_funil (
  id uuid primary key default gen_random_uuid(),
  padrao text,
  meta_campaign_id text,
  funil text not null references public.gestao_funis (chave),
  prioridade int not null default 100,
  fora_do_escopo boolean not null default false,
  criado_em timestamptz not null default now(),
  check (padrao is not null or meta_campaign_id is not null)
);

create table if not exists public.mapa_produto_funil (
  id uuid primary key default gen_random_uuid(),
  padrao text not null,
  funil text not null references public.gestao_funis (chave),
  prioridade int not null default 100,
  criado_em timestamptz not null default now()
);

-- Sementes lidas das campanhas e produtos reais em 16/11/2026.
insert into public.mapa_campanha_funil (padrao, funil, prioridade)
select * from (values
  ('%[DESAFIO]%', 'desafio', 10),
  ('%[PRESENCIAL]%', 'presencial', 10)
) v(padrao, funil, prioridade)
where not exists (select 1 from public.mapa_campanha_funil);

insert into public.mapa_produto_funil (padrao, funil, prioridade)
select * from (values
  ('%mentoria%', 'mentoria', 10),
  ('%grupo vip%', 'grupo_vip', 10),
  ('%an_lise de perfil%', 'analise_perfil', 10),
  ('%precifica%', 'precificacao', 10),
  ('%desafio%', 'desafio', 20),
  ('%presencial%', 'presencial', 10),
  ('donas de loja em %', 'presencial', 10),
  ('%imers_o%', 'imersao', 30)
) v(padrao, funil, prioridade)
where not exists (select 1 from public.mapa_produto_funil);

-- 3. Imposto estimado da Meta, versionado por vigência --------------------------------
-- Estimativa: gasto da API × (1 + iss + pis_cofins) em 'soma_simples', ou
-- × (1 + iss) × (1 + pis_cofins) em 'cascata'. Ainda não validado em fatura real.
create table if not exists public.config_imposto_meta (
  id uuid primary key default gen_random_uuid(),
  iss numeric(6, 4) not null,
  pis_cofins numeric(6, 4) not null,
  modo text not null check (modo in ('soma_simples', 'cascata')),
  vigencia_inicio date not null,
  vigencia_fim date,
  fonte text not null default 'estimativa',
  criado_em timestamptz not null default now()
);

insert into public.config_imposto_meta (iss, pis_cofins, modo, vigencia_inicio, fonte)
select 0.0290, 0.0925, 'soma_simples', date '2026-01-01', 'estimativa (spec dashboard eventos, 01/10/2026)'
where not exists (select 1 from public.config_imposto_meta);

-- 4. Funções de classificação -------------------------------------------------------------
create or replace function public.gestao_funil_da_campanha(p_nome text, p_meta_id text)
returns text language sql stable as $$
  select coalesce(
    (select m.funil from public.mapa_campanha_funil m
       where m.meta_campaign_id = p_meta_id and not m.fora_do_escopo limit 1),
    (select m.funil from public.mapa_campanha_funil m
       where m.padrao is not null and not m.fora_do_escopo and p_nome ilike m.padrao
       order by m.prioridade, m.criado_em limit 1)
  );
$$;

create or replace function public.gestao_funil_do_produto(p_nome text)
returns text language sql stable as $$
  select m.funil from public.mapa_produto_funil m
   where p_nome ilike m.padrao
   order by m.prioridade, m.criado_em limit 1;
$$;

-- Cidade do presencial: terceiro colchete de "[Lxx]_[PRESENCIAL]_[CIDADE]_...".
-- Exige o código [Lxx] no início: "[REMARKETING]_[PRESENCIAL]_[CHECKOUT-ABANDONADO]"
-- é presencial, mas "CHECKOUT-ABANDONADO" não é cidade.
create or replace function public.gestao_cidade_da_campanha(p_nome text)
returns text language sql immutable as $$
  select nullif(initcap(replace((regexp_match(p_nome, '^\[L[0-9]+\]_\[PRESENCIAL\]_\[([^\]]+)\]'))[1], '-', ' ')), '');
$$;

alter function public.gestao_funil_da_campanha(text, text) set search_path = public, pg_temp;
alter function public.gestao_funil_do_produto(text) set search_path = public, pg_temp;
alter function public.gestao_cidade_da_campanha(text) set search_path = public, pg_temp;

-- 5. Views que o app lê ----------------------------------------------------------------------
create or replace view public.v_gestao_campanhas as
select
  c.meta_campaign_id,
  c.name as nome,
  c.status,
  c.objective as objetivo,
  public.gestao_funil_da_campanha(c.name, c.meta_campaign_id) as funil,
  public.gestao_cidade_da_campanha(c.name) as cidade,
  coalesce(sum(m.spend), 0) as gasto_total,
  max(m.date) as ultima_data
from public.campaigns c
left join public.campaign_daily_metrics m on m.campaign_id = c.id
group by c.id;

create or replace view public.v_gestao_funil_dia as
select
  m.date as dia,
  c.meta_campaign_id,
  public.gestao_funil_da_campanha(c.name, c.meta_campaign_id) as funil,
  public.gestao_cidade_da_campanha(c.name) as cidade,
  m.spend as gasto,
  m.impressions as impressoes,
  m.clicks as cliques,
  m.reach as alcance
from public.campaign_daily_metrics m
join public.campaigns c on c.id = m.campaign_id;

-- Uma linha por venda, sem e-mail nem nome: o comprador vira um hash.
create or replace view public.v_gestao_vendas as
select
  (s.occurred_at at time zone 'America/Recife')::date as dia,
  public.gestao_funil_do_produto(s.product_name) as funil,
  s.product_name as produto,
  s.status,
  s.currency as moeda,
  s.amount as valor,
  md5(lower(trim(coalesce(s.buyer_email, s.id::text)))) as comprador
from public.sales s;

create or replace view public.v_gestao_imposto as
select iss, pis_cofins, modo, vigencia_inicio, vigencia_fim, fonte
from public.config_imposto_meta;

create or replace view public.v_gestao_frescor as
select
  (select max(date) from public.campaign_daily_metrics) as ultima_metrica,
  (select max(updated_at) from public.campaign_daily_metrics) as ultima_sincronizacao_meta,
  (select max(occurred_at) from public.sales) as ultima_venda;

-- 6. Fechar o acesso público e criar a role só de leitura ------------------------------------
-- No Supabase, objetos novos em public ficam legíveis pelas chaves anon/authenticated da API.
-- Estes objetos têm vendas (comprador em hash) e regras internas: só a role leitura_gestao lê.
alter table public.gestao_funis enable row level security;
alter table public.mapa_campanha_funil enable row level security;
alter table public.mapa_produto_funil enable row level security;
alter table public.config_imposto_meta enable row level security;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table public.gestao_funis, public.mapa_campanha_funil, public.mapa_produto_funil, public.config_imposto_meta, public.v_gestao_campanhas, public.v_gestao_funil_dia, public.v_gestao_vendas, public.v_gestao_imposto, public.v_gestao_frescor from %I', r);
      execute format('revoke all on function public.gestao_funil_da_campanha(text, text), public.gestao_funil_do_produto(text), public.gestao_cidade_da_campanha(text) from %I', r);
    end if;
  end loop;
end $$;
revoke all on function public.gestao_funil_da_campanha(text, text), public.gestao_funil_do_produto(text), public.gestao_cidade_da_campanha(text) from public;

-- Role só de leitura:
-- A senha NÃO fica aqui: o Eduardo define com ALTER ROLE ... PASSWORD no SQL Editor e
-- coloca a URL em DASHBOARD_ITALO_DATABASE_URL, só no .env da VPS.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'leitura_gestao') then
    create role leitura_gestao login nobypassrls;
  end if;
end $$;

grant usage on schema public to leitura_gestao;
revoke all on all tables in schema public from leitura_gestao;
grant select on
  public.v_gestao_campanhas,
  public.v_gestao_funil_dia,
  public.v_gestao_vendas,
  public.v_gestao_imposto,
  public.v_gestao_frescor
to leitura_gestao;
grant execute on function
  public.gestao_funil_da_campanha(text, text),
  public.gestao_funil_do_produto(text),
  public.gestao_cidade_da_campanha(text)
to leitura_gestao;

commit;
