import { useContext } from "react";

import { SkinProviderContext } from "./skin-context";

export const useSkin = () => useContext(SkinProviderContext);
