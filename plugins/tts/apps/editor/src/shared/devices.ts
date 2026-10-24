import type { SelectOption } from "@fluxta/sdk/ui";
import {
  SYSTEM_DEFAULT,
  type DeviceOption,
  type OutputDevice,
} from "tts-protocol";

/** An output device as a SelectField value: System default, or its id. */
export function deviceValue(device: OutputDevice): string {
  return device === SYSTEM_DEFAULT ? SYSTEM_DEFAULT : device.id;
}

/**
 * The device a SelectField value stands for: a listed one, under its name,
 * or `saved` while it is not here.
 */
export function deviceOf(
  value: string,
  devices: readonly DeviceOption[],
  saved: OutputDevice | undefined,
): OutputDevice {
  if (value === SYSTEM_DEFAULT) {
    return SYSTEM_DEFAULT;
  }
  const listed = devices.find(({ id }) => id === value);
  if (listed) {
    return { id: listed.id, name: listed.name };
  }
  return saved !== undefined && saved !== SYSTEM_DEFAULT && saved.id === value
    ? saved
    : { id: value, name: value };
}

/** System default first, then every device, in the OS's order. */
export function deviceOptions(
  devices: readonly DeviceOption[],
): SelectOption[] {
  return [
    { value: SYSTEM_DEFAULT, label: "System default" },
    ...devices.map(({ id, name }) => ({ value: id, label: name })),
  ];
}

/** A saved device as the editors name it, marked when it is not here. */
export function deviceLabel(
  device: OutputDevice,
  devices: readonly DeviceOption[],
): string {
  if (device === SYSTEM_DEFAULT) {
    return "System default";
  }
  return devices.some(({ id }) => id === device.id)
    ? device.name
    : `${device.name}, not available right now`;
}

/**
 * The label of a saved device the list does not hold: its saved name — its
 * id means nothing to a person.
 */
export function missingDevice(
  saved: OutputDevice | undefined,
): (value: string) => string {
  return (value) => {
    const name =
      saved !== undefined && saved !== SYSTEM_DEFAULT && saved.id === value
        ? saved.name
        : value;
    return `${name} — not available right now`;
  };
}

/** Where System default plays right now, for the hint under the field. */
export function systemDefaultNow(
  devices: readonly DeviceOption[],
): string | undefined {
  return devices.find(({ isDefault }) => isDefault)?.name;
}
