import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

// Champs métier portés par l'utilisateur authentifié et par le jeton.
// Ils sont redéclarés dans chaque module plutôt que factorisés dans une
// interface commune : la fusion de déclarations exige des membres explicites.

declare module "next-auth" {
  interface User {
    role: Role;
    chauffeurId?: string | null;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      chauffeurId?: string | null;
    } & DefaultSession["user"];
  }
}

// Le callback `jwt` reçoit le `User | AdapterUser` d'`@auth/core`, distinct de
// celui réexporté par `next-auth` : les trois doivent porter les mêmes champs.
declare module "@auth/core/types" {
  interface User {
    role: Role;
    chauffeurId?: string | null;
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser {
    role: Role;
    chauffeurId?: string | null;
  }
}

// Idem pour le jeton : `next-auth/jwt` réexporte le JWT d'`@auth/core/jwt`,
// qui porte une signature d'index `unknown` — sans cette augmentation, les
// champs relus dans le callback `session` seraient typés `unknown`.
declare module "next-auth/jwt" {
  interface JWT {
    role: Role;
    chauffeurId?: string | null;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role: Role;
    chauffeurId?: string | null;
  }
}
