-- Alerts for the iPhone web app. An iPhone gets Floor as a web app on its home screen, and a web
-- app's address for alerts is a browser push subscription: a few hundred characters of JSON,
-- longer than the phone apps' addresses. Floor's server sends to it directly (the Web Push
-- standard), not through Expo's service.

alter table public.push_tokens drop constraint push_tokens_token;
alter table public.push_tokens
  add constraint push_tokens_token check (char_length(token) between 10 and 2000);

alter table public.push_tokens drop constraint push_tokens_platform;
alter table public.push_tokens
  add constraint push_tokens_platform check (platform in ('ios', 'android', 'web'));
