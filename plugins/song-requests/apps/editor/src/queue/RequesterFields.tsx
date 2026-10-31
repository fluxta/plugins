import { TemplateField } from "@fluxta/sdk/ui";

export function RequesterFields({
  platform,
  id,
  onPlatformChange,
  onIdChange,
}: {
  platform: string;
  id: string;
  onPlatformChange: (value: string) => void;
  onIdChange: (value: string) => void;
}) {
  return (
    <>
      <TemplateField
        label="Requester Platform"
        value={platform}
        onChange={onPlatformChange}
        hint="The streaming Platform, such as twitch. Together with the Requester ID, it identifies who asked."
      />
      <TemplateField
        label="Requester ID"
        value={id}
        onChange={onIdChange}
        hint="The Requester's id on that Platform. An empty id matches no Songs."
      />
    </>
  );
}
