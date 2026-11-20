-- Andén · base de datos en Supabase (plan gratuito)
-- Pega todo este archivo en Supabase → SQL Editor → New query → Run. Se puede ejecutar más de una vez.

-- 1. Histórico de retrasos: una fila por línea cada 15 minutos (de 05:00 a 00:30)
create table if not exists retrasos_linea (
  ts            timestamptz not null default now(),
  red           text not null,          -- madrid, rodalies-catalunya... o "larga-distancia"
  linea         text not null,          -- C3, R2... o AV/LD
  trenes        int  not null,          -- trenes circulando
  con_dato      int  not null,          -- trenes con dato de retraso
  tarde         int  not null,          -- con 3 min o más (5 en larga distancia)
  retraso_medio real,                   -- minutos, media de los que tienen dato
  primary key (ts, red, linea)
);
create index if not exists retrasos_linea_red_linea_ts on retrasos_linea (red, linea, ts desc);

-- Resumen por día (hora de Madrid): lo que leen la página /historico, el CSV y la API
create or replace view retrasos_diarios as
select
  (ts at time zone 'Europe/Madrid')::date            as dia,
  red, linea,
  count(*)                                            as muestras,
  round(avg(trenes)::numeric, 1)                      as trenes_medio,
  round((sum(tarde)::numeric / nullif(sum(con_dato), 0)) * 100, 1) as pct_tarde,
  round((sum(retraso_medio * con_dato) / nullif(sum(con_dato), 0))::numeric, 2) as retraso_medio
from retrasos_linea
group by 1, 2, 3;

-- 2. Alertas por Telegram
create table if not exists alertas (
  id          bigint generated always as identity primary key,
  chat_id     bigint not null,
  red         text not null,
  linea       text not null,
  hora_desde  smallint not null default 0,    -- 0-23, hora de Madrid
  hora_hasta  smallint not null default 24,   -- 1-24
  dias        text not null default '1234567', -- 1 = lunes ... 7 = domingo
  creada      timestamptz not null default now(),
  unique (chat_id, red, linea)
);
create table if not exists alertas_enviadas (
  chat_id  bigint not null,
  clave    text not null,                      -- id del aviso o "retraso:<línea>:<día>"
  ts       timestamptz not null default now(),
  primary key (chat_id, clave)
);

-- Solo el servidor de Andén (clave service_role) puede leer y escribir: nadie más desde fuera
alter table retrasos_linea   enable row level security;
alter table alertas          enable row level security;
alter table alertas_enviadas enable row level security;

-- Limpieza: avisos ya enviados de hace más de 30 días
create or replace function limpiar_alertas_enviadas() returns void language sql as $$
  delete from alertas_enviadas where ts < now() - interval '30 days';
$$;
