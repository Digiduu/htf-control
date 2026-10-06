-- Etichetta facoltativa per le versioni salvate manualmente col pulsante
-- "Salva versione di oggi" (vedi pipeline-commerciale/actions.ts): non fa
-- parte dello schema del documento Artifact (data jsonb), è solo
-- un'annotazione di questo sito per distinguere a colpo d'occhio più
-- salvataggi fatti nello stesso giorno o per ricordarne il motivo.
alter table public.pipeline_generations add column if not exists snapshot_label text;

comment on column public.pipeline_generations.snapshot_label is
  'Nome facoltativo assegnato a mano al salvataggio di uno snapshot (pulsante "Salva versione di oggi"). Null per le generazioni importate da fixture/Odoo.';
