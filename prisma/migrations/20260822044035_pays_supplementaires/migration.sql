-- Pays qui n'existaient que dans la liste figée du module téléphone.
-- Ils apparaissaient à la saisie d'un numéro sans figurer dans la
-- configuration : les deux listes ne viennent plus que d'ici.
INSERT INTO "Pays" ("id", "nom", "code", "indicatif", "longueurTelephone", "ordre") VALUES
  ('pays_GAMBIE', 'Gambie', 'GM', '+220', 7,  90),
  ('pays_MAROC',  'Maroc',  'MA', '+212', 9, 100),
  ('pays_FRANCE', 'France', 'FR', '+33',  9, 110)
ON CONFLICT ("code") DO NOTHING;
