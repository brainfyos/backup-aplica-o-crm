-- Contingência manual para um Remix cujo snapshot já contenha a RPC.
-- Este arquivo não é executado automaticamente e não aceita SQL dinâmico.
-- A aplicação normal ocorre por setup-super-admin ou platform-bootstrap.
SELECT public.reconcile_remix_database_contract();
