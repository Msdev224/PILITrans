/**
 * Coquille d'impression : pas de rail ni de barre haute — la page doit tenir
 * seule sur une feuille A4. Le contrôle d'accès reste assuré par le middleware.
 */
export default function ImpressionLayout({ children }: { children: React.ReactNode }) {
  return <div className="feuille-fond">{children}</div>;
}
