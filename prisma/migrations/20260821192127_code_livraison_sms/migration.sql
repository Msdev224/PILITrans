-- Code de retrait remis au client, puis saisi par le chauffeur.
ALTER TYPE "EvenementSms" ADD VALUE IF NOT EXISTS 'CLIENT_CODE_LIVRAISON';
