import {
  EditorPage,
  Section,
  SelectField,
  TemplateField,
  useActionSettings,
} from "@fluxta/sdk/ui";
import {
  ENABLEMENTS,
  ENABLEMENT_LABELS,
  FOLLOWER_ONLY_MODE_DELAY_MAX,
  FOLLOWER_ONLY_MODE_DELAY_MIN,
  NON_MODERATOR_CHAT_DELAYS,
  SLOW_MODE_DELAY_MAX,
  SLOW_MODE_DELAY_MIN,
  type Enablement,
  type UpdateChatSettingsSettings,
} from "platforms-protocol";

const ENABLEMENT_OPTIONS = ENABLEMENTS.map((choice) => ({
  value: choice,
  label: ENABLEMENT_LABELS[choice],
}));

export function UpdateChatSettingsEditor() {
  const { values, set } = useActionSettings<Required<UpdateChatSettingsSettings>>({
    slowMode: "unchanged",
    slowModeDelay: "",
    followerOnlyMode: "unchanged",
    followerOnlyModeDelay: "",
    subscriberOnlyMode: "unchanged",
    emoteOnlyMode: "unchanged",
    uniqueChatMode: "unchanged",
    nonModeratorChatDelay: "unchanged",
    nonModeratorChatDelaySeconds: "",
  });

  return (
    <EditorPage>
      <Section
        title="Slow Mode"
        description="Viewers can only send a message once every so often."
      >
        <SelectField
          label="Slow Mode"
          value={values.slowMode}
          onChange={(value) => set("slowMode")(value as Enablement)}
          options={ENABLEMENT_OPTIONS}
        />
        <TemplateField
          label="Delay, seconds"
          value={values.slowModeDelay}
          onChange={set("slowModeDelay")}
          placeholder="Leave empty to keep the current delay"
          hint={`Between ${SLOW_MODE_DELAY_MIN} and ${SLOW_MODE_DELAY_MAX}. Giving one turns Slow Mode on.`}
        />
      </Section>

      <Section
        title="Follower-Only Mode"
        description="Only viewers who have followed for long enough can chat."
      >
        <SelectField
          label="Follower-Only Mode"
          value={values.followerOnlyMode}
          onChange={(value) => set("followerOnlyMode")(value as Enablement)}
          options={ENABLEMENT_OPTIONS}
        />
        <TemplateField
          label="Must have followed for, minutes"
          value={values.followerOnlyModeDelay}
          onChange={set("followerOnlyModeDelay")}
          placeholder="Leave empty to keep the current delay"
          hint={`Between ${FOLLOWER_ONLY_MODE_DELAY_MIN} and ${FOLLOWER_ONLY_MODE_DELAY_MAX}. Giving one turns Follower-Only Mode on.`}
        />
      </Section>

      <Section title="Subscriber-Only Mode" description="Only Subscribers can chat.">
        <SelectField
          label="Subscriber-Only Mode"
          value={values.subscriberOnlyMode}
          onChange={(value) => set("subscriberOnlyMode")(value as Enablement)}
          options={ENABLEMENT_OPTIONS}
        />
      </Section>

      <Section title="Emote-Only Mode" description="Viewers can only chat with emotes.">
        <SelectField
          label="Emote-Only Mode"
          value={values.emoteOnlyMode}
          onChange={(value) => set("emoteOnlyMode")(value as Enablement)}
          options={ENABLEMENT_OPTIONS}
        />
      </Section>

      <Section title="Unique Chat Mode" description="Twitch's own name for blocking repeated messages.">
        <SelectField
          label="Unique Chat Mode"
          value={values.uniqueChatMode}
          onChange={(value) => set("uniqueChatMode")(value as Enablement)}
          options={ENABLEMENT_OPTIONS}
        />
      </Section>

      <Section
        title="Non-Moderator Chat Delay"
        description="Delays everyone but moderators' messages, to give moderators time to catch trouble before viewers see it."
      >
        <SelectField
          label="Non-Moderator Chat Delay"
          value={values.nonModeratorChatDelay}
          onChange={(value) => set("nonModeratorChatDelay")(value as Enablement)}
          options={ENABLEMENT_OPTIONS}
        />
        <TemplateField
          label="Delay, seconds"
          value={values.nonModeratorChatDelaySeconds}
          onChange={set("nonModeratorChatDelaySeconds")}
          placeholder="Leave empty to keep the current delay"
          hint={`Twitch only accepts ${NON_MODERATOR_CHAT_DELAYS.join(", ")}. Giving one turns it on.`}
        />
      </Section>
    </EditorPage>
  );
}
