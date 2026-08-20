import type { Meta } from "@storybook/react-vite";

import { ContactShow } from "./ContactShow";

import { StoryWrapper, buildContact } from "@/test/StoryWrapper";

const meta = {
  title: "Atomic CRM/Contacts/Contact Show",
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile1", isRotated: false },
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

// ContactShow takes no props — its inner <ShowBase> reads the resource and the
// record id from the router. Passing resource/id as props (as this story used
// to) is dropped by React, leaving ShowBase without a resource and blowing up
// with "useShowController requires a non-empty resource prop or context".
// Entering on the real route gives it both.
export const MobileSuccess = () => (
  <StoryWrapper
    data={{ contacts: successContacts }}
    initialEntries={["/contacts/1/show"]}
  >
    <ContactShow />
  </StoryWrapper>
);
