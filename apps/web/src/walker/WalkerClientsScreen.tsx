import { useEffect, useState } from "react";
import { fetchClients, type WalkerClient } from "../lib/api.js";
import { formatWhen } from "../lib/format.js";
import { Banner } from "../ui/Banner.js";
import { Card } from "../ui/Card.js";
import { EmptyState } from "../ui/EmptyState.js";
import { Toast } from "../ui/Toast.js";
import { PawIcon } from "../ui/icons.js";

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return fallback;
}

function Questionnaire({ client }: { client: WalkerClient }) {
  if (client.profile === null) {
    return <p className="client-card__missing">No questionnaire yet.</p>;
  }

  const rows: Array<[string, string]> = [
    ["Size", client.profile.size],
    ["Temperament", client.profile.temperament],
    ["Energy", client.profile.energy],
    ["Leash trained", client.profile.leashTrained ? "Yes" : "No"],
    ["Allergies", client.profile.allergies ?? "None reported"],
    ["Medical notes", client.profile.medicalNotes ?? "None reported"],
    ["Vet contact", client.profile.vetContact ?? "Not provided"],
    ["Emergency contact", client.profile.emergencyContact ?? "Not provided"],
  ];

  return (
    <dl className="client-card__profile">
      {rows.map(([label, value]) => (
        <div className="client-card__row" key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * S2: the walker's Clients tab — every dog with an accepted request addressed
 * to the caller, with the pin, the formatted time and the full questionnaire
 * (the API applied the privacy gate: only accepted requests arrive, and a
 * cancellation removes the client). Times render through formatWhen; the raw
 * ISO value stays only in the <time dateTime> attribute.
 */
export function WalkerClientsScreen() {
  const [clients, setClients] = useState<WalkerClient[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const loaded = await fetchClients();
        if (isMounted) {
          setClients(loaded);
        }
      } catch (loadError: unknown) {
        if (isMounted) {
          setError(getErrorMessage(loadError, "Unable to load your clients."));
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="clients-screen">
      <Banner
        title="My clients"
        subtitle="Dogs you accepted, with their pin and questionnaire."
        tint="mint"
      />

      {error !== null ? <Toast tone="error" message={error} /> : null}
      {clients === null && error === null ? (
        <p className="app-shell__status">Loading clients...</p>
      ) : null}
      {clients !== null && clients.length === 0 ? (
        <EmptyState
          title="No clients yet"
          message="Accept a request and the dog appears here with its pin and questionnaire."
        />
      ) : null}

      {clients !== null && clients.length > 0 ? (
        <ul className="clients-list">
          {clients.map((client) => (
            <li key={client.requestId}>
              <Card tint="surface" className="client-card">
                <header className="client-card__head">
                  <span className="client-card__icon" aria-hidden="true">
                    <PawIcon />
                  </span>
                  <div className="client-card__heading">
                    <strong className="client-card__name">{client.dogName}</strong>
                    <p className="client-card__meta">
                      <time dateTime={client.requestedTime}>
                        {formatWhen(client.requestedTime)}
                      </time>
                      <span aria-hidden="true"> · </span>
                      <span>
                        {client.pickupLat}, {client.pickupLng}
                      </span>
                    </p>
                  </div>
                </header>
                <Questionnaire client={client} />
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
