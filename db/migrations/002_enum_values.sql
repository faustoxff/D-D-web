-- New enum values must be committed before anything can use them,
-- so they live in their own migration (each file runs in its own transaction).
alter type item_type add value if not exists 'tool';
alter type item_type add value if not exists 'resource';
alter type tx_type add value if not exists 'sale';
