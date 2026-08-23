-- Le chauffeur déclare lui-même son départ : la mission n'est plus « planifiée »
-- alors que le camion roule déjà vers le point de chargement.
ALTER TYPE "StatutVoyage" ADD VALUE IF NOT EXISTS 'EN_ROUTE_CHARGEMENT' AFTER 'PLANIFIE';
