import type { Meta } from "@storybook/react-vite";

import { ContactShow } from "./ContactShow";

import { StoryWrapper, buildContact } from "@/test/StoryWrapper";

const meta = {
  title: "Atomic CRM/Contacts/Contact Show",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;

const successContacts = [
  buildContact({
    first_name: "Ada",
    id: 1,
    last_name: "Lovelace",
    last_seen: "2025-01-05T10:00:00.000Z",
    title: "CTO",
  }),
];

// See the note in ContactShow.mobile.stories.tsx — ContactShow needs the route,
// not resource/id props.
export const DesktopSuccess = () => (
  <StoryWrapper
    data={{ contacts: successContacts }}
    initialEntries={["/contacts/1/show"]}
  >
    <ContactShow />
  </StoryWrapper>
);
