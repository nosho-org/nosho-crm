import type { Meta } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useState } from "react";
import { TaskCreateSheet } from "./TaskCreateSheet";
import { StoryWrapper, buildContact } from "@/test/StoryWrapper";
const meta = {
  title: "Atomic CRM/Tasks/TaskCreateSheet",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;

const defaultData = {
  contacts: [
    buildContact({
      first_name: "Ada",
      id: 1,
      last_name: "Lovelace",
    }),
    buildContact({
      first_name: "Grace",
      id: 2,
      last_name: "Hopper",
    }),
  ],
};
export const Mobile = ({
  children,
  data = defaultData,
}: {
  children?: ReactNode;
  data?: any;
}) => {
  const [open, setOpen] = useState(true);
  return (
    <StoryWrapper data={data}>
      <TaskCreateSheet open={open} onOpenChange={setOpen} />
      {children}
    </StoryWrapper>
  );
};
Mobile.globals = {
  viewport: { value: "mobile1", isRotated: false },
};

const dealData = {
  ...defaultData,
  // Seeded so FakeRest does not hand id 0 to the task the story creates —
  // ra-core rejects a falsy id as "missing id".
  tasks: [
    {
      deal_id: 36,
      due_date: "2026-03-01T12:00:00.000Z",
      id: 1,
      sales_id: 0,
      text: "Tâche déjà au backlog",
      type: "none",
    },
  ],
  deals: [
    {
      amount: 18000,
      category: "dentaire",
      company_id: 1,
      contact_ids: [],
      description: "",
      expected_closing_date: "2026-09-30",
      id: 36,
      index: 0,
      name: "Centre Dentaire Mutualiste",
      sales_id: 0,
      stage: "qualified",
    },
  ],
};

/**
 * Created from an opportunity (#112): the task hangs off `tasks.deal_id`, so no
 * contact is asked for — `TaskFormContent`'s contact autocomplete is
 * `required()` and would block the save of a perfectly valid task.
 */
export const ForDeal = ({
  children,
  data = dealData,
}: {
  children?: ReactNode;
  data?: any;
}) => {
  const [open, setOpen] = useState(true);
  return (
    <StoryWrapper data={data}>
      <TaskCreateSheet open={open} onOpenChange={setOpen} deal_id={36} />
      {children}
    </StoryWrapper>
  );
};
