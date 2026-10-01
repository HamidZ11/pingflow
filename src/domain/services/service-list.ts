import {
  bufferOptions,
  durationOptions,
  type ServiceDraft,
  validateServices,
} from "@/domain/onboarding/setup";

// Settings → Services is saved as one list: what the owner wants their
// services to be. This checks a submitted list before it reaches the
// database (which checks again, inside the transaction).

export type ServiceListItem = ServiceDraft & {
  /** Present for an existing service, absent for a new one. */
  id?: string;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ServiceListCheck =
  { ok: true; services: ServiceListItem[] } | { ok: false; error: string };

export function parseServiceList(value: unknown): ServiceListCheck {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: "Keep at least one service." };
  }
  if (value.length > 20) {
    return { ok: false, error: "Keep it to 20 services or fewer." };
  }

  const services: ServiceListItem[] = [];
  for (const raw of value) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const id = item.id === undefined || item.id === null ? undefined : item.id;
    if (id !== undefined && (typeof id !== "string" || !uuidPattern.test(id))) {
      return { ok: false, error: "One of these services isn’t recognised." };
    }
    const service = {
      id,
      name: typeof item.name === "string" ? item.name.trim() : "",
      durationMinutes: Number(item.durationMinutes),
      bufferMinutes: Number(item.bufferMinutes),
    };
    if (
      !durationOptions.includes(service.durationMinutes) ||
      !bufferOptions.includes(service.bufferMinutes)
    ) {
      return {
        ok: false,
        error: "Choose a length and time after from the lists.",
      };
    }
    services.push(service);
  }

  const ids = services.flatMap((s) => (s.id ? [s.id] : []));
  if (new Set(ids).size !== ids.length) {
    return {
      ok: false,
      error: "A service appears twice. Reload and try again.",
    };
  }

  const { errors, summary } = validateServices(services);
  const firstNameError = errors.find((e) => e.name)?.name;
  if (summary || firstNameError) {
    return { ok: false, error: summary ?? firstNameError! };
  }
  return { ok: true, services };
}

/** The payload `save_services` takes. */
export function toServiceListPayload(services: ServiceListItem[]) {
  return services.map((s) => ({
    id: s.id ?? null,
    name: s.name.trim(),
    duration_minutes: s.durationMinutes,
    buffer_minutes: s.bufferMinutes,
  }));
}
