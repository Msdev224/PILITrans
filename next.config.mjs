/** @type {import('next').NextConfig} */
const nextConfig = {
  // Un lockfile présent plus haut dans l'arborescence (~/pnpm-lock.yaml) faisait
  // inférer à Next une racine de projet erronée : on la fixe explicitement.
  outputFileTracingRoot: import.meta.dirname,
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};
export default nextConfig;
