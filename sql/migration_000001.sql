create table `token` (
  -- Ed25519 public key
  `id` char(64) not null primary key,
  `ghid` bigint not null,
  `ghtoken` varchar(255) not null,
  `active` tinyint(1) not null default 1,
  `created_at` datetime(6) not null default current_timestamp(6),
  `last_used_at` datetime(6) not null default current_timestamp(6),
  index by_ghid (ghid)
);

create table `session` (
  `id` char(32) not null primary key,
  `token_id` char(64) not null,
  `ghid` bigint not null,
  `ghlogin` varchar(255) not null,
  `ghdisplayname` varchar(255) not null,
  `active` tinyint(1) not null default 1,
  `created_at` datetime(6) not null default current_timestamp(6),
  `expiry` datetime(6) not null default (date_add(current_timestamp(6), interval 2 hour)),
  index by_token_id (token_id)
);

create view `valid_token` as
  select * from `token`
  where `active` = 1;

create view `valid_session` as
  select * from `session`
  where `active` = 1
    and `expiry` > current_timestamp(6)
    and exists (select 1 from valid_token where id = token_id);

grant select on blueboat.applog_managed to bbcp;
