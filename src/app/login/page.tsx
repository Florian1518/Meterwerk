import { LoginForm } from "@/components/login-form";
import { Zap, ShieldCheck, Activity, Building2 } from "lucide-react";
export default function LoginPage() {
  return (
    <main className="login">
      <section className="login-story">
        <div className="brand">
          <span className="brand-icon">
            <Zap size={24} />
          </span>
          meterwerk<span className="brand-dot">.</span>
        </div>
        <div>
          <span className="eyebrow">
            ENERGIE VERSTEHEN. BESSER ENTSCHEIDEN.
          </span>
          <h1>
            Alle Gebäude.
            <br />
            Alle Zähler.
            <br />
            <em>Ein klarer Blick.</em>
          </h1>
          <p>Die zentrale Plattform für Ihre Energie- und Verbrauchsdaten.</p>
          <div className="login-features">
            <span>
              <Building2 /> Ihr Portfolio im Überblick
            </span>
            <span>
              <Activity /> Verbrauch transparent machen
            </span>
            <span>
              <ShieldCheck /> Sicher nach Mandanten getrennt
            </span>
          </div>
        </div>
        <small>Meterwerk / Smart Metering Platform</small>
      </section>
      <section className="login-panel">
        <LoginForm />
      </section>
    </main>
  );
}
