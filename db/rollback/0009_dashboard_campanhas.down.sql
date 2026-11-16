-- Reverte a aba Campanhas: apaga os funis criados e o agrupamento manual de campanhas.
-- O dashboard volta a usar só a sugestão por nome. Faça backup antes se já agrupou campanhas.
DROP TABLE IF EXISTS "campanha_funil";
DROP TABLE IF EXISTS "funis_campanha";
