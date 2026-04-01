import type { ServiceContainer } from "../../../types";

function create_service_container(
  parent: ServiceContainer | null = null,
): ServiceContainer {
  return {
    parent,
    values: new Map<string, unknown>(),
  };
}

function service_has(
  container: ServiceContainer | null,
  name: string,
): boolean {
  let current = container;
  while (current) {
    if (current.values.has(name)) return true;
    current = current.parent;
  }
  return false;
}

function service_get(
  container: ServiceContainer | null,
  name: string,
): unknown {
  let current = container;
  while (current) {
    if (current.values.has(name)) return current.values.get(name);
    current = current.parent;
  }
  throw new Error(`[Oxarion] service not found: ${name}`);
}

export { create_service_container, service_get, service_has };
