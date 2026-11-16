-- Desfaz 001-views-funil.sql. Só remove o que ele criou. Perde as regras de mapeamento
-- e a configuração de imposto editadas depois (faça backup antes se já editou).
begin;
drop view if exists public.v_gestao_frescor, public.v_gestao_imposto, public.v_gestao_vendas,
  public.v_gestao_funil_dia, public.v_gestao_campanhas;
drop function if exists public.gestao_funil_da_campanha(text, text),
  public.gestao_funil_do_produto(text), public.gestao_cidade_da_campanha(text);
drop table if exists public.config_imposto_meta, public.mapa_produto_funil,
  public.mapa_campanha_funil, public.gestao_funis;
drop owned by leitura_gestao;
drop role if exists leitura_gestao;
commit;
