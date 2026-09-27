-- Fresh local database only. No inherited contacts, accounts or sessions.
update public.sectors set slug = 'wis-5679', display_name = 'WIS · 5679' where slug = 'contable';
