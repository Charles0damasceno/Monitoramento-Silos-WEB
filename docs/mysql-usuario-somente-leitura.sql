-- Usuário do MySQL/MariaDB só para o Painel de Silos: pode LER, nunca alterar o banco da IHM.
--
-- Como usar (com um usuário administrador do banco, ex.: no Adminer, HeidiSQL ou no terminal):
--   1. Troque <IP_DO_SERVIDOR_DO_PAINEL> pelo IP do computador onde o painel vai rodar
--      (ou use '%' para aceitar de qualquer IP da rede — menos seguro).
--   2. Troque <SENHA_FORTE> por uma senha longa (16+ caracteres).
--   3. Execute o script.
--   4. No .env do painel: DB_USER=painel_silos e DB_PASSWORD=<SENHA_FORTE>.
--   5. Confira com: npm run diagnostico   (deve mostrar "Usuário do banco é somente leitura")

CREATE USER IF NOT EXISTS 'painel_silos'@'<IP_DO_SERVIDOR_DO_PAINEL>' IDENTIFIED BY '<SENHA_FORTE>';

-- Leitura do nível dos silos e da temperatura
GRANT SELECT ON weintek.silo             TO 'painel_silos'@'<IP_DO_SERVIDOR_DO_PAINEL>';
GRANT SELECT ON weintek.temperatura_silo TO 'painel_silos'@'<IP_DO_SERVIDOR_DO_PAINEL>';

-- Painel da fábrica (opcional: remova se usar PAINEL_FABRICA=false)
GRANT SELECT ON weintek.queijomaticas        TO 'painel_silos'@'<IP_DO_SERVIDOR_DO_PAINEL>';
GRANT SELECT ON weintek.historico_uf1_status TO 'painel_silos'@'<IP_DO_SERVIDOR_DO_PAINEL>';
GRANT SELECT ON weintek.historico_uf1_prod   TO 'painel_silos'@'<IP_DO_SERVIDOR_DO_PAINEL>';
GRANT SELECT ON weintek.historico_uf2_status TO 'painel_silos'@'<IP_DO_SERVIDOR_DO_PAINEL>';
GRANT SELECT ON weintek.historico_uf2_prod   TO 'painel_silos'@'<IP_DO_SERVIDOR_DO_PAINEL>';
GRANT SELECT ON weintek.descargas            TO 'painel_silos'@'<IP_DO_SERVIDOR_DO_PAINEL>';
GRANT SELECT ON weintek.plataforma           TO 'painel_silos'@'<IP_DO_SERVIDOR_DO_PAINEL>';

FLUSH PRIVILEGES;

-- Depois de trocar o painel para este usuário, considere também trocar a senha do usuário
-- "adminer", que estava escrita no código da versão 1.0 (distribuída no arquivo .rar).
