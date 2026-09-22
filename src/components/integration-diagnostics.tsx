type Key = {
  id: string;
  name: string;
  scopes: string[];
  createdAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};
type Endpoint = {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: Date;
  lastDeliveryAt: Date | null;
};
type Delivery = {
  id: string;
  webhookId: string;
  event: string;
  status: string;
  attempts: number;
  statusCode: number | null;
  error: string | null;
  createdAt: Date;
  lastAttemptAt: Date | null;
};

export function IntegrationDiagnostics({
  keys,
  endpoints,
  deliveries,
}: {
  keys: Key[];
  endpoints: Endpoint[];
  deliveries: Delivery[];
}) {
  return (
    <>
      <section className="panel">
        <h2>Public API-Keys</h2>
        {keys.length === 0 ? (
          <p>Für diesen Tenant sind keine API-Keys angelegt.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Scopes</th>
                  <th scope="col">Erstellt</th>
                  <th scope="col">Letzte Nutzung</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id}>
                    <td>{key.name}</td>
                    <td>{key.scopes.join(", ")}</td>
                    <td>{key.createdAt.toLocaleString("de-DE")}</td>
                    <td>{key.lastUsedAt?.toLocaleString("de-DE") ?? "Nie"}</td>
                    <td>
                      {key.revokedAt
                        ? "Widerrufen"
                        : key.expiresAt && key.expiresAt <= new Date()
                          ? "Abgelaufen"
                          : "Aktiv"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Webhooks</h2>
        {endpoints.length === 0 ? (
          <p>Für diesen Tenant sind keine Webhooks angelegt.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Ziel</th>
                  <th scope="col">Events</th>
                  <th scope="col">Status</th>
                  <th scope="col">Letzte Zustellung</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((endpoint) => (
                  <tr key={endpoint.id}>
                    <td>{endpoint.name}</td>
                    <td>
                      <code>{endpoint.url}</code>
                    </td>
                    <td>{endpoint.events.join(", ")}</td>
                    <td>{endpoint.active ? "Aktiv" : "Inaktiv"}</td>
                    <td>
                      {endpoint.lastDeliveryAt?.toLocaleString("de-DE") ??
                        "Nie"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Letzte Zustellungen</h2>
        {deliveries.length === 0 ? (
          <p>Keine Zustellversuche vorhanden.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Delivery-ID</th>
                  <th scope="col">Event</th>
                  <th scope="col">Status</th>
                  <th scope="col">Versuche</th>
                  <th scope="col">HTTP</th>
                  <th scope="col">Fehler</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td>{delivery.id}</td>
                    <td>{delivery.event}</td>
                    <td>{delivery.status}</td>
                    <td>{delivery.attempts}</td>
                    <td>{delivery.statusCode ?? "–"}</td>
                    <td>{delivery.error ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p>
          Diese Ansicht enthält Diagnosemetadaten. API- und Webhook-Secrets
          werden nicht ausgegeben.
        </p>
      </section>
    </>
  );
}
