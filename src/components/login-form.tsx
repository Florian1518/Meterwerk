"use client";
import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/app/actions";
import { Button } from "./ui/button";
export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, {});
  return (
    <form action={action} className="login-form">
      <span className="eyebrow">WILLKOMMEN ZURÜCK</span>
      <h2>Bei Meterwerk anmelden</h2>
      <p>Verwalten Sie Ihr Energieportfolio an einem Ort.</p>
      <label>
        E-Mail-Adresse
        <input
          name="email"
          type="email"
          autoComplete="username"
          placeholder="name@unternehmen.de"
          required
        />
      </label>
      <label>
        Passwort
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
        />
      </label>
      <label>
        MFA-Code (falls aktiviert)
        <input
          name="mfaToken"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={32}
        />
      </label>
      <Link href="/password-reset">Passwort vergessen?</Link>
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      <Button disabled={pending} className="w-full">
        {pending ? "Anmeldung läuft …" : "Sicher anmelden →"}
      </Button>
      <small>
        Zugangsdaten erhalten Sie von Ihrer Administration.
        <br />
        Demo-Zugänge sind in der README dokumentiert.
      </small>
    </form>
  );
}
