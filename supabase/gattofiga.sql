-- =====================================================================
-- GattoFiga Pizza Bar · ajustes do restaurante real
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================

-- 1. Equipe fixa de cada funcionário (Almoço ou Jantar). Quem é de uma
--    equipe não trabalha na outra. Opcional: vazio = sem equipe definida.
alter table funcionarios
  add column if not exists equipe_turno_id uuid references turnos (id) on delete set null;

-- 2. Horários dos turnos (faixa total do turno na grade).
--    Almoço: cozinha 08:00–17:24, salão 09:00–18:24.
--    Jantar: 15:30–00:54. 8h24 de trabalho + 1h de intervalo (42h por semana, 5x2).
insert into turnos (nome, hora_inicio, hora_fim, ordem) values
  ('Almoço', '08:00', '18:24', 1),
  ('Jantar', '15:30', '00:54', 2)
on conflict (nome) do update
  set hora_inicio = excluded.hora_inicio, hora_fim = excluded.hora_fim, ordem = excluded.ordem;

-- 3. Regras de mínimo do GattoFiga (substituem as regras de exemplo).
delete from regras;
insert into regras (dia_semana, turno_id, funcao, minimo)
select null, t.id, r.funcao, r.minimo
from turnos t
join (values
  ('Jantar', 'Pizzaiolo', 2),
  ('Jantar', 'Garçom', 3),
  ('Jantar', 'Bar', 1),
  ('Almoço', 'Cozinheiro', 2),
  ('Almoço', 'Garçom', 1)
) as r (turno, funcao, minimo) on r.turno = t.nome;

-- 4. Configurações da casa.
insert into configuracoes (chave, valor) values
  ('folgas_minimas_semana', '2'),            -- 5x2
  ('bloquear_fechar_e_abrir', 'true'),
  ('dias_fechados', '1'),                    -- segunda-feira (0 = domingo ... 6 = sábado)
  ('dias_sem_folga', '5,6'),                 -- sexta e sábado: ninguém folga
  ('domingos_folga_mes', '1'),               -- cada funcionário folga pelo menos 1 domingo no mês
  ('carga_horaria_semanal', '42')
on conflict (chave) do update set valor = excluded.valor;

-- Dias de pico por turno: Jantar sexta e sábado; Almoço domingo.
insert into configuracoes (chave, valor)
select 'dias_pico', jsonb_build_object(
  (select id::text from turnos where nome = 'Jantar'), jsonb_build_array(5, 6),
  (select id::text from turnos where nome = 'Almoço'), jsonb_build_array(0)
)::text
on conflict (chave) do update set valor = excluded.valor;

-- Horário de cada função dentro do turno (funcao null = todas as outras funções do turno).
insert into configuracoes (chave, valor)
select 'horarios_funcao', jsonb_agg(jsonb_build_object(
  'turno_id', t.id, 'funcao', h.funcao,
  'entrada', h.entrada, 'saida', h.saida,
  'intervalo_inicio', h.ii, 'intervalo_fim', h.iff
))::text
from (values
  ('Almoço', null,         '09:00', '18:24', '10:45', '11:45'),
  ('Almoço', 'Cozinheiro', '08:00', '17:24', '10:45', '11:45'),
  ('Almoço', 'Pizzaiolo',  '08:00', '17:24', '10:45', '11:45'),
  ('Almoço', 'Pia',        '08:00', '17:24', '10:45', '11:45'),
  ('Jantar', null,         '15:30', '00:54', '16:45', '17:45')
) as h (turno, funcao, entrada, saida, ii, iff)
join turnos t on t.nome = h.turno
on conflict (chave) do update set valor = excluded.valor;
