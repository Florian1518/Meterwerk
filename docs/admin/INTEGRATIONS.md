# API Keys und Webhooks

API Keys gehören genau einem Tenant, nutzen Scopes, Ablaufdatum, Rotation, Widerruf, Rate Limits und `lastUsedAt`; das Secret wird nur einmal angezeigt. Niemals Query-Parameter oder Logs verwenden. Webhooks prüfen HMAC, Timestamp, Replay-Schutz, Redirect-/SSRF-Schutz, Timeout, Retry und Delivery-ID. Secrets rotieren, alte Zustände kontrolliert auslaufen lassen und Delivery Logs ohne Payload-Secrets prüfen. Beispiele verwenden nur Platzhalter wie `example-secret`.
