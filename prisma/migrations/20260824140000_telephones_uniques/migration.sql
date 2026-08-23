-- Un numéro de téléphone identifie une personne : il ne peut pas désigner
-- deux chauffeurs ni deux clients. C'est aussi ce qui permet de rattacher un
-- compte de connexion à une fiche chauffeur sans ambiguïté.
CREATE UNIQUE INDEX "Chauffeur_telephone_key" ON "Chauffeur"("telephone");
CREATE UNIQUE INDEX "Client_telephone_key" ON "Client"("telephone");
