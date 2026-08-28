import { PrismaClient } from "@prisma/client";

import { normaliserTelephone } from "@/lib/telephone";

/**
 * Dérive `telephoneNormalise` de `telephone`, à chaque écriture.
 *
 * Huit endroits du code créent ou modifient un utilisateur — actions, scripts
 * d'administration, jeu de démonstration. Poser la règle sur chacun d'eux,
 * c'est accepter qu'elle soit oubliée au neuvième : un compte dont le numéro
 * normalisé manque ne peut tout simplement plus se connecter, sans message qui
 * l'explique. La dérivation vit donc au seul endroit que toutes les écritures
 * traversent.
 */
function derivé<T extends { telephone?: string | null }>(donnees: T): T {
  if (!donnees || !("telephone" in donnees)) return donnees;
  return {
    ...donnees,
    telephoneNormalise: donnees.telephone ? normaliserTelephone(donnees.telephone) : null,
  };
}

function creerClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  }).$extends({
    query: {
      utilisateur: {
        create({ args, query }) {
          args.data = derivé(args.data as never);
          return query(args);
        },
        update({ args, query }) {
          args.data = derivé(args.data as never);
          return query(args);
        },
        upsert({ args, query }) {
          args.create = derivé(args.create as never);
          args.update = derivé(args.update as never);
          return query(args);
        },
      },
    },
  });
}

// Singleton : en développement, le hot-reload de Next recrée les modules à
// chaque changement — sans cache global on ouvrirait une connexion par reload.
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof creerClient> };

export const prisma = globalForPrisma.prisma ?? creerClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Client transactionnel, dérivé du client réel.
 *
 * `Prisma.TransactionClient` décrit le client *non étendu* : s'en servir ferait
 * échouer la compilation dès qu'une extension est ajoutée. Ce type-ci suit.
 */
export type ClientTransaction = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
